"""The reader's API: feeds, and the items in the stream."""

import secrets
from datetime import date, datetime
from typing import Annotated, Any, Literal
from zoneinfo import available_timezones

import httpx
from django.db import transaction
from django.db.models import Count, Max, Q, QuerySet
from django.http import HttpRequest, HttpResponse, HttpResponseRedirect
from django.shortcuts import get_object_or_404
from django.utils import timezone
from ninja import Field, Router, Schema, Status
from procrastinate.exceptions import AlreadyEnqueued

from account.auth import Open
from account.models import Preferences
from reader import ask, feeds, icons, images, search, tasks, watches, youtube
from reader.models import Ask, Connection, Digest, Feed, Highlight, Item, Match, Source, Watch

router = Router(tags=["reader"], auth=Open())


class Error(Schema):
    detail: str


class FeedIn(Schema):
    url: str = Field(max_length=1000)


class FeedOut(Schema):
    id: int
    title: str
    url: str
    articles: int
    # How many of those the owner saved, queued or highlighted: they stay if the feed is removed.
    kept: int
    # Why the last fetch failed, or empty.
    problem: str
    # When it was last fetched, whether or not that worked. Null until the first fetch.
    fetched_at: datetime | None


SourceCode = Literal["RD", "X", "IG", "HN", "YT", "RSS"]


class ItemOut(Schema):
    """An item as a row in a list."""

    id: int
    source: SourceCode
    title: str
    # Where it came from: the feed, subreddit, channel or account.
    origin: str
    # A secondary line such as "video 18:24". Often empty.
    sub: str
    replies: int
    published_at: datetime
    minutes: int
    unread: bool
    # When it was saved or queued for later; null if it is not.
    saved_at: datetime | None
    later_at: datetime | None
    media: Literal["Video", "Image"] | None
    # Where its still or picture is, at Munim, for the small box in a row. Null if it has none.
    thumb: str | None
    # Where the icon of the site it came from is, at Munim. Null for a source with no one site.
    icon: str | None


class Span(Schema):
    """A run of text with the same look."""

    text: str
    marks: list[Literal["bold", "italic", "code"]] = []
    # Where it links to, if it is a link.
    href: str | None = None


class Paragraph(Schema):
    type: Literal["paragraph"]
    spans: list[Span]


class Heading(Schema):
    type: Literal["heading"]
    level: Literal[2, 3]
    spans: list[Span]


class Quote(Schema):
    type: Literal["quote"]
    spans: list[Span]


class ListBlock(Schema):
    type: Literal["list"]
    ordered: bool
    items: list[list[Span]]


class Code(Schema):
    type: Literal["code"]
    text: str


class Image(Schema):
    type: Literal["image"]
    src: str
    alt: str


class Video(Schema):
    """A video that can be played where it is, in its source's own player. Until the owner
    plays it only the still is shown, and that comes through Munim like any picture."""

    type: Literal["video"]
    # The still, and what the video is called.
    src: str
    alt: str
    # The video's id at YouTube. The app builds the player's address from it, so it is checked.
    video: str = Field(pattern=r"^[A-Za-z0-9_-]{4,32}$")


Block = Annotated[
    Paragraph | Heading | Quote | ListBlock | Code | Image | Video, Field(discriminator="type")
]


class Comment(Schema):
    who: str
    # A secondary line such as its age: "3h".
    meta: str
    # Nesting level, 0 for a top-level reply.
    depth: int
    blocks: list[Block]


class HighlightPlace(Schema):
    """A highlight as the text it is in needs it: where it is, and its words."""

    id: int
    # Null for the item's own text, or the number of the reply it is in.
    reply: int | None
    # Which run of text there (paragraph, heading, list item), and the characters within it.
    unit: int
    start: int
    end: int
    quote: str


class HighlightIn(Schema):
    reply: int | None = Field(None, ge=0)
    unit: int = Field(ge=0)
    start: int = Field(ge=0)
    end: int = Field(gt=0)
    quote: str = Field(min_length=1, max_length=5000)


class HighlightOut(HighlightPlace):
    """A highlight in the list of them all: with its note and what it was taken from."""

    note: str
    created_at: datetime
    # One of these two: the item it is in, or the question whose answer it is in.
    item_id: int | None
    ask_id: int | None
    # Null for a passage of an answer, which is told by its question: `title` is the question.
    source: SourceCode | None
    title: str
    origin: str
    icon: str | None


class NoteIn(Schema):
    note: str = Field(max_length=2000)


class ItemDetail(ItemOut):
    """An item opened: its own page's address, its text as blocks, and its replies."""

    # Empty if the source gave none.
    url: str
    blocks: list[Block]
    comments: list[Comment]
    highlights: list[HighlightPlace]
    # When it was opened from a search: for each word searched for, in order, the words in
    # this item's text that match it ("movement" may be "movements" here). Empty otherwise.
    found: list[list[str]]


class ItemPatch(Schema):
    """What to change. Anything left out stays as it is."""

    read: bool | None = None
    saved: bool | None = None
    later: bool | None = None


class ConnectionOut(Schema):
    """A source that is switched on as a whole."""

    enabled: bool
    # When it was last fetched; null if it never has been.
    synced_at: datetime | None
    # Why the last fetch failed, or empty.
    problem: str


class ConnectionIn(Schema):
    enabled: bool


class YouTubeOut(Schema):
    """Where the YouTube connection stands. Nothing here is a secret."""

    # The Google Cloud project's client ID and secret have been given.
    configured: bool
    # The owner has signed in to Google, and Munim holds lasting access.
    connected: bool
    # Whose account it is, to show.
    account: str
    synced_at: datetime | None
    # Why the last fetch or sign-in failed, or empty.
    problem: str
    # The address Google sends the owner back to after signing in. It must be listed, exactly,
    # in the Google Cloud project; Google accepts only https addresses or this machine.
    redirect_uri: str
    redirect_ok: bool


class YouTubeCredentials(Schema):
    client_id: str = Field(min_length=10, max_length=300)
    client_secret: str = Field(min_length=10, max_length=300)


class Counts(Schema):
    stream: int
    later: int
    saved: int
    highlights: int
    # Matches this week of the watches that are on.
    watches: int
    # Items per source, for every source, including those with none.
    sources: dict[str, int]


def _thumb(item: Item) -> str | None:
    """The item's first picture, for a video or an image post. It is asked for from this server
    like any picture in an item.

    shortcut: the full-size still, shown small; keep a small one too if lists get slow to load.
    """
    pictures = (b for b in item.blocks if b["type"] in ("image", "video") and b.get("src"))
    return f"/api/items/{item.pk}/images/0" if item.media and next(pictures, None) else None


def _row(item: Item) -> dict[str, Any]:
    return {
        "icon": icons.address_of(item),
        "id": item.pk,
        "source": item.source,
        "title": item.title,
        # A feed article follows its feed's title, so a renamed feed renames its articles.
        "origin": item.feed.title if item.feed else item.origin,
        "sub": item.sub,
        "replies": item.replies,
        "published_at": item.published_at,
        "minutes": feeds.minutes(item.body),
        "unread": item.read_at is None,
        "saved_at": item.saved_at,
        "later_at": item.later_at,
        "media": item.media or None,
        "thumb": _thumb(item),
    }


# An article the owner has done something with. These outlive their feed.
_KEPT = Q(saved_at__isnull=False) | Q(later_at__isnull=False) | Q(highlights__isnull=False)


def _feed_out(feed: Feed) -> FeedOut:
    kept = feed.items.filter(_KEPT).distinct().count()
    return FeedOut(
        id=feed.pk,
        title=feed.title,
        url=feed.url,
        articles=feed.items.count(),
        kept=kept,
        problem=feed.problem,
        fetched_at=feed.fetched_at,
    )


@router.get("/feeds", response=list[FeedOut])
def list_feeds(request: HttpRequest) -> list[FeedOut]:
    return [_feed_out(feed) for feed in Feed.objects.all()]


@router.delete("/feeds/{feed_id}", response={204: None})
def remove_feed(request: HttpRequest, feed_id: int) -> Status[None]:
    """Stops following a feed. Articles the owner saved, queued or highlighted stay, under the
    feed's name; the rest go with it."""
    with transaction.atomic():
        feed = Feed.objects.select_for_update().filter(pk=feed_id).first()
        if feed is None:
            return Status(204, None)
        for item in feed.items.filter(_KEPT).distinct():
            item.feed = None
            item.origin = feed.title[:300]
            # Its own identifier was only unique within the feed.
            item.guid = f"{feed.url} {item.guid}"[:1000]
            item.save(update_fields=["feed", "origin", "guid"])
        feed.delete()
    return Status(204, None)


@router.post("/feeds", response={201: FeedOut, 409: Error, 422: Error})
def add_feed(request: HttpRequest, body: FeedIn) -> Status[FeedOut] | Status[Error]:
    """Fetches the feed first; it is only added if it can be read. The worker keeps it fresh."""
    url = body.url.strip()
    if Feed.objects.filter(url=url).exists():
        return Status(409, Error(detail="That feed is already here."))
    try:
        fetched = feeds.download(url)
        if fetched is None:
            raise feeds.FeedProblem("The feed's server sent nothing.")
        parsed = feeds.parse(fetched.content)
    except feeds.FeedProblem as problem:
        return Status(422, Error(detail=str(problem)))
    feed = Feed(url=url)
    feeds.store(feed, parsed, fetched)
    return Status(201, _feed_out(feed))


# shortcut: a list is capped rather than paged, add paging when a stream outgrows the cap.
MAX_ITEMS = 200


@router.get("/items", response=list[ItemOut])
def list_items(
    request: HttpRequest,
    show: Literal["all", "unread", "saved", "later"] = "all",
    source: SourceCode | None = None,
    feed: int | None = None,
    q: str = "",
) -> list[ItemOut]:
    """Items, newest first. Saved and queued lists are ordered by when that was done."""
    items = Item.objects.select_related("feed")
    if show == "unread":
        items = items.filter(read_at__isnull=True)
    elif show == "saved":
        items = items.filter(saved_at__isnull=False).order_by("-saved_at", "-id")
    elif show == "later":
        items = items.filter(later_at__isnull=False).order_by("-later_at", "-id")
    if source is not None:
        items = items.filter(source=source)
    if feed is not None:
        items = items.filter(feed_id=feed)
    if q.strip():
        together, anywhere = search.matching(q.strip())
        found = items.filter(together)
        if anywhere is not None and not found.exists():
            found = items.filter(anywhere)
        items = found
    return [ItemOut(**_row(item)) for item in items[:MAX_ITEMS]]


@router.get("/items/{item_id}", response=ItemDetail)
def get_item(request: HttpRequest, item_id: int, q: str = "") -> ItemDetail:
    """One item. With `q`, the search it was opened from, it also says which of its words
    matched, so they can be marked where they are."""
    item = get_object_or_404(Item.objects.select_related("feed"), pk=item_id)
    # Validated on the way out: what is stored was written by our own converter, and this
    # checks that it still has the shape the app expects.
    return ItemDetail.model_validate(
        {
            **_row(item),
            "url": item.url,
            "blocks": _shown(item),
            "comments": _comments(item),
            "highlights": list(item.highlights.all()),
            "found": search.found_words(item, q.strip()) if q.strip() else [],
        }
    )


def _age(at: datetime, now: datetime) -> str:
    """ "45m", "3h", "2d": the same short ages the app shows on its rows."""
    minutes = max(0, int((now - at).total_seconds() // 60))
    if minutes < 60:
        return f"{minutes}m"
    if minutes < 60 * 24:
        return f"{minutes // 60}h"
    return f"{minutes // (60 * 24)}d"


def _comments(item: Item) -> list[dict[str, Any]]:
    now = timezone.now()
    return [
        {
            "who": comment["who"],
            "meta": _age(datetime.fromisoformat(comment["at"]), now),
            "depth": comment["depth"],
            # Images reach the browser only through this server, and replies have none.
            "blocks": [block for block in comment["blocks"] if block["type"] != "image"],
        }
        for comment in item.comments
    ]


def _shown(item: Item) -> list[dict[str, Any]]:
    """The item's blocks as the browser gets them: each picture's address is Munim's own, so the
    browser asks this server for it and never the publisher."""
    blocks, images = [], 0
    for block in item.blocks:
        if block["type"] in ("image", "video"):
            block = {**block, "src": f"/api/items/{item.pk}/images/{images}"}
            images += 1
        blocks.append(block)
    return blocks


@router.get("/items/{item_id}/images/{index}", include_in_schema=False)
def get_image(request: HttpRequest, item_id: int, index: int) -> HttpResponse:
    """One of an item's images, fetched through this server and kept on disk."""
    item = get_object_or_404(Item, pk=item_id)
    try:
        content, kind = images.fetch(images.source_of(item, index))
    except images.ImageProblem as problem:
        return HttpResponse(str(problem), status=404, content_type="text/plain")
    response = HttpResponse(content, content_type=kind)
    # It will not change, so the browser may keep it; but only this browser, not a shared cache.
    response["Cache-Control"] = "private, max-age=31536000, immutable"
    # Belt and braces: served only as the picture it claims to be, and inert if opened directly.
    response["X-Content-Type-Options"] = "nosniff"
    response["Content-Security-Policy"] = "default-src 'none'; sandbox"
    return response


def _icon(site: str) -> HttpResponse:
    """A site's icon, fetched through this server and kept on disk."""
    try:
        content, kind = icons.fetch(site)
    except images.ImageProblem as problem:
        response = HttpResponse(str(problem), status=404, content_type="text/plain")
        # The browser need not ask again for every row: the server looks again after a day.
        response["Cache-Control"] = "private, max-age=86400"
        return response
    response = HttpResponse(content, content_type=kind)
    # A site may change its icon, so the browser keeps it for a week, not for ever.
    response["Cache-Control"] = "private, max-age=604800"
    response["X-Content-Type-Options"] = "nosniff"
    response["Content-Security-Policy"] = "default-src 'none'; sandbox"
    return response


@router.get("/sources/{source}/icon", include_in_schema=False)
def source_icon(request: HttpRequest, source: Literal["HN", "YT"]) -> HttpResponse:
    return _icon(icons.SITES[source])


@router.get("/feeds/{feed_id}/icon", include_in_schema=False)
def feed_icon(request: HttpRequest, feed_id: int) -> HttpResponse:
    feed = get_object_or_404(Feed, pk=feed_id)
    return _icon(feed.site_url or feed.url)


@router.patch("/items/{item_id}", response=ItemOut)
def change_item(request: HttpRequest, item_id: int, body: ItemPatch) -> ItemOut:
    """Marks an item read or unread, saved or not, queued for later or not."""
    item = get_object_or_404(Item.objects.select_related("feed"), pk=item_id)
    now = timezone.now()
    for wanted, field in (
        (body.read, "read_at"),
        (body.saved, "saved_at"),
        (body.later, "later_at"),
    ):
        # Asking for what is already so changes nothing, so "saved at" keeps its first time.
        if wanted is not None and wanted != (getattr(item, field) is not None):
            setattr(item, field, now if wanted else None)
    item.save()
    return ItemOut(**_row(item))


def _highlight(highlight: Highlight) -> HighlightOut:
    item, asked = highlight.item, highlight.ask
    return HighlightOut(
        id=highlight.pk,
        reply=highlight.reply,
        unit=highlight.unit,
        start=highlight.start,
        end=highlight.end,
        quote=highlight.quote,
        note=highlight.note,
        created_at=highlight.created_at,
        item_id=highlight.item_id,
        ask_id=highlight.ask_id,
        source=item.source if item else None,  # type: ignore[arg-type]
        title=item.title if item else asked.question if asked else "",
        origin=(item.feed.title if item.feed else item.origin) if item else "Ask",
        icon=icons.address_of(item) if item else None,
    )


_HIGHLIGHTS = Highlight.objects.select_related("item__feed", "ask")


@router.get("/highlights", response=list[HighlightOut])
def list_highlights(request: HttpRequest) -> list[HighlightOut]:
    """Every highlight, newest first."""
    return [_highlight(h) for h in _HIGHLIGHTS.all()]


def _mark(
    body: HighlightIn, item: Item | None = None, asked: Ask | None = None
) -> Status[HighlightOut] | Status[Error]:
    """Marks a passage of an item or of an answer. Marking the same place twice gives back
    the first highlight."""
    quote = body.quote.strip()
    if body.end <= body.start or not quote:
        return Status(422, Error(detail="A highlight needs some text."))
    highlight, _ = Highlight.objects.get_or_create(
        item=item,
        ask=asked,
        reply=body.reply if item else None,
        unit=body.unit,
        start=body.start,
        end=body.end,
        defaults={"quote": quote},
    )
    return Status(201, _highlight(highlight))


@router.post("/items/{item_id}/highlights", response={201: HighlightOut, 422: Error})
def add_highlight(
    request: HttpRequest, item_id: int, body: HighlightIn
) -> Status[HighlightOut] | Status[Error]:
    """Marks a passage of an item's text or of one of its replies."""
    return _mark(body, item=get_object_or_404(Item.objects.select_related("feed"), pk=item_id))


@router.post("/asks/{ask_id}/highlights", response={201: HighlightOut, 422: Error})
def add_answer_highlight(
    request: HttpRequest, ask_id: int, body: HighlightIn
) -> Status[HighlightOut] | Status[Error]:
    """Marks a passage of an answer. `unit` is the number of the line it is in, counting only
    lines that have words."""
    asked = get_object_or_404(Ask, pk=ask_id)
    # An answer still being written may yet be dropped, if its provider fails part way.
    if asked.answered_at is None or not asked.answer:
        return Status(422, Error(detail="There is no finished answer to highlight."))
    return _mark(body, asked=asked)


@router.patch("/highlights/{highlight_id}", response=HighlightOut)
def change_highlight(request: HttpRequest, highlight_id: int, body: NoteIn) -> HighlightOut:
    """Sets the note. An empty note removes it."""
    highlight = get_object_or_404(_HIGHLIGHTS, pk=highlight_id)
    highlight.note = body.note.strip()
    highlight.save(update_fields=["note"])
    return _highlight(highlight)


@router.delete("/highlights/{highlight_id}", response={204: None})
def remove_highlight(request: HttpRequest, highlight_id: int) -> Status[None]:
    Highlight.objects.filter(pk=highlight_id).delete()
    return Status(204, None)


def _connection(connection: Connection | None) -> ConnectionOut:
    if connection is None:
        return ConnectionOut(enabled=False, synced_at=None, problem="")
    return ConnectionOut(
        enabled=connection.enabled, synced_at=connection.synced_at, problem=connection.problem
    )


@router.get("/sources/hacker-news", response=ConnectionOut)
def hacker_news(request: HttpRequest) -> ConnectionOut:
    return _connection(Connection.objects.filter(source=Source.HACKER_NEWS).first())


@router.put("/sources/hacker-news", response=ConnectionOut)
def set_hacker_news(request: HttpRequest, body: ConnectionIn) -> ConnectionOut:
    """Switches Hacker News on or off. Off stops the fetching; what was fetched stays."""
    connection, _ = Connection.objects.update_or_create(
        source=Source.HACKER_NEWS, defaults={"enabled": body.enabled}
    )
    if body.enabled:
        # Fetched now by the worker, not on its next quarter hour and not inside this request.
        # In a transaction of its own: if a fetch is already queued the insert fails, and that
        # must not spoil the request's.
        try:
            with transaction.atomic():
                # The periodic decorator hides the task's arguments from the type checker.
                tasks.poll_hacker_news.defer(timestamp=0)  # type: ignore[call-arg]
        except AlreadyEnqueued:
            pass
    return _connection(connection)


def _return_address(request: HttpRequest) -> str:
    return request.build_absolute_uri("/api/sources/youtube/callback")


def _youtube(request: HttpRequest) -> YouTubeOut:
    found = youtube.connection()
    secrets = youtube.secrets_of(found)
    address = _return_address(request)
    host = request.get_host().split(":")[0]
    return YouTubeOut(
        configured=bool(secrets.get("client_id") and secrets.get("client_secret")),
        connected=bool(secrets.get("refresh_token")),
        account=found.account,
        synced_at=found.synced_at,
        problem=found.problem,
        redirect_uri=address,
        redirect_ok=address.startswith("https://") or host in ("localhost", "127.0.0.1"),
    )


@router.get("/sources/youtube", response=YouTubeOut)
def youtube_state(request: HttpRequest) -> YouTubeOut:
    return _youtube(request)


@router.put("/sources/youtube/credentials", response=YouTubeOut)
def set_youtube_credentials(request: HttpRequest, body: YouTubeCredentials) -> YouTubeOut:
    """Stores the Google Cloud project's client ID and secret, sealed. A sign-in made with other
    credentials is of no use with these, so it is forgotten."""
    found = youtube.connection()
    youtube.keep(
        found,
        client_id=body.client_id.strip(),
        client_secret=body.client_secret.strip(),
        refresh_token=None,
    )
    found.enabled = False
    found.account = ""
    found.problem = ""
    found.save()
    return _youtube(request)


_STATE = "youtube_state"


@router.get("/sources/youtube/start", include_in_schema=False)
def start_youtube(request: HttpRequest) -> HttpResponse:
    """Sends the owner to Google to sign in. Google sends them back to the callback below."""
    client_id = youtube.secrets_of(youtube.connection()).get("client_id")
    if not client_id:
        return HttpResponseRedirect("/connections")
    # Google hands this back; a callback without it did not start here.
    state = secrets.token_urlsafe(32)
    request.session[_STATE] = state
    return HttpResponseRedirect(youtube.authorize_url(client_id, _return_address(request), state))


@router.get("/sources/youtube/callback", include_in_schema=False)
def finish_youtube(
    request: HttpRequest, code: str = "", state: str = "", error: str = ""
) -> HttpResponse:
    """Where Google sends the owner back. Whatever happened is shown on Connections."""
    found = youtube.connection()
    expected = request.session.pop(_STATE, None)
    if not expected or not secrets.compare_digest(state, str(expected)):
        found.problem = "That sign-in did not start here. Connect YouTube again."
    elif error or not code:
        found.problem = "Google sign-in was cancelled."
    else:
        try:
            youtube.connect(found, code, _return_address(request))
        except youtube.Problem as problem:
            found.problem = str(problem)[:300]
        except httpx.HTTPError:
            found.problem = "Google could not be reached."
        else:
            # Fetched now by the worker, not on its next hour and not inside this request.
            try:
                with transaction.atomic():
                    tasks.poll_youtube.defer(timestamp=0)  # type: ignore[call-arg]
            except AlreadyEnqueued:
                pass
            return HttpResponseRedirect("/connections")
    found.save(update_fields=["problem"])
    return HttpResponseRedirect("/connections")


@router.delete("/sources/youtube", response=YouTubeOut)
def disconnect_youtube(request: HttpRequest) -> YouTubeOut:
    """Forgets the Google sign-in. Videos already fetched stay."""
    youtube.disconnect(youtube.connection())
    return _youtube(request)


class AskIn(Schema):
    question: str = Field(min_length=1, max_length=2000)
    scope: Literal["everything", "saved", "week", "item"]
    # The item asked about, when the scope is one item.
    item_id: int | None = None
    # The earlier question this one follows up. It is then asked of what that one was.
    follows: int | None = None


class Cite(Schema):
    """An item an answer cites, as it was when the answer was written."""

    # Null if the item has since been removed.
    item_id: int | None
    source: SourceCode
    title: str
    origin: str
    icon: str | None
    # The words of the item the answer rests on, if the model quoted any that the item has;
    # then `reply` is the number of the reply they are in (null for the item's own text) and
    # `who` wrote that reply.
    quote: str = ""
    reply: int | None = None
    who: str = ""


class AskOut(Schema):
    """A question and its answer. The answer cites items by number: [1] is the first cite."""

    id: int
    question: str
    scope: Literal["everything", "saved", "week", "item"]
    # The earlier question it follows up, if it is a follow-up.
    follows: int | None
    # The one item it was asked about, as that item is now. Null if it was asked of more than
    # one item, or the item has since been removed.
    about: Cite | None
    # Waiting for the worker, answered, or not answered (`problem` says why). While it waits,
    # `answer` is what has been written so far.
    status: Literal["pending", "answered", "failed"]
    answer: str
    problem: str
    cites: list[Cite]
    asked_at: datetime


def _ask(asked: Ask, kept: set[int]) -> AskOut:
    status = "pending" if asked.answered_at is None else "failed" if asked.problem else "answered"
    cites = [
        {**cite, "item_id": cite["item"] if cite["item"] in kept else None} for cite in asked.cites
    ]
    return AskOut.model_validate(
        {
            "id": asked.pk,
            "question": asked.question,
            "scope": asked.scope,
            "follows": asked.follows_id,
            "about": {**ask.told(asked.item), "item_id": asked.item.pk} if asked.item else None,
            "status": status,
            "answer": asked.answer,
            "problem": asked.problem,
            "cites": cites,
            "asked_at": asked.asked_at,
        }
    )


def _asks(asked: list[Ask]) -> list[AskOut]:
    cited = {cite["item"] for one in asked for cite in one.cites}
    kept = set(Item.objects.filter(pk__in=cited).values_list("pk", flat=True))
    return [_ask(one, kept) for one in asked]


# shortcut: the last fifty questions; page through them if anyone wants older ones back.
MOST_ASKS = 50


@router.get("/asks", response=list[AskOut])
def list_asks(request: HttpRequest) -> list[AskOut]:
    """The questions asked, oldest first, as a conversation reads."""
    latest = list(Ask.objects.select_related("item__feed").order_by("-asked_at", "-id")[:MOST_ASKS])
    return _asks(latest[::-1])


@router.post("/asks", response={201: AskOut})
def ask_question(request: HttpRequest, body: AskIn) -> Status[AskOut]:
    """Takes a question. The worker puts it to the model, so the answer comes later; what
    stops it being asked at all (no model, the limit, no item) is its answer at once."""
    wanted = body.item_id if body.scope == "item" else None
    item = Item.objects.filter(pk=wanted).first() if wanted is not None else None
    scope: str = body.scope
    earlier = Ask.objects.filter(pk=body.follows).first() if body.follows is not None else None
    if earlier is not None:
        scope, item = earlier.scope, earlier.item
    elif item is not None:
        # The questions about one item are one conversation: each carries on from the last.
        earlier = Ask.objects.filter(item=item).order_by("-asked_at", "-id").first()
    asked = Ask(question=body.question.strip(), scope=scope, item=item, follows=earlier)
    asked.problem = ask.refusal(asked)
    if asked.problem:
        asked.answered_at = timezone.now()
    asked.save()
    if not asked.problem:
        tasks.answer_ask.defer(ask_id=asked.pk)
    return Status(201, _asks([asked])[0])


class DigestSection(Schema):
    head: str
    text: str
    # The items the text is about, each as it was when the digest was written.
    cites: list[Cite]


class DigestOut(Schema):
    kind: Literal["daily", "weekly"]
    # The date it is for, on the owner's clock.
    day: date
    lead: str
    sections: list[DigestSection]
    # Why nothing was written that day, or empty.
    problem: str
    written_at: datetime


class DigestsOut(Schema):
    """Whether digests are written, and the latest of each kind, if any."""

    on: bool
    daily: DigestOut | None
    weekly: DigestOut | None


class DigestSwitch(Schema):
    on: bool
    # The browser's time zone, as it names it ("Asia/Tokyo"): seven o'clock is the owner's.
    time_zone: str = Field(max_length=64)


def _digests() -> DigestsOut:
    latest = {
        kind: Digest.objects.filter(kind=kind).first()
        for kind in (Digest.Kind.DAILY, Digest.Kind.WEEKLY)
    }
    named = {
        cite["item"]
        for one in latest.values()
        if one
        for section in one.sections
        for cite in section["cites"]
    }
    kept = set(Item.objects.filter(pk__in=named).values_list("pk", flat=True))

    def told(one: Digest | None) -> DigestOut | None:
        if one is None:
            return None
        sections = [
            {
                **section,
                "cites": [
                    {**cite, "item_id": cite["item"] if cite["item"] in kept else None}
                    for cite in section["cites"]
                ],
            }
            for section in one.sections
        ]
        return DigestOut.model_validate(
            {
                "kind": one.kind,
                "day": one.day,
                "lead": one.lead,
                "sections": sections,
                "problem": one.problem,
                "written_at": one.written_at,
            }
        )

    return DigestsOut(
        on=Preferences.load().digest_on,
        daily=told(latest[Digest.Kind.DAILY]),
        weekly=told(latest[Digest.Kind.WEEKLY]),
    )


@router.get("/digests", response=DigestsOut)
def list_digests(request: HttpRequest) -> DigestsOut:
    """The latest daily and weekly digest, and whether they are being written."""
    return _digests()


@router.put("/digests/on", response={200: DigestsOut, 422: Error})
def switch_digests(request: HttpRequest, body: DigestSwitch) -> Status[DigestsOut] | Status[Error]:
    """Switches the writing of digests on or off. Switched on, today's is written by the
    worker at once if it is already past seven where the owner is."""
    if body.time_zone not in available_timezones():
        return Status(422, Error(detail="That is not a time zone Munim knows."))
    prefs = Preferences.load()
    prefs.digest_on, prefs.time_zone = body.on, body.time_zone
    prefs.save(update_fields=["digest_on", "time_zone"])
    if body.on:
        # In a transaction of its own: if the hourly run is already queued the insert fails,
        # and that must not spoil the request's.
        try:
            with transaction.atomic():
                # The periodic decorator hides the task's arguments from the type checker.
                tasks.write_digests.defer(timestamp=0)  # type: ignore[call-arg]
        except AlreadyEnqueued:
            pass
    return Status(200, _digests())


class WatchIn(Schema):
    name: str = Field(min_length=1, max_length=100)
    kind: Literal["keyword", "person", "topic"]


class WatchSwitch(Schema):
    on: bool


class WatchOut(Schema):
    id: int
    name: str
    kind: Literal["keyword", "person", "topic"]
    on: bool
    # How many items matched it this week, and when the latest of them was published.
    week: int
    last: datetime | None
    # Why a topic could not be judged the last time, or empty.
    problem: str


class MatchOut(Schema):
    """An item that matched a watch. A topic's match is a model's judgement."""

    watch: str
    kind: Literal["keyword", "person", "topic"]
    item_id: int
    source: SourceCode
    title: str
    icon: str | None
    published_at: datetime


class WatchesOut(Schema):
    watches: list[WatchOut]
    # The latest matches of the watches that are on, newest item first.
    matches: list[MatchOut]


MOST_MATCHES = 20


def _this_week() -> QuerySet[Match]:
    return Match.objects.filter(item__published_at__gte=timezone.now() - watches.WEEK)


def _watches() -> WatchesOut:
    week = dict(_this_week().values_list("watch").annotate(n=Count("id")))
    last = dict(Match.objects.values_list("watch").annotate(at=Max("item__published_at")))
    latest = (
        Match.objects.filter(watch__on=True)
        .select_related("watch", "item__feed")
        .order_by("-item__published_at", "-id")[:MOST_MATCHES]
    )
    return WatchesOut(
        watches=[
            WatchOut(
                id=w.pk,
                name=w.name,
                kind=w.kind,  # type: ignore[arg-type]
                on=w.on,
                week=week.get(w.pk, 0),
                last=last.get(w.pk),
                problem=w.problem,
            )
            for w in Watch.objects.all()
        ],
        matches=[
            MatchOut(
                watch=m.watch.name,
                kind=m.watch.kind,  # type: ignore[arg-type]
                item_id=m.item.pk,
                source=m.item.source,  # type: ignore[arg-type]
                title=m.item.title,
                icon=icons.address_of(m.item),
                published_at=m.item.published_at,
            )
            for m in latest
        ],
    )


def _look(watch: Watch) -> None:
    """A watch just added or switched on looks at once. By words that is done here, since it
    asks nothing of anyone; a topic is left to the worker, which calls the model."""
    if watch.kind != Watch.Kind.TOPIC:
        watches.check(watch)
        return
    # In a transaction of its own: if the hourly run is already queued the insert fails, and
    # that must not spoil the request's.
    try:
        with transaction.atomic():
            # The periodic decorator hides the task's arguments from the type checker.
            tasks.match_watches.defer(timestamp=0)  # type: ignore[call-arg]
    except AlreadyEnqueued:
        pass


@router.get("/watches", response=WatchesOut)
def list_watches(request: HttpRequest) -> WatchesOut:
    """The watches, and the latest items that matched them."""
    return _watches()


@router.post("/watches", response={201: WatchesOut, 422: Error})
def add_watch(request: HttpRequest, body: WatchIn) -> Status[WatchesOut] | Status[Error]:
    """Adds a watch, which looks back over the past week at once."""
    name = body.name.strip()
    if not name:
        return Status(422, Error(detail="A watch needs a keyword, a person or a topic."))
    if Watch.objects.filter(name__iexact=name).exists():
        return Status(422, Error(detail="There is already a watch for that."))
    _look(Watch.objects.create(name=name, kind=body.kind))
    return Status(201, _watches())


@router.patch("/watches/{watch_id}", response=WatchesOut)
def switch_watch(request: HttpRequest, watch_id: int, body: WatchSwitch) -> WatchesOut:
    """Switches a watch on or off. Off, it looks at nothing and its matches are not shown."""
    watch = get_object_or_404(Watch, pk=watch_id)
    watch.on = body.on
    watch.save(update_fields=["on"])
    if watch.on:
        _look(watch)
    return _watches()


@router.delete("/watches/{watch_id}", response=WatchesOut)
def remove_watch(request: HttpRequest, watch_id: int) -> WatchesOut:
    """Removes a watch and its matches. The items themselves stay."""
    Watch.objects.filter(pk=watch_id).delete()
    return _watches()


@router.get("/counts", response=Counts)
def counts(request: HttpRequest) -> Counts:
    """The numbers beside the sidebar's rows."""
    by_source = dict(Item.objects.values_list("source").annotate(n=Count("id")))
    return Counts(
        stream=Item.objects.count(),
        later=Item.objects.filter(later_at__isnull=False).count(),
        saved=Item.objects.filter(saved_at__isnull=False).count(),
        highlights=Highlight.objects.count(),
        watches=_this_week().filter(watch__on=True).count(),
        sources={code: by_source.get(code, 0) for code in Source.values},
    )
