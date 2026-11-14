"""The reader's API: feeds, and the items in the stream."""

import re
from datetime import datetime
from typing import Annotated, Any, Literal

from django.contrib.postgres.search import SearchQuery
from django.db import transaction
from django.db.models import Count, Q
from django.http import HttpRequest, HttpResponse
from django.shortcuts import get_object_or_404
from django.utils import timezone
from ninja import Field, Router, Schema, Status
from procrastinate.exceptions import AlreadyEnqueued

from account.auth import Open
from reader import feeds, images, tasks
from reader.models import SEARCH_LANGUAGE, Connection, Feed, Item, Source

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
    # Why the last fetch failed, or empty.
    problem: str


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


Block = Annotated[
    Paragraph | Heading | Quote | ListBlock | Code | Image, Field(discriminator="type")
]


class Comment(Schema):
    who: str
    # A secondary line such as its age: "3h".
    meta: str
    # Nesting level, 0 for a top-level reply.
    depth: int
    blocks: list[Block]


class ItemDetail(ItemOut):
    """An item opened: its own page's address, its text as blocks, and its replies."""

    # Empty if the source gave none.
    url: str
    blocks: list[Block]
    comments: list[Comment]


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


class Counts(Schema):
    stream: int
    later: int
    saved: int
    # Items per source, for every source, including those with none.
    sources: dict[str, int]


def _row(item: Item) -> dict[str, Any]:
    return {
        "id": item.pk,
        "source": item.source,
        "title": item.title,
        # A feed article follows its feed's title, so a renamed feed renames its articles.
        "origin": item.feed.title if item.feed else item.origin,
        "sub": "",
        "replies": item.replies,
        "published_at": item.published_at,
        "minutes": feeds.minutes(item.body),
        "unread": item.read_at is None,
        "saved_at": item.saved_at,
        "later_at": item.later_at,
        "media": None,
    }


def _feed_out(feed: Feed, articles: int) -> FeedOut:
    return FeedOut(
        id=feed.pk, title=feed.title, url=feed.url, articles=articles, problem=feed.problem
    )


@router.get("/feeds", response=list[FeedOut])
def list_feeds(request: HttpRequest) -> list[FeedOut]:
    return [_feed_out(f, f.count) for f in Feed.objects.annotate(count=Count("items"))]


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
    return Status(201, _feed_out(feed, feed.items.count()))


_WORD = re.compile(r"[^\W_]+")
# A quoted phrase, an exclusion (-word) or an alternative (OR): the owner is writing a query.
_OPERATORS = re.compile(r'"|(^|\s)-\w|\bor\b', re.IGNORECASE)


def _matching(typed: str) -> tuple[Q, Q | None]:
    """What the search box finds: the first choice, and what to fall back on if that finds
    nothing.

    The words typed are looked for together, in that order, in the title or the text: "movement
    of data" finds the article that says so, not every article with both words somewhere. Only
    if none does are articles with all the words, anywhere, shown instead. Words match in any
    form ("protocols" finds "protocol"); the last may still be being typed, so it also matches
    as the start of a word, never as the middle of one. A feed is found by its own name.
    """
    words = _WORD.findall(typed)
    if _OPERATORS.search(typed) or not words:
        # Phrases, OR and -exclusions, as written. Anything typed is accepted without error.
        written = SearchQuery(typed, search_type="websearch", config=SEARCH_LANGUAGE)
        return Q(search=written), None

    def all_words(joined_by: str) -> Q:
        terms = joined_by.join([*words[:-1], f"{words[-1]}:*"])
        return Q(search=SearchQuery(terms, search_type="raw", config=SEARCH_LANGUAGE))

    # A word half typed is not yet a form the text search knows, so titles are also matched
    # letter by letter from the start of each word.
    in_title, in_feed = Q(), Q()
    for word in words:
        in_title &= Q(title__iregex=rf"\m{word}")
        in_feed &= Q(feed__title__iregex=rf"\m{word}")
    return all_words(" <-> ") | in_feed, all_words(" & ") | in_title | in_feed


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
        together, anywhere = _matching(q.strip())
        found = items.filter(together)
        if anywhere is not None and not found.exists():
            found = items.filter(anywhere)
        items = found
    return [ItemOut(**_row(item)) for item in items[:MAX_ITEMS]]


@router.get("/items/{item_id}", response=ItemDetail)
def get_item(request: HttpRequest, item_id: int) -> ItemDetail:
    item = get_object_or_404(Item.objects.select_related("feed"), pk=item_id)
    # Validated on the way out: what is stored was written by our own converter, and this
    # checks that it still has the shape the app expects.
    return ItemDetail.model_validate(
        {**_row(item), "url": item.url, "blocks": _shown(item), "comments": _comments(item)}
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
    """The item's blocks as the browser gets them: each image's address is Munim's own, so the
    browser asks this server for it and never the publisher."""
    blocks, images = [], 0
    for block in item.blocks:
        if block["type"] == "image":
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


@router.get("/counts", response=Counts)
def counts(request: HttpRequest) -> Counts:
    """The numbers beside the sidebar's rows."""
    by_source = dict(Item.objects.values_list("source").annotate(n=Count("id")))
    return Counts(
        stream=Item.objects.count(),
        later=Item.objects.filter(later_at__isnull=False).count(),
        saved=Item.objects.filter(saved_at__isnull=False).count(),
        sources={code: by_source.get(code, 0) for code in Source.values},
    )
