"""The reader's API. So far: RSS feeds and their articles."""

from datetime import datetime, timedelta

from django.db.models import Count
from django.http import HttpRequest
from django.shortcuts import get_object_or_404
from django.utils import timezone
from ninja import Field, Router, Schema, Status

from account.auth import Open
from reader import feeds
from reader.models import Feed

router = Router(tags=["reader"], auth=Open())

STALE_AFTER = timedelta(minutes=15)


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


class ArticleOut(Schema):
    id: int
    title: str
    # The article's own page, or empty if the feed gave none.
    url: str
    published_at: datetime
    minutes: int
    paragraphs: list[str]


def _feed_out(feed: Feed, articles: int) -> FeedOut:
    return FeedOut(
        id=feed.pk, title=feed.title, url=feed.url, articles=articles, problem=feed.problem
    )


@router.get("/feeds", response=list[FeedOut])
def list_feeds(request: HttpRequest) -> list[FeedOut]:
    return [_feed_out(f, f.count) for f in Feed.objects.annotate(count=Count("articles"))]


@router.post("/feeds", response={201: FeedOut, 409: Error, 422: Error})
def add_feed(request: HttpRequest, body: FeedIn) -> Status[FeedOut] | Status[Error]:
    """Fetches the feed first; it is only added if it can be read."""
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
    return Status(201, _feed_out(feed, feed.articles.count()))


@router.post("/feeds/{feed_id}/refresh", response=FeedOut)
def refresh_feed(request: HttpRequest, feed_id: int) -> FeedOut:
    """Fetches the feed again. If that fails, the reason is in `problem`."""
    feed = get_object_or_404(Feed, pk=feed_id)
    feeds.refresh(feed)
    return _feed_out(feed, feed.articles.count())


@router.get("/feeds/{feed_id}/articles", response=list[ArticleOut])
def list_articles(request: HttpRequest, feed_id: int) -> list[ArticleOut]:
    """The feed's newest articles, newest first."""
    feed = get_object_or_404(Feed, pk=feed_id)
    # shortcut: a feed is re-fetched when it is opened and its last fetch is old, so the wait
    # lands on the owner; replace with background polling when the job queue is built.
    if feed.fetched_at is None or timezone.now() - feed.fetched_at > STALE_AFTER:
        feeds.refresh(feed)
    return [
        ArticleOut(
            id=a.pk,
            title=a.title,
            url=a.url,
            published_at=a.published_at,
            minutes=feeds.minutes(a.body),
            paragraphs=[p for p in a.body.split("\n\n") if p],
        )
        for a in feed.articles.all()[: feeds.MAX_ARTICLES]
    ]
