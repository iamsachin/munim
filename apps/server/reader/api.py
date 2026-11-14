"""The reader's API: feeds, and the items in the stream."""

from datetime import datetime
from typing import Annotated, Any, Literal

from django.db.models import Count, Q
from django.http import HttpRequest, HttpResponse
from django.shortcuts import get_object_or_404
from django.utils import timezone
from ninja import Field, Router, Schema, Status

from account.auth import Open
from reader import feeds, images
from reader.models import Feed, Item, Source

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


class Comment(Schema):
    who: str
    meta: str
    text: str
    # Nesting level, 0 for a top-level reply.
    depth: int


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


class Counts(Schema):
    stream: int
    later: int
    saved: int
    # Items per source, for every source, including those with none.
    sources: dict[str, int]


def _row(item: Item) -> dict[str, Any]:
    # Feed articles are the only items so far, so the fields other sources will fill are fixed.
    return {
        "id": item.pk,
        "source": item.source,
        "title": item.title,
        "origin": item.feed.title,
        "sub": "",
        "replies": 0,
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
        # shortcut: a plain substring match, replace with Postgres full-text search with Ask.
        items = items.filter(Q(title__icontains=q.strip()) | Q(feed__title__icontains=q.strip()))
    return [ItemOut(**_row(item)) for item in items[:MAX_ITEMS]]


@router.get("/items/{item_id}", response=ItemDetail)
def get_item(request: HttpRequest, item_id: int) -> ItemDetail:
    item = get_object_or_404(Item.objects.select_related("feed"), pk=item_id)
    # Validated on the way out: what is stored was written by our own converter, and this
    # checks that it still has the shape the app expects.
    return ItemDetail.model_validate(
        {**_row(item), "url": item.url, "blocks": _shown(item), "comments": []}
    )


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
