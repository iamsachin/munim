"""Hacker News: the front page, and each story's discussion.

Stories come from Y Combinator's own API. A discussion comes from HN Search (run by Algolia and
linked from the site's footer), which gives a whole thread in one request where the official
API needs one request per comment.
"""

from datetime import UTC, datetime
from html import escape
from typing import Any

import httpx
from django.utils import timezone
from pydantic import BaseModel, TypeAdapter, ValidationError

from reader import feeds
from reader.blocks import Block, from_html, text_of
from reader.models import Connection, Item, Source

TOP = "https://hacker-news.firebaseio.com/v0/topstories.json"
STORY = "https://hacker-news.firebaseio.com/v0/item/{}.json"
THREAD = "https://hn.algolia.com/api/v1/items/{}"
PAGE = "https://news.ycombinator.com/item?id={}"

STORIES = 30
MAX_COMMENTS = 500


class Story(BaseModel):
    id: int
    type: str = ""
    title: str = ""
    url: str = ""
    text: str = ""
    score: int = 0
    descendants: int = 0
    time: int
    dead: bool = False
    deleted: bool = False


class Reply(BaseModel):
    author: str | None = None
    text: str | None = None
    created_at_i: int | None = None
    children: list["Reply"] = []


def _fetch[T](client: httpx.Client, url: str, shape: type[T]) -> T:
    """What an address returns, checked against the shape it should have."""
    got = feeds.download(url, what="story", client=client)
    try:
        return TypeAdapter(shape).validate_json(got.content if got else b"null")
    except ValidationError:
        raise feeds.FeedProblem("Hacker News sent something Munim could not read.") from None


def _text(html: str, page: str) -> list[Block]:
    # Images never reach the browser from a publisher (see reader/images.py); the site allows
    # none in any case.
    return [block for block in from_html(html, page) if block["type"] != "image"]


def comments(thread: Reply, page: str) -> list[dict[str, Any]]:
    """A discussion flattened in reading order, each reply with how deep it sits."""
    found: list[dict[str, Any]] = []

    def read(replies: list[Reply], depth: int) -> None:
        for reply in replies:
            if len(found) >= MAX_COMMENTS:
                return
            if not (reply.author and reply.text):
                # A deleted reply: its own replies move up into its place.
                read(reply.children, depth)
                continue
            at = datetime.fromtimestamp(reply.created_at_i or 0, UTC)
            found.append(
                {
                    "who": reply.author[:100],
                    "at": at.isoformat(),
                    "depth": depth,
                    "blocks": _text(reply.text, page),
                }
            )
            read(reply.children, depth + 1)

    read(thread.children, 0)
    return found


def _store(client: httpx.Client, number: int) -> None:
    story = _fetch(client, STORY.format(number), Story)
    if story.type != "story" or story.dead or story.deleted or not story.title:
        return
    page = PAGE.format(number)
    item = Item.objects.filter(source=Source.HACKER_NEWS, feed=None, guid=str(number)).first()
    item = item or Item(source=Source.HACKER_NEWS, guid=str(number))

    # The discussion is asked for only if there is one, and again when its size has changed or
    # HN Search, which can be minutes behind the site, has given fewer replies than there are.
    if story.descendants and (
        item.replies != story.descendants
        or len(item.comments) < min(story.descendants, MAX_COMMENTS)
    ):
        try:
            item.comments = comments(_fetch(client, THREAD.format(number), Reply), page)
        except feeds.FeedProblem:
            pass  # HN Search can be minutes behind the site; the next poll asks again.

    # A story is a link, or text, or both. The link goes first, through the same checks as any.
    link = f'<p><a href="{escape(story.url)}">{escape(story.url)}</a></p>' if story.url else ""
    item.blocks = _text(link + story.text, page)
    item.body = text_of(item.blocks)
    item.title = story.title[:500]
    item.url = page
    item.origin = f"{story.score} {'point' if story.score == 1 else 'points'}"
    item.replies = story.descendants
    item.published_at = datetime.fromtimestamp(story.time, UTC)
    item.save()


def refresh() -> None:
    """Fetches the front page again, if the owner has Hacker News switched on."""
    connection = Connection.objects.filter(source=Source.HACKER_NEWS, enabled=True).first()
    if connection is None:
        return
    try:
        with feeds.new_client() as client:
            for number in _fetch(client, TOP, list[int])[:STORIES]:
                try:
                    _store(client, number)
                except feeds.FeedProblem:
                    continue  # One story that cannot be read does not stop the others.
        connection.problem = ""
        connection.synced_at = timezone.now()
    except feeds.FeedProblem as problem:
        connection.problem = str(problem)[:300]
    connection.save()
