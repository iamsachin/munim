"""The pages an item links to: what each is called, so that a link can be shown by its title.

A link is looked at once, by the worker, when an item that has it is opened: its page is
fetched through the same checks as a feed and only its title is kept. The publisher sees
Munim's server, never the owner's browser.
"""

import hashlib
from datetime import timedelta
from html.parser import HTMLParser
from urllib.parse import urlsplit

from django.utils import timezone

from reader import feeds
from reader.models import Item, Link

# A page larger than this is not read at all, and its link keeps its address for a name.
MAX_PAGE_BYTES = 2_000_000
TITLE_CHARACTERS = 200
# How many links one run looks at: the worker has other work, and a long thread has hundreds.
# The rest are looked at by the next run, which the open item asks for.
MOST_AT_ONCE = 15
# A page that could not be read is tried again after this long, not on every opening.
AGAIN_AFTER = timedelta(days=1)


def key_of(href: str) -> str:
    return hashlib.sha256(href.encode()).hexdigest()


def hrefs_of(item: Item) -> list[str]:
    """The addresses an item links to, in its text and in its replies, each once, in the order
    they appear. Only web addresses: nothing else can be fetched or has a site."""
    found: dict[str, None] = {}
    parts = [item.blocks, *(reply["blocks"] for reply in item.comments)]
    for blocks in parts:
        for block in blocks:
            runs = block["items"] if block["type"] == "list" else [block.get("spans", [])]
            for spans in runs:
                for span in spans:
                    href = span.get("href") or ""
                    if urlsplit(href).scheme in ("http", "https") and urlsplit(href).hostname:
                        found[href] = None
    return list(found)


def site_of(href: str) -> str:
    """The front page of the site a link is on, where its icon is asked for."""
    parts = urlsplit(href)
    return f"{parts.scheme}://{parts.netloc}/"


def titles_of(hrefs: list[str]) -> dict[str, str]:
    """The titles already known, by address. A page looked at that had none is known as ''."""
    keys = {key_of(href): href for href in hrefs}
    return {keys[link.key]: link.title for link in Link.objects.filter(key__in=keys)}


def unread(hrefs: list[str]) -> list[str]:
    """The addresses still to be looked at: never yet, or without success more than a day ago."""
    keys = {key_of(href): href for href in hrefs}
    settled = Link.objects.filter(key__in=keys).exclude(
        title="", read_at__lt=timezone.now() - AGAIN_AFTER
    )
    done = set(settled.values_list("key", flat=True))
    return [href for key, href in keys.items() if key not in done]


class _Head(HTMLParser):
    """Finds a page's title: its <title>, or failing that what it says a share should be called."""

    def __init__(self) -> None:
        super().__init__()
        self.title = ""
        self.shared = ""
        self._in_title = False

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if tag == "title" and not self.title:
            self._in_title = True
        elif tag == "meta":
            named = dict(attrs)
            if named.get("property") == "og:title" and not self.shared:
                self.shared = named.get("content") or ""

    def handle_endtag(self, tag: str) -> None:
        if tag == "title":
            self._in_title = False

    def handle_data(self, data: str) -> None:
        if self._in_title:
            self.title += data


def title_in(page: bytes) -> str:
    """The page's title as one line, or '' if it has none. Text only: nothing in it is markup
    by the time it is kept."""
    head = _Head()
    head.feed(page.decode("utf-8", errors="replace"))
    return " ".join((head.title or head.shared).split())[:TITLE_CHARACTERS]


def _title(href: str) -> str:
    try:
        got = feeds.download(href, limit=MAX_PAGE_BYTES, what="page")
    except feeds.FeedProblem:
        return ""
    if got is None or got.content_type not in ("text/html", "application/xhtml+xml"):
        return ""
    return title_in(got.content)


def read(item_id: int) -> None:
    """Looks at some of the links of an item that have not been looked at, and keeps each
    one's title. Safe to run again: what is known is not fetched twice."""
    item = Item.objects.filter(pk=item_id).first()
    if item is None:
        return
    for href in unread(hrefs_of(item))[:MOST_AT_ONCE]:
        Link.objects.update_or_create(
            key=key_of(href),
            defaults={"url": href, "title": _title(href), "read_at": timezone.now()},
        )
