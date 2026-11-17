from datetime import timedelta
from typing import Any

import httpx
import pytest
from django.test import Client
from django.utils import timezone

from munim import data
from reader import links
from reader.models import Item, Link
from reader.tasks import read_links

PNG = b"\x89PNG\r\n\x1a\n" + b"\x00" * 64


def linked(text: str, href: str | None) -> dict[str, Any]:
    return {"text": text, "href": href}


@pytest.fixture
def story(owner_client: Client) -> Item:
    """A story whose text and replies link to pages: two of them twice, and one not on the web."""
    blocks = [
        {
            "type": "paragraph",
            "spans": [linked("https://a.example/post", "https://a.example/post")],
        },
        {
            "type": "list",
            "ordered": False,
            "items": [[linked("see ", None), linked("this", "https://b.example/doc.pdf")]],
        },
        {"type": "paragraph", "spans": [linked("write to me", "mailto:someone@a.example")]},
    ]
    reply = {
        "who": "pfk",
        "at": timezone.now().isoformat(),
        "depth": 0,
        "blocks": [
            {
                "type": "paragraph",
                "spans": [
                    linked("again", "https://a.example/post"),
                    linked("gone", "https://c.example/gone"),
                ],
            }
        ],
    }
    return Item.objects.create(
        source="HN",
        guid="1",
        title="Show HN: an archive",
        blocks=blocks,
        comments=[reply],
        published_at=timezone.now(),
    )


@pytest.fixture
def asked(web: Any) -> list[str]:
    """Stands in for the web: a page with a title, a file that is not a page, a page that is
    gone, and a site with an icon."""
    seen: list[str] = []

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append(str(request.url))
        path = request.url.path
        if path == "/post":
            page = "<html><head><title>\n  A year of   feeds </title></head><body><title>no</title>"
            return httpx.Response(200, content=page.encode(), headers={"Content-Type": "text/html"})
        if path == "/doc.pdf":
            return httpx.Response(200, content=b"%PDF", headers={"Content-Type": "application/pdf"})
        if path == "/":
            page = '<link rel="icon" href="/icon.png">'
            return httpx.Response(200, content=page.encode(), headers={"Content-Type": "text/html"})
        if path == "/icon.png":
            return httpx.Response(200, content=PNG, headers={"Content-Type": "image/png"})
        return httpx.Response(404)

    web(handler)
    return seen


def test_a_page_is_called_by_its_title_or_by_what_it_would_be_shared_as() -> None:
    assert (
        links.title_in(b"<title> A  page\n title </title><title>second</title>") == "A page title"
    )
    assert (
        links.title_in(b'<meta property="og:title" content="Shared name"><p>x</p>') == "Shared name"
    )
    # Markup in a title is text by the time it is kept, and a long one is cut.
    assert links.title_in(b"<title>a &lt;b&gt; c</title>") == "a <b> c"
    assert len(links.title_in(b"<title>" + b"x" * 500 + b"</title>")) == 200
    assert links.title_in(b"<p>No title here</p>") == ""


def test_an_opened_item_lists_its_links_and_the_worker_looks_up_their_titles(
    owner_client: Client, story: Item, asked: list[str]
) -> None:
    address = f"/api/items/{story.pk}"
    opened = owner_client.get(address).json()
    # Each web address once, in the order met; not the one that is no web address.
    assert opened["links"] == [
        {"href": "https://a.example/post", "title": "", "icon": f"{address}/links/0/icon"},
        {"href": "https://b.example/doc.pdf", "title": "", "icon": f"{address}/links/1/icon"},
        {"href": "https://c.example/gone", "title": "", "icon": f"{address}/links/2/icon"},
    ]
    assert opened["links_pending"] is True
    # Opening an item fetches nothing: the worker does.
    assert asked == []

    read_links(item_id=story.pk)
    assert asked == [
        "https://a.example/post",
        "https://b.example/doc.pdf",
        "https://c.example/gone",
    ]
    opened = owner_client.get(address).json()
    # A file that is not a page, and a page that is gone, keep their address for a name.
    assert [link["title"] for link in opened["links"]] == ["A year of feeds", "", ""]
    assert opened["links_pending"] is False
    # Looked at once: not again on the next opening, nor by another run.
    read_links(item_id=story.pk)
    assert len(asked) == 3
    # One that could not be read is tried again a day later; one that could is not.
    Link.objects.update(read_at=timezone.now() - timedelta(days=2))
    assert owner_client.get(address).json()["links_pending"] is True
    read_links(item_id=story.pk)
    assert asked[3:] == ["https://b.example/doc.pdf", "https://c.example/gone"]
    # Deleting everything forgets them too: they say what was read.
    data.delete_all()
    assert Link.objects.count() == 0
    read_links(item_id=story.pk)


def test_a_long_thread_is_looked_up_a_few_links_at_a_time(
    owner_client: Client, story: Item, asked: list[str], monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(links, "MOST_AT_ONCE", 2)
    read_links(item_id=story.pk)
    assert len(asked) == 2
    # The open item is still waiting, so it asks again, and the next run does the rest.
    assert owner_client.get(f"/api/items/{story.pk}").json()["links_pending"] is True
    read_links(item_id=story.pk)
    assert len(asked) == 3


def test_a_links_icon_is_its_sites_and_only_a_link_the_item_has_can_be_asked_for(
    owner_client: Client, story: Item, asked: list[str]
) -> None:
    address = f"/api/items/{story.pk}/links"
    got = owner_client.get(f"{address}/0/icon")
    assert (got.status_code, got["Content-Type"], got.content) == (200, "image/png", PNG)
    assert asked == ["https://a.example/", "https://a.example/icon.png"]
    assert owner_client.get(f"{address}/3/icon").status_code == 404
    assert owner_client.get("/api/items/99999/links/0/icon").status_code == 404
    assert len(asked) == 2


def test_links_need_an_open_session(client: Client, story: Item) -> None:
    client.post("/api/sign-out")
    assert client.get(f"/api/items/{story.pk}/links/0/icon").status_code == 401
