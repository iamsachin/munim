"""Fetching and reading RSS and Atom feeds.

A feed address comes from the owner, but what it leads to does not: the response, any redirect
and every byte of the feed are untrusted. So only http(s) is followed, addresses on private
networks are refused at every hop, and size and time are capped.
"""

import ipaddress
import socket
from dataclasses import dataclass
from datetime import UTC, datetime
from time import struct_time
from urllib.parse import urljoin, urlsplit

import feedparser  # type: ignore[import-untyped]
import httpx
from django.conf import settings
from django.db import transaction
from django.utils import timezone

from reader.blocks import Block, from_html, text_of
from reader.models import Feed, Item

MAX_BYTES = 5_000_000
MAX_REDIRECTS = 5
MAX_ARTICLES = 50
TIMEOUT_SECONDS = 10
WORDS_PER_MINUTE = 230
USER_AGENT = "Munim feed reader"


class FeedProblem(Exception):
    """Why a feed could not be read, in words for the owner."""


@dataclass
class Entry:
    guid: str
    url: str
    title: str
    blocks: list[Block]
    published_at: datetime


@dataclass
class Parsed:
    title: str
    site_url: str
    entries: list[Entry]


@dataclass
class Download:
    content: bytes
    # The media type the server declared, without parameters, in lower case.
    content_type: str
    etag: str
    last_modified: str


# --- fetching


def check_address(url: str) -> None:
    """Refuses anything but a public http(s) address."""
    parts = urlsplit(url)
    if parts.scheme not in ("http", "https") or not parts.hostname:
        raise FeedProblem("A feed address starts with http:// or https://.")
    if settings.ALLOW_PRIVATE_FEEDS:
        return
    try:
        found = socket.getaddrinfo(parts.hostname, parts.port or 443, proto=socket.IPPROTO_TCP)
    except OSError:
        raise FeedProblem("That address could not be found.") from None
    for info in found:
        address = ipaddress.ip_address(info[4][0])
        if not address.is_global:
            # shortcut: the name is looked up again when connecting, so a server that changes
            # its answer between the two could still reach a private address; pin the checked
            # address in the transport if Munim is ever run where that matters.
            raise FeedProblem("That address is on a private network, which is not allowed.")


def new_client() -> httpx.Client:
    """A connection for several downloads in a row. Redirects are never followed for us."""
    return httpx.Client(timeout=TIMEOUT_SECONDS, follow_redirects=False)


def download(
    url: str,
    etag: str = "",
    last_modified: str = "",
    *,
    limit: int = MAX_BYTES,
    what: str = "feed",
    client: httpx.Client | None = None,
) -> Download | None:
    """The bytes at an address, or None if its server says nothing has changed.

    Used for feeds and for the images in them; `what` names the thing in messages.

    Redirects are followed by hand, so each hop is checked like the first address.
    """
    headers = {"User-Agent": USER_AGENT}
    if etag:
        headers["If-None-Match"] = etag
    if last_modified:
        headers["If-Modified-Since"] = last_modified

    own = client is None
    client = client or new_client()
    try:
        for _ in range(MAX_REDIRECTS + 1):
            check_address(url)
            with client.stream("GET", url, headers=headers) as response:
                # 304 first: it is a 3xx too, but means "nothing new", not "look elsewhere".
                if response.status_code == 304:
                    return None
                if response.has_redirect_location:
                    url = urljoin(url, response.headers["Location"])
                    continue
                if response.status_code != 200:
                    raise FeedProblem(f"The {what}'s server answered {response.status_code}.")
                content = b""
                for chunk in response.iter_bytes():
                    content += chunk
                    if len(content) > limit:
                        raise FeedProblem(f"That {what} is too large to read.")
                kind = response.headers.get("Content-Type", "").split(";")[0].strip().lower()
                return Download(
                    content=content,
                    content_type=kind,
                    etag=response.headers.get("ETag", "")[:300],
                    last_modified=response.headers.get("Last-Modified", "")[:100],
                )
        raise FeedProblem("That address redirects too many times.")
    except httpx.TimeoutException:
        raise FeedProblem(f"The {what}'s server took too long to answer.") from None
    except httpx.HTTPError:
        raise FeedProblem(f"The {what}'s server could not be reached.") from None
    finally:
        if own:
            client.close()


# --- reading


def plain(html: str) -> str:
    """One line of plain text from a fragment of HTML, for titles."""
    return " ".join(text_of(from_html(html)).split())


def _when(entry: object) -> datetime:
    for name in ("published_parsed", "updated_parsed"):
        parsed = getattr(entry, name, None) or (entry.get(name) if hasattr(entry, "get") else None)
        if isinstance(parsed, struct_time):
            return datetime(*parsed[:6], tzinfo=UTC)
    return timezone.now()


def parse(content: bytes) -> Parsed:
    """Reads a feed. Raises FeedProblem if the content is not one."""
    document = feedparser.parse(content)
    # An empty response gives a result with no version at all, hence get().
    if not document.get("version"):
        raise FeedProblem("That address is not an RSS or Atom feed.")
    site = str(document.feed.get("link", ""))
    entries: list[Entry] = []
    seen: set[str] = set()
    for item in document.entries[:MAX_ARTICLES]:
        url = str(item.get("link", ""))[:1000]
        if not url.startswith(("http://", "https://")):
            url = ""
        title = plain(str(item.get("title", ""))) or "Untitled"
        guid = str(item.get("id") or url or title)[:1000]
        if guid in seen:
            continue
        seen.add(guid)
        contents = item.get("content") or []
        html = str(contents[0].get("value", "")) if contents else str(item.get("summary", ""))
        entries.append(
            Entry(
                guid=guid,
                url=url,
                title=title[:500],
                # Relative links and images in the entry are relative to its own page.
                blocks=from_html(html, url or site),
                published_at=_when(item),
            )
        )
    return Parsed(
        title=(plain(str(document.feed.get("title", ""))) or "Untitled feed")[:300],
        site_url=site[:1000] if site.startswith(("http://", "https://")) else "",
        entries=entries,
    )


def minutes(body: str) -> int:
    """Reading time, rounded up, and never less than a minute."""
    return max(1, -(-len(body.split()) // WORDS_PER_MINUTE))


# --- storing


def store(feed: Feed, parsed: Parsed, fetched: Download) -> None:
    """Saves a fetched feed and its entries. An entry seen before is updated, not added again."""
    with transaction.atomic():
        feed.title = parsed.title
        feed.site_url = parsed.site_url
        feed.etag = fetched.etag
        feed.last_modified = fetched.last_modified
        feed.fetched_at = timezone.now()
        feed.problem = ""
        feed.save()
        for entry in parsed.entries:
            Item.objects.update_or_create(
                feed=feed,
                guid=entry.guid,
                defaults={
                    "url": entry.url,
                    "title": entry.title,
                    "blocks": entry.blocks,
                    "body": text_of(entry.blocks),
                    "published_at": entry.published_at,
                },
            )


def refresh(feed: Feed, *, client: httpx.Client | None = None) -> None:
    """Fetches a stored feed again. A failure is recorded on the feed, not raised."""
    try:
        fetched = download(feed.url, feed.etag, feed.last_modified, client=client)
        if fetched is None:
            feed.fetched_at = timezone.now()
            feed.problem = ""
            feed.save(update_fields=["fetched_at", "problem"])
            return
        store(feed, parse(fetched.content), fetched)
    except FeedProblem as problem:
        feed.problem = str(problem)[:300]
        feed.save(update_fields=["problem"])


def refresh_all(*, client: httpx.Client | None = None) -> None:
    """Fetches every feed again, one after another. One feed failing does not stop the rest."""
    for feed in Feed.objects.all():
        refresh(feed, client=client)
