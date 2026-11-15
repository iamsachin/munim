"""Each site's own icon, fetched by the server and kept on disk, as the images in articles are.

The browser never asks a site for its icon: it asks Munim. An icon is looked for the first time
it is wanted: the one the site's front page names, or else its /favicon.ico. A site that has
none Munim can show is remembered for a day, so it is not asked again for every row.
"""

import time
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urljoin

from django.conf import settings

from reader import feeds, images
from reader.models import Item

MAX_ICON_BYTES = 1_000_000
MAX_PAGE_BYTES = 2_000_000
LOOK_AGAIN_AFTER_SECONDS = 24 * 60 * 60

# Icons are often .ico files, which cannot carry script. SVG stays out, as it does for images.
TYPES = images.ALLOWED_TYPES | {"image/x-icon", "image/vnd.microsoft.icon"}

# Where each source that is one site lives.
SITES = {"HN": "https://news.ycombinator.com/", "YT": "https://www.youtube.com/"}

NONE = "That site has no icon Munim can show."


def address_of(item: Item) -> str | None:
    """Where the browser asks Munim for the icon of the item's site: its feed's site, or its
    source's own. An article whose feed was removed has no site left to ask."""
    if item.feed_id:
        return f"/api/feeds/{item.feed_id}/icon"
    return f"/api/sources/{item.source}/icon" if item.source in SITES else None


class _Links(HTMLParser):
    """Collects the addresses of the icons a page names."""

    def __init__(self) -> None:
        super().__init__()
        self.icons: list[str] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        named = dict(attrs)
        href = named.get("href")
        # "icon" and "shortcut icon", not "apple-touch-icon" or "mask-icon".
        if tag == "link" and href and "icon" in (named.get("rel") or "").lower().split():
            self.icons.append(href)


def _named(site: str) -> list[str]:
    """The icons the site's front page names, in its order. None if the page cannot be read."""
    try:
        page = feeds.download(site, limit=MAX_PAGE_BYTES, what="page")
    except feeds.FeedProblem:
        return []
    if page is None:
        return []
    links = _Links()
    links.feed(page.content.decode("utf-8", errors="replace"))
    return [urljoin(site, href) for href in links.icons]


def _place(site: str) -> Path:
    # Under images/, so that deleting everything removes these too.
    return Path(settings.DATA_DIR) / "images" / "icons" / images.name_of(site)


def fetch(site: str) -> tuple[bytes, str]:
    """The icon of the site at this address and its type, from disk if it was fetched before.

    shortcut: an icon is kept for as long as the data folder is, so a site's new icon is not
    noticed; fetch again after a while if that turns out to matter.
    """
    place = _place(site)
    kind_file = place.with_suffix(".type")
    none = place.with_suffix(".none")
    if place.exists() and kind_file.exists():
        return place.read_bytes(), kind_file.read_text()
    if none.exists() and time.time() - none.stat().st_mtime < LOOK_AGAIN_AFTER_SECONDS:
        raise images.ImageProblem(NONE)

    for url in [*_named(site), urljoin(site, "/favicon.ico")]:
        try:
            got = feeds.download(url, limit=MAX_ICON_BYTES, what="icon")
        except feeds.FeedProblem:
            continue
        if got is not None and got.content_type in TYPES:
            images.put(place, got.content)
            images.put(kind_file, got.content_type.encode())
            return got.content, got.content_type

    images.put(none, b"")
    raise images.ImageProblem(NONE)
