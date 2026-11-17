from pathlib import Path
from typing import Any

import httpx
import pytest
from django.test import Client

from reader.models import Feed, Item
from reader.tasks import keep_pictures

from .conftest import post

PNG = b"\x89PNG\r\n\x1a\n" + b"\x00" * 64


@pytest.fixture
def article(owner_client: Client, settings: Any, tmp_path: Path) -> Item:
    """An item with two images, in an install whose files go to a throwaway folder."""
    settings.DATA_DIR = tmp_path
    feed = Feed.objects.create(url="https://site.example/feed", title="A site")
    return Item.objects.create(
        feed=feed,
        guid="one",
        title="With pictures",
        published_at="2026-11-14T06:00:00Z",
        blocks=[
            {"type": "paragraph", "spans": [{"text": "Look."}]},
            {"type": "image", "src": "https://cdn.example/chart.png", "alt": "A chart"},
            {"type": "image", "src": "https://cdn.example/photo.jpg", "alt": ""},
        ],
    )


def serve(kind: str, content: bytes = PNG) -> Any:
    return lambda request: httpx.Response(200, content=content, headers={"Content-Type": kind})


def test_the_browser_is_given_munims_address_for_each_image(
    owner_client: Client, article: Item
) -> None:
    blocks = owner_client.get(f"/api/items/{article.pk}").json()["blocks"]
    assert [b["src"] for b in blocks if b["type"] == "image"] == [
        f"/api/items/{article.pk}/images/0",
        f"/api/items/{article.pk}/images/1",
    ]
    # The publisher's address is not sent to the browser at all.
    assert "cdn.example" not in str(blocks)


def test_an_image_is_fetched_once_and_then_served_from_disk(
    owner_client: Client, article: Item, web: Any
) -> None:
    asked = []

    def handler(request: httpx.Request) -> httpx.Response:
        asked.append(str(request.url))
        return httpx.Response(200, content=PNG, headers={"Content-Type": "image/png; charset=x"})

    web(handler)
    first = owner_client.get(f"/api/items/{article.pk}/images/0")
    assert (first.status_code, first["Content-Type"], first.content) == (200, "image/png", PNG)
    assert first["X-Content-Type-Options"] == "nosniff"
    assert "sandbox" in first["Content-Security-Policy"]
    assert first["Cache-Control"].startswith("private")

    again = owner_client.get(f"/api/items/{article.pk}/images/0")
    assert again.content == PNG
    assert asked == ["https://cdn.example/chart.png"]


@pytest.mark.parametrize(
    "kind", ["image/svg+xml", "text/html", "application/javascript", "application/octet-stream", ""]
)
def test_only_real_picture_types_are_served(
    owner_client: Client, article: Item, web: Any, kind: str
) -> None:
    web(serve(kind, b"<svg onload='steal()'></svg>"))
    response = owner_client.get(f"/api/items/{article.pk}/images/0")
    assert response.status_code == 404
    assert b"<svg" not in response.content


def test_an_image_that_cannot_be_fetched_is_not_found(
    owner_client: Client, article: Item, web: Any
) -> None:
    web(lambda request: httpx.Response(500))
    assert owner_client.get(f"/api/items/{article.pk}/images/0").status_code == 404
    web(serve("image/png", b"x" * 10_000_001))
    assert owner_client.get(f"/api/items/{article.pk}/images/0").status_code == 404
    # A failure is not remembered: it works once the publisher's server does.
    web(serve("image/png"))
    assert owner_client.get(f"/api/items/{article.pk}/images/0").status_code == 200


def test_only_an_items_own_images_can_be_asked_for(owner_client: Client, article: Item) -> None:
    assert owner_client.get(f"/api/items/{article.pk}/images/2").status_code == 404
    assert owner_client.get(f"/api/items/{article.pk}/images/-1").status_code == 404
    assert owner_client.get("/api/items/999999/images/0").status_code == 404


def test_an_image_on_a_private_network_is_not_fetched(
    owner_client: Client, article: Item, web: Any
) -> None:
    article.blocks = [{"type": "image", "src": "http://intranet.example/secret.png", "alt": ""}]
    article.save()
    web(serve("image/png"))
    assert owner_client.get(f"/api/items/{article.pk}/images/0").status_code == 404


def test_images_need_an_open_session(owner_client: Client, article: Item, web: Any) -> None:
    web(serve("image/png"))
    assert Client().get(f"/api/items/{article.pk}/images/0").status_code == 401
    post(owner_client, "lock")
    assert owner_client.get(f"/api/items/{article.pk}/images/0").status_code == 423


def test_saving_an_item_fetches_its_pictures_even_ones_never_shown(
    owner_client: Client, article: Item, web: Any, tmp_path: Path
) -> None:
    asked = []

    def handler(request: httpx.Request) -> httpx.Response:
        asked.append(str(request.url))
        # The second picture cannot be had: the first is kept all the same.
        ok = request.url.path.endswith("chart.png")
        return httpx.Response(
            200 if ok else 404, content=PNG, headers={"Content-Type": "image/png"}
        )

    web(handler)
    saved = owner_client.patch(f"/api/items/{article.pk}", {"saved": True}, "application/json")
    assert saved.status_code == 200
    # Nothing is fetched inside the request: the worker does it.
    assert asked == []
    keep_pictures(item_id=article.pk)
    assert asked == ["https://cdn.example/chart.png", "https://cdn.example/photo.jpg"]
    # It is on disk now, so showing it asks the publisher nothing more.
    assert owner_client.get(f"/api/items/{article.pk}/images/0").content == PNG
    assert len(asked) == 2
    # Run again, as after a crash, only what is missing is asked for; an item since removed
    # is no trouble.
    keep_pictures(item_id=article.pk)
    assert asked[2:] == ["https://cdn.example/photo.jpg"]
    keep_pictures(item_id=99999)
