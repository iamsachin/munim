import io
import json
import zipfile
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import pytest
from django.contrib.auth.models import User
from django.test import Client
from django.utils import timezone

from account.models import Device, Preferences
from ai import spend
from ai.models import FeatureModel, ModelPrice, ProviderKey, Usage
from munim import vault
from reader.models import Ask, Connection, Feed, Highlight, Item

from .conftest import PASSPHRASE, post

SECRET = "sk-proj-" + "a" * 16 + "WXYZ"  # made up, built from parts


@pytest.fixture
def filled(owner_client: Client, settings: Any) -> Client:
    """An install with a feed, two articles (one saved and highlighted), a reply, a source
    switched on, an API key and a fetched image."""
    feed = Feed.objects.create(url="https://wire.example/feed", title="Wire Notes")
    saved = Item.objects.create(
        feed=feed,
        guid="sync",
        url="https://wire.example/sync",
        title="The case for boring sync protocols",
        body="Incremental sync is fast until it is wrong.",
        blocks=[{"type": "paragraph", "spans": [{"text": "Incremental sync is fast."}]}],
        comments=[{"who": "pfk", "at": "2026-11-14T10:00:00+00:00", "depth": 0, "blocks": []}],
        published_at=datetime(2026, 11, 14, 12, 0, tzinfo=UTC),
        saved_at=timezone.now(),
    )
    Item.objects.create(feed=feed, guid="other", title="Unsaved", published_at=timezone.now())
    Highlight.objects.create(
        item=saved, unit=0, start=0, end=11, quote="Incremental", note="Check this."
    )
    Connection.objects.create(source="HN", enabled=True)
    ProviderKey.objects.create(
        provider="openai",
        sealed=vault.seal(SECRET),
        tail="WXYZ",
        ok=True,
        checked_at=timezone.now(),
    )
    FeatureModel.objects.create(feature="ask", provider="openai", model="gpt-example")
    ModelPrice.objects.create(provider="openai", model="gpt-example", input=2, output=8)
    spend.record("ask", "openai", "gpt-example", 1_000_000, 0)
    Ask.objects.create(
        question="What is wrong with sync?",
        scope="saved",
        answer="It is fast until it is wrong [1].",
        cites=[{"item": saved.pk, "source": "RSS", "title": saved.title, "origin": "Wire Notes"}],
        answered_at=timezone.now(),
    )
    images = Path(settings.DATA_DIR) / "images" / "ab"
    images.mkdir(parents=True)
    (images / "abcdef").write_bytes(b"picture")
    return owner_client


def test_the_export_holds_everything_the_owner_put_in_and_no_secrets(filled: Client) -> None:
    response = filled.get("/api/export")
    assert response.status_code == 200
    assert response["Content-Type"] == "application/zip"
    assert response["Content-Disposition"].startswith('attachment; filename="munim-export-')
    content = b"".join(response.streaming_content)  # type: ignore[attr-defined]
    archive = zipfile.ZipFile(io.BytesIO(content))

    def read(name: str) -> Any:
        return json.loads(archive.read(name))

    assert sorted(archive.namelist()) == [
        "README.txt",
        "ai-usage.json",
        "asks.json",
        "digests.json",
        "feeds.json",
        "highlights.json",
        "items.json",
        "saved/" + archive.namelist()[-1].split("/")[-1],
        "settings.json",
    ]
    assert [feed["url"] for feed in read("feeds.json")] == ["https://wire.example/feed"]
    items = {item["title"]: item for item in read("items.json")}
    assert sorted(items) == ["The case for boring sync protocols", "Unsaved"]
    sync = items["The case for boring sync protocols"]
    assert sync["from"] == "Wire Notes"
    assert sync["text"] == "Incremental sync is fast until it is wrong."
    assert sync["blocks"][0]["type"] == "paragraph"
    assert sync["comments"][0]["who"] == "pfk"
    assert sync["saved_at"] is not None
    assert items["Unsaved"]["saved_at"] is None
    assert read("highlights.json") == [
        {
            "item": sync["id"],
            "asked": None,
            "quote": "Incremental",
            "note": "Check this.",
            "created_at": read("highlights.json")[0]["created_at"],
        }
    ]
    assert read("settings.json") == [
        {
            "lock_after_minutes": 15,
            "sources_on": ["HN"],
            "ai_models": {"ask": "openai/gpt-example"},
            "ai_limit": "10.00",
            "digest_on": False,
            "time_zone": "",
            "ai_prices": {"openai/gpt-example": {"input": "2.0000", "output": "8.0000"}},
        }
    ]
    assert read("asks.json") == [
        {
            "question": "What is wrong with sync?",
            "scope": "Saved",
            "answer": "It is fast until it is wrong [1].",
            "cites": ["The case for boring sync protocols"],
            "asked_at": read("asks.json")[0]["asked_at"],
        }
    ]
    (call,) = read("ai-usage.json")
    assert (call["feature"], call["model"], call["tokens_in"]) == ("ask", "gpt-example", 1_000_000)
    assert call["cost"] == "2.000000"
    saved = archive.read(next(n for n in archive.namelist() if n.startswith("saved/"))).decode()
    assert saved.startswith("The case for boring sync protocols\nhttps://wire.example/sync\n\n")

    # Nothing secret, in any file: not the key, not what it is sealed as, not the passphrase.
    sealed = ProviderKey.objects.get().sealed
    whole = b"".join(archive.read(name) for name in archive.namelist()).decode()
    for secret in (SECRET, sealed, "WXYZ", PASSPHRASE, User.objects.get().password):
        assert secret not in whole


def test_an_empty_install_exports_empty_lists(owner_client: Client) -> None:
    content = b"".join(owner_client.get("/api/export").streaming_content)  # type: ignore[attr-defined]
    archive = zipfile.ZipFile(io.BytesIO(content))
    assert json.loads(archive.read("items.json")) == []
    assert json.loads(archive.read("feeds.json")) == []


def delete(client: Client, passphrase: str) -> Any:
    return post(client, "delete-all", {"passphrase": passphrase})


def test_deleting_everything_needs_the_passphrase_and_leaves_the_account(
    filled: Client, settings: Any
) -> None:
    refused = delete(filled, "not the passphrase")
    assert refused.status_code == 403
    assert Item.objects.count() == 2

    assert delete(filled, PASSPHRASE).status_code == 204
    stored = (Item, Feed, Highlight, Connection, ProviderKey, FeatureModel, ModelPrice, Usage, Ask)
    for model in stored:
        assert model.objects.count() == 0, model
    assert not (Path(settings.DATA_DIR) / "images").exists()

    # The owner is still signed in, on the same device, with the same settings and passphrase.
    assert filled.get("/api/session").json()["state"] == "open"
    assert User.objects.count() == 1
    assert Device.objects.count() == 1
    assert Preferences.load().lock_after_minutes == 15
    assert Preferences.load().ai_limit == 10
    assert filled.get("/api/items").json() == []
    # Deleting again, with nothing there, is not an error.
    assert delete(filled, PASSPHRASE).status_code == 204


def test_the_passphrase_for_deleting_cannot_be_guessed_at_speed(filled: Client) -> None:
    for _ in range(3):
        assert delete(filled, "wrong").status_code == 403
    waiting = delete(filled, PASSPHRASE)
    assert waiting.status_code == 429
    assert waiting.json()["wait_seconds"] > 0
    assert Item.objects.count() == 2


def test_export_and_delete_need_an_open_session(client: Client, filled: Client) -> None:
    post(filled, "lock")
    assert filled.get("/api/export").status_code == 423
    assert delete(filled, PASSPHRASE).status_code == 423
    post(filled, "sign-out")
    assert client.get("/api/export").status_code == 401
    assert delete(client, PASSPHRASE).status_code == 401
    assert Item.objects.count() == 2
