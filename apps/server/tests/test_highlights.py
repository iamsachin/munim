from datetime import UTC, datetime
from typing import Any

import pytest
from django.test import Client
from django.utils import timezone

from reader.models import Ask, Feed, Highlight, Item

QUOTE = "wrong silently"


@pytest.fixture
def article(owner_client: Client) -> Item:
    feed = Feed.objects.create(url="https://wire.example/feed", title="Wire Notes")
    return Item.objects.create(
        feed=feed,
        guid="sync",
        title="The case for boring sync protocols",
        body="Incremental sync is fast until it is wrong, and then it is wrong silently.",
        published_at=datetime(2026, 11, 14, 12, 0, tzinfo=UTC),
    )


def mark(client: Client, item: Item, **place: Any) -> Any:
    body = {"unit": 0, "start": 58, "end": 72, "quote": QUOTE, **place}
    return client.post(f"/api/items/{item.pk}/highlights", body, "application/json")


def test_a_passage_is_marked_and_listed_with_what_it_came_from(
    owner_client: Client, article: Item
) -> None:
    made = mark(owner_client, article)
    assert made.status_code == 201
    highlight = made.json()
    assert highlight == {
        "id": highlight["id"],
        "reply": None,
        "unit": 0,
        "start": 58,
        "end": 72,
        "quote": QUOTE,
        "note": "",
        "created_at": highlight["created_at"],
        "item_id": article.pk,
        "ask_id": None,
        "source": "RSS",
        "title": "The case for boring sync protocols",
        "origin": "Wire Notes",
        "icon": f"/api/feeds/{article.feed_id}/icon",
    }
    assert owner_client.get("/api/highlights").json() == [highlight]
    assert owner_client.get("/api/counts").json()["highlights"] == 1

    # The item itself says where its highlights are, so they can be marked in its text.
    opened = owner_client.get(f"/api/items/{article.pk}").json()
    assert opened["highlights"] == [
        {"id": highlight["id"], "reply": None, "unit": 0, "start": 58, "end": 72, "quote": QUOTE}
    ]


def test_the_same_place_is_not_marked_twice_but_another_place_is(
    owner_client: Client, article: Item
) -> None:
    first = mark(owner_client, article).json()
    assert mark(owner_client, article).json()["id"] == first["id"]
    in_a_reply = mark(owner_client, article, reply=2).json()
    assert in_a_reply["id"] != first["id"]
    assert in_a_reply["reply"] == 2
    # Newest first.
    assert [h["id"] for h in owner_client.get("/api/highlights").json()] == [
        in_a_reply["id"],
        first["id"],
    ]


def test_a_note_can_be_set_changed_and_cleared(owner_client: Client, article: Item) -> None:
    highlight = mark(owner_client, article).json()

    def note(text: str) -> Any:
        return owner_client.patch(
            f"/api/highlights/{highlight['id']}", {"note": text}, "application/json"
        )

    assert note("  Good argument for a weekly full check. ").json()["note"] == (
        "Good argument for a weekly full check."
    )
    assert note("").json()["note"] == ""
    assert note("x" * 2001).status_code == 422
    assert (
        owner_client.patch("/api/highlights/0", {"note": "x"}, "application/json").status_code
        == 404
    )


def test_a_highlight_can_be_removed_and_goes_with_its_item(
    owner_client: Client, article: Item
) -> None:
    highlight = mark(owner_client, article).json()
    assert owner_client.delete(f"/api/highlights/{highlight['id']}").status_code == 204
    assert owner_client.get("/api/highlights").json() == []
    # Removing what is not there is not an error.
    assert owner_client.delete(f"/api/highlights/{highlight['id']}").status_code == 204

    mark(owner_client, article)
    article.delete()
    assert Highlight.objects.count() == 0


@pytest.mark.parametrize(
    "place",
    [
        {"start": 10, "end": 10},
        {"start": 10, "end": 5},
        {"quote": "   "},
        {"quote": ""},
        {"unit": -1},
        {"quote": "x" * 5001},
    ],
)
def test_a_highlight_needs_some_text_in_a_real_place(
    owner_client: Client, article: Item, place: dict[str, Any]
) -> None:
    assert mark(owner_client, article, **place).status_code == 422
    assert Highlight.objects.count() == 0


def test_highlights_need_an_open_session_and_a_real_item(
    client: Client, owner_client: Client, article: Item
) -> None:
    assert (
        owner_client.post(
            "/api/items/0/highlights",
            {"unit": 0, "start": 0, "end": 1, "quote": "x"},
            "application/json",
        ).status_code
        == 404
    )
    owner_client.post("/api/sign-out", {}, "application/json")
    assert client.get("/api/highlights").status_code == 401
    assert mark(client, article).status_code == 401


def test_a_passage_of_an_answer_is_marked_once_it_is_finished(
    owner_client: Client, article: Item
) -> None:
    asked = Ask.objects.create(question="Why is sync hard?", scope="item", item=article)
    place = {"unit": 1, "start": 3, "end": 17, "quote": QUOTE}
    address = f"/api/asks/{asked.pk}/highlights"
    # An answer still being written may yet be dropped: nothing in it is kept.
    asked.answer = "It is fast."
    asked.save()
    assert owner_client.post(address, place, "application/json").status_code == 422

    asked.answer, asked.answered_at = "It is fast.\n\nIt wrong silently [1].", timezone.now()
    asked.save()
    made = owner_client.post(address, {**place, "reply": 4}, "application/json")
    assert made.status_code == 201
    highlight = made.json()
    # It is told by its question, and has no source: it is the model's words, not an item's.
    assert {**highlight, "id": 0, "created_at": ""} == {
        "id": 0,
        "reply": None,
        "unit": 1,
        "start": 3,
        "end": 17,
        "quote": QUOTE,
        "note": "",
        "created_at": "",
        "item_id": None,
        "ask_id": asked.pk,
        "source": None,
        "title": "Why is sync hard?",
        "origin": "Ask",
        "icon": None,
    }
    # The same place again is the same highlight; it is listed, counted and can take a note.
    assert owner_client.post(address, place, "application/json").json()["id"] == highlight["id"]
    assert owner_client.get("/api/highlights").json() == [highlight]
    assert owner_client.get("/api/counts").json()["highlights"] == 1
    noted = owner_client.patch(
        f"/api/highlights/{highlight['id']}", {"note": "Check."}, "application/json"
    )
    assert noted.json()["note"] == "Check."
    # The item asked about has no highlight of its own from this.
    assert owner_client.get(f"/api/items/{article.pk}").json()["highlights"] == []
    assert (
        owner_client.post("/api/asks/99999/highlights", place, "application/json").status_code
        == 404
    )
