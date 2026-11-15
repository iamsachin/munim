from typing import Any

from django.test import Client
from django.utils import timezone

from ai.models import FeatureModel, Usage
from reader import watches
from reader.models import Item, Match, Watch

# The stand-in for both providers, an accepted key, and a few items: as the Ask tests have them.
from tests.test_ask import library, model, ready  # noqa: F401


def add(client: Client, name: str, kind: str = "keyword") -> Any:
    return client.post("/api/watches", {"name": name, "kind": kind}, "application/json")


def titles(told: dict[str, Any]) -> list[str]:
    return [match["title"] for match in told["matches"]]


def test_a_keyword_is_matched_by_its_words_from_the_past_week_on(
    owner_client: Client,
    library: dict[str, Item],  # noqa: F811
) -> None:
    made = add(owner_client, "  sync protocols ")
    assert made.status_code == 201
    told = made.json()
    (watch,) = told["watches"]
    assert (watch["name"], watch["kind"], watch["on"]) == ("sync protocols", "keyword", True)
    # Added, it looks back at once: the week's items with those words, not the month-old one.
    assert (watch["week"], watch["problem"]) == (2, "")
    assert watch["last"] == told["matches"][0]["published_at"]
    assert titles(told) == ["Sync protocols on Reddit", "The case for boring sync protocols"]
    assert told["matches"][1] == {
        "watch": "sync protocols",
        "kind": "keyword",
        "item_id": library["sync"].pk,
        "source": "RSS",
        "title": "The case for boring sync protocols",
        "icon": f"/api/feeds/{library['sync'].feed_id}/icon",
        "published_at": told["matches"][1]["published_at"],
    }
    assert owner_client.get("/api/counts").json()["watches"] == 2
    # The same again, in any case, is refused; so is nothing.
    assert add(owner_client, "Sync Protocols").status_code == 422
    assert add(owner_client, "   ").status_code == 422

    # What arrives later is looked at by the hourly run, once.
    Item.objects.create(
        feed=library["sync"].feed,
        guid="new",
        title="Sync protocols, again",
        published_at=timezone.now(),
    )
    watches.check_all()
    watches.check_all()
    told = owner_client.get("/api/watches").json()
    assert (told["watches"][0]["week"], len(told["matches"])) == (3, 3)

    # Off, it is not counted, its matches are not listed, and it looks at nothing.
    address = f"/api/watches/{watch['id']}"
    off = owner_client.patch(address, {"on": False}, "application/json").json()
    assert (off["watches"][0]["on"], off["matches"]) == (False, [])
    assert owner_client.get("/api/counts").json()["watches"] == 0
    Item.objects.create(
        feed=library["sync"].feed,
        guid="newer",
        title="Sync protocols, once more",
        published_at=timezone.now(),
    )
    watches.check_all()
    assert Match.objects.count() == 3
    # Switched on again, it catches up at once.
    on = owner_client.patch(address, {"on": True}, "application/json").json()
    assert on["watches"][0]["week"] == 4
    # Removed, it is gone with its matches; the items stay.
    assert owner_client.delete(address).json() == {"watches": [], "matches": []}
    assert Match.objects.count() == 0 and Item.objects.count() == 6


def test_a_person_is_matched_by_who_published_or_replied(
    owner_client: Client,
    library: dict[str, Item],  # noqa: F811
) -> None:
    assert titles(add(owner_client, "@marrow_fern", "person").json()) == [
        "Show HN: an offline archive"
    ]
    told = add(owner_client, "wire notes", "person").json()
    assert sorted(titles(told)) == [
        "Show HN: an offline archive",
        "The case for boring sync protocols",
    ]


def test_a_topic_is_judged_by_the_model_in_the_worker_on_new_items_only(
    owner_client: Client,
    library: dict[str, Item],  # noqa: F811
    model: Any,  # noqa: F811
) -> None:
    ready()
    made = add(owner_client, "offline software", "topic")
    # Nothing is sent to a model inside the request, and without a model for Watch matching
    # the worker sends nothing either: the watch says why.
    assert (made.status_code, made.json()["matches"]) == (201, [])
    watches.check_all()
    assert model.seen == []
    (watch,) = owner_client.get("/api/watches").json()["watches"]
    assert watch["problem"] == watches.NO_MODEL

    FeatureModel.objects.create(feature="watch", provider="openai", model="gpt-example")
    # An answer that cannot be read is not taken for "no matches": it is asked again.
    model.said = "Perhaps."
    watches.check_all()
    assert Watch.objects.get().problem == watches.UNREADABLE
    # The newest first. A number twice, or one that is no item's, changes nothing.
    model.said = 'Here: {"items": [1, 7, 1]}'
    watches.check_all()
    (_, _, body) = model.seen[-1]
    assert body["instructions"] == watches.INSTRUCTIONS
    sent = body["input"]
    assert sent.startswith("Topic: offline software\n\nItems:\n\n[1] Show HN: an offline archive")
    assert "[2] The case for boring sync protocols" in sent
    # Not the month-old item, and never Reddit's.
    assert "Gardening" not in sent and "Reddit" not in sent
    told = owner_client.get("/api/watches").json()
    assert (told["watches"][0]["week"], told["watches"][0]["problem"]) == (1, "")
    assert [(m["title"], m["kind"]) for m in told["matches"]] == [
        ("Show HN: an offline archive", "topic")
    ]
    assert [use.feature for use in Usage.objects.all()] == ["watch", "watch"]
    # With nothing new, the model is not called again.
    calls = len(model.seen)
    watches.check_all()
    assert len(model.seen) == calls


def test_watches_need_an_open_session(client: Client, db: None) -> None:
    assert client.get("/api/watches").status_code == 401
