import json
from datetime import UTC, date, datetime
from typing import Any

import pytest
from django.test import Client

from account.models import Preferences
from ai.models import FeatureModel, Usage
from reader import digest
from reader.models import Digest, Item

# The stand-in for both providers, an accepted key, and a few items: as the Ask tests have them.
from tests.test_ask import library, model, ready  # noqa: F401

WRITTEN = {
    "lead": "Two things came in.",
    "sections": [
        # Named twice, and an item that was not given: each real one is named once.
        {"head": "Threads worth opening", "text": "An offline archive.", "items": [1, 9, 1]},
        {"head": "From your feeds", "text": "Sync should be boring.", "items": [2]},
    ],
}


def switch(on: bool = True, zone: str = "UTC") -> None:
    Preferences.objects.update_or_create(pk=1, defaults={"digest_on": on, "time_zone": zone})


def test_a_digest_is_due_at_seven_on_the_owners_clock_and_only_once(owner_client: Client) -> None:
    saturday = date(2026, 11, 14)
    half_six = datetime(2026, 11, 13, 21, 30, tzinfo=UTC)  # 6:30 on Saturday in Tokyo
    seven = datetime(2026, 11, 13, 22, 0, tzinfo=UTC)
    # Off until it is switched on.
    assert digest.due(seven) == []
    switch(zone="Asia/Tokyo")
    assert digest.due(half_six) == []
    assert digest.due(seven) == [("daily", saturday)]
    # Later the same day it is still due, if the worker was off at seven; once written, not.
    assert digest.due(datetime(2026, 11, 14, 6, 0, tzinfo=UTC)) == [("daily", saturday)]
    Digest.objects.create(kind="daily", day=saturday)
    assert digest.due(seven) == []
    # On a Sunday the weekly one is due too. It is still Saturday in UTC, Sunday in Tokyo.
    sunday = datetime(2026, 11, 14, 22, 0, tzinfo=UTC)
    assert digest.due(sunday) == [("daily", date(2026, 11, 15)), ("weekly", date(2026, 11, 15))]
    # A zone that is no zone is read as UTC, where at this moment it is not yet seven.
    switch(zone="Nowhere/Much")
    assert digest.due(datetime(2026, 11, 15, 1, 0, tzinfo=UTC)) == []


def test_a_digest_is_written_from_what_came_in_and_names_only_what_it_was_given(
    owner_client: Client,
    library: dict[str, Item],  # noqa: F811
    model: Any,  # noqa: F811
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    ready()
    FeatureModel.objects.create(feature="digest", provider="openai", model="gpt-example")
    switch()
    today = date(2026, 11, 15)
    monkeypatch.setattr(digest, "due", lambda now: [("weekly", today)])
    # A model may wrap its answer in a code fence.
    model.said = f"```json\n{json.dumps(WRITTEN)}\n```"
    digest.write_due()

    (address, _, body) = model.seen[0]
    assert address == "api.openai.com/v1/responses"
    assert body["instructions"] == digest.INSTRUCTIONS
    sent = body["input"]
    # The week's items, newest first; not the month-old one, and never X's.
    assert sent.index("[1] Show HN: an offline archive") < sent.index("[2] The case for boring")
    assert "From Wire Notes (RSS), " in sent
    assert "Gardening" not in sent and "elsewhere" not in sent

    told = owner_client.get("/api/digests").json()
    assert (told["on"], told["daily"]) == (True, None)
    weekly = told["weekly"]
    assert (weekly["kind"], weekly["day"], weekly["problem"]) == ("weekly", "2026-11-15", "")
    assert weekly["lead"] == "Two things came in."
    assert [(s["head"], [c["title"] for c in s["cites"]]) for s in weekly["sections"]] == [
        ("Threads worth opening", ["Show HN: an offline archive"]),
        ("From your feeds", ["The case for boring sync protocols"]),
    ]
    assert weekly["sections"][0]["cites"][0]["item_id"] == library["hn"].pk
    # The call is on the record as Digest's.
    assert Usage.objects.get().feature == "digest"
    # An item that has gone since is still named, but can no longer be opened.
    library["hn"].delete()
    weekly = owner_client.get("/api/digests").json()["weekly"]
    assert weekly["sections"][0]["cites"][0]["item_id"] is None


@pytest.mark.parametrize(
    ("said", "chosen", "items", "problem", "calls"),
    [
        ("I would rather not.", True, True, digest.UNREADABLE, 1),
        ('{"lead": "", "sections": []}', True, True, digest.UNREADABLE, 1),
        (json.dumps(WRITTEN), False, True, digest.NO_MODEL, 0),
        (json.dumps(WRITTEN), True, False, digest.NOTHING_NEW, 0),
    ],
)
def test_a_digest_that_cannot_be_written_says_why_and_is_not_tried_again(
    owner_client: Client,
    library: dict[str, Item],  # noqa: F811
    model: Any,  # noqa: F811
    monkeypatch: pytest.MonkeyPatch,
    said: str,
    chosen: bool,
    items: bool,
    problem: str,
    calls: int,
) -> None:
    ready()
    if chosen:
        FeatureModel.objects.create(feature="digest", provider="openai", model="gpt-example")
    if not items:
        Item.objects.all().delete()
    switch()
    # Any hour past seven, whenever the test runs.
    monkeypatch.setattr(digest, "HOUR", 0)
    # And only the daily one, whatever day that is.
    monkeypatch.setattr(digest, "WEEKLY_ON", 7)
    model.said = said
    digest.write_due()
    kept = Digest.objects.get(kind="daily")
    assert (kept.problem, kept.lead, kept.sections) == (problem, "", [])
    assert len(model.seen) == calls
    # The row is the day's digest: the hourly run does not call the model again.
    digest.write_due()
    assert len(model.seen) == calls
    assert owner_client.get("/api/digests").json()["daily"]["problem"] == problem


def test_a_digest_that_waited_on_the_owner_is_written_once_they_have_put_it_right(
    owner_client: Client,
    library: dict[str, Item],  # noqa: F811
    model: Any,  # noqa: F811
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    ready()
    switch()
    monkeypatch.setattr(digest, "HOUR", 0)
    monkeypatch.setattr(digest, "WEEKLY_ON", 7)
    model.said = json.dumps(WRITTEN)
    # No model is chosen for Digest, then the limit is reached: neither calls a model, and
    # each leaves the day's digest still to be written.
    digest.write_due()
    assert Digest.objects.get().problem == digest.NO_MODEL
    FeatureModel.objects.create(feature="digest", provider="openai", model="gpt-example")
    Preferences.objects.update(ai_limit=0)
    digest.write_due()
    assert Digest.objects.get().problem.startswith("AI is paused")
    assert model.seen == []
    # The limit raised, the same day's digest is written, from the same items as it would
    # have been: the day that had none did not move where it begins.
    Preferences.objects.update(ai_limit=None)
    digest.write_due()
    kept = Digest.objects.get()
    assert (kept.problem, kept.lead) == ("", "Two things came in.")
    assert "[1] Show HN: an offline archive" in model.seen[0][2]["input"]
    # Written, it is not written again.
    digest.write_due()
    assert len(model.seen) == 1


def test_digest_is_switched_on_with_the_browsers_time_zone(owner_client: Client) -> None:
    assert owner_client.get("/api/digests").json() == {"on": False, "daily": None, "weekly": None}
    address = "/api/digests/on"
    bad = owner_client.put(address, {"on": True, "time_zone": "../etc"}, "application/json")
    assert bad.status_code == 422
    assert Preferences.load().digest_on is False

    on = owner_client.put(address, {"on": True, "time_zone": "Asia/Tokyo"}, "application/json")
    assert (on.status_code, on.json()["on"]) == (200, True)
    prefs = Preferences.load()
    assert (prefs.digest_on, prefs.time_zone) == (True, "Asia/Tokyo")
    # Asked twice is not an error: the hourly run is already queued.
    again = owner_client.put(address, {"on": True, "time_zone": "Asia/Tokyo"}, "application/json")
    assert again.status_code == 200
    off = owner_client.put(address, {"on": False, "time_zone": "Asia/Tokyo"}, "application/json")
    assert off.json()["on"] is False


def test_digests_need_an_open_session(client: Client, db: None) -> None:
    assert client.get("/api/digests").status_code == 401
