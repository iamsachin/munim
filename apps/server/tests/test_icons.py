from pathlib import Path
from typing import Any

import httpx
import pytest
from django.test import Client

from reader.models import Feed, Highlight, Item

PNG = b"\x89PNG\r\n\x1a\n" + b"\x00" * 64
ICO = b"\x00\x00\x01\x00" + b"\x00" * 64
PAGE = b"""<html><head>
<link rel="apple-touch-icon" href="/touch.png">
<link rel="SHORTCUT ICON" href="/static/site.png">
</head><body>A site</body></html>"""


@pytest.fixture
def feed(owner_client: Client, settings: Any, tmp_path: Path) -> Feed:
    settings.DATA_DIR = tmp_path
    return Feed.objects.create(
        url="https://feeds.example/site.xml", title="A site", site_url="https://site.example/blog"
    )


def site(pages: dict[str, tuple[str, bytes]]) -> Any:
    """A stand-in for the outside world: the pages it has, by address, and what was asked."""
    asked: list[str] = []

    def handler(request: httpx.Request) -> httpx.Response:
        asked.append(str(request.url))
        if str(request.url) not in pages:
            return httpx.Response(404)
        kind, content = pages[str(request.url)]
        return httpx.Response(200, content=content, headers={"Content-Type": kind})

    handler.asked = asked  # type: ignore[attr-defined]
    return handler


def test_a_feeds_icon_is_the_one_its_site_names_fetched_once(
    owner_client: Client, feed: Feed, web: Any
) -> None:
    item = Item.objects.create(
        feed=feed, guid="one", title="An article", published_at="2026-11-14T06:00:00Z"
    )
    Highlight.objects.create(item=item, unit=0, start=0, end=2, quote="An")
    # The browser is given Munim's address for it, never the site's.
    address = f"/api/feeds/{feed.pk}/icon"
    assert owner_client.get("/api/items").json()[0]["icon"] == address
    assert owner_client.get("/api/highlights").json()[0]["icon"] == address

    world = site(
        {
            "https://site.example/blog": ("text/html", PAGE),
            "https://site.example/static/site.png": ("image/png", PNG),
        }
    )
    web(world)
    got = owner_client.get(address)
    assert got.status_code == 200
    assert (got.content, got["Content-Type"]) == (PNG, "image/png")
    assert got["Cache-Control"] == "private, max-age=604800"
    assert got["X-Content-Type-Options"] == "nosniff"
    # The page, then the icon it names; the touch icon is not one, and nothing else is asked.
    assert world.asked == ["https://site.example/blog", "https://site.example/static/site.png"]

    assert owner_client.get(address).content == PNG
    assert len(world.asked) == 2


def test_a_site_that_names_no_icon_is_asked_for_its_favicon(
    owner_client: Client, feed: Feed, web: Any
) -> None:
    world = site(
        {
            "https://site.example/blog": ("text/html", b"<html><body>No head</body></html>"),
            "https://site.example/favicon.ico": ("image/x-icon", ICO),
        }
    )
    web(world)
    got = owner_client.get(f"/api/feeds/{feed.pk}/icon")
    assert (got.content, got["Content-Type"]) == (ICO, "image/x-icon")
    assert world.asked[-1] == "https://site.example/favicon.ico"

    # A feed that does not say where its site is: the favicon of where the feed is.
    other = Feed.objects.create(url="https://plain.example/feed.xml", title="Plain")
    world = site({"https://plain.example/favicon.ico": ("image/vnd.microsoft.icon", ICO)})
    web(world)
    assert owner_client.get(f"/api/feeds/{other.pk}/icon").status_code == 200


def test_a_site_with_no_icon_munim_can_show_is_not_asked_again_that_day(
    owner_client: Client, feed: Feed, web: Any
) -> None:
    # Its only icon is an SVG, which can carry script, so it is not served.
    world = site(
        {
            "https://site.example/blog": ("text/html", b'<link rel="icon" href="/icon.svg">'),
            "https://site.example/icon.svg": ("image/svg+xml", b"<svg/>"),
        }
    )
    web(world)
    refused = owner_client.get(f"/api/feeds/{feed.pk}/icon")
    assert refused.status_code == 404
    assert refused.content == b"That site has no icon Munim can show."
    assert refused["Cache-Control"] == "private, max-age=86400"
    asked = len(world.asked)
    assert asked == 3

    assert owner_client.get(f"/api/feeds/{feed.pk}/icon").status_code == 404
    assert len(world.asked) == asked


def test_hacker_news_and_youtube_have_their_own_sites_icons(
    owner_client: Client, feed: Feed, web: Any
) -> None:
    for source in ("HN", "YT", "X"):
        Item.objects.create(
            source=source, guid=source, title=source, published_at="2026-11-14T06:00:00Z"
        )
    icons = {row["source"]: row["icon"] for row in owner_client.get("/api/items").json()}
    # X has no site this install asks for an icon: its posts show X's own mark.
    assert icons == {"HN": "/api/sources/HN/icon", "YT": "/api/sources/YT/icon", "X": None}

    world = site(
        {
            "https://news.ycombinator.com/favicon.ico": ("image/x-icon", ICO),
            "https://www.youtube.com/favicon.ico": ("image/x-icon", ICO + b"yt"),
        }
    )
    web(world)
    assert owner_client.get("/api/sources/HN/icon").content == ICO
    assert owner_client.get("/api/sources/YT/icon").content == ICO + b"yt"
    assert owner_client.get("/api/sources/RD/icon").status_code == 422
    assert owner_client.get("/api/feeds/99999/icon").status_code == 404


def test_an_icon_on_a_private_network_is_not_fetched(
    owner_client: Client, settings: Any, tmp_path: Path, web: Any
) -> None:
    settings.DATA_DIR = tmp_path
    inside = Feed.objects.create(
        url="https://feeds.example/x.xml", site_url="http://intranet.example/"
    )
    world = site({"http://intranet.example/favicon.ico": ("image/x-icon", ICO)})
    web(world)
    assert owner_client.get(f"/api/feeds/{inside.pk}/icon").status_code == 404
    assert world.asked == []


def test_icons_need_an_open_session(client: Client, db: None, web: Any) -> None:
    world = site({})
    web(world)
    assert client.get("/api/sources/HN/icon").status_code == 401
    assert client.get("/api/feeds/1/icon").status_code == 401
    assert world.asked == []
