import json
from datetime import UTC, datetime
from typing import Any

import httpx
import pytest
from django.test import Client
from django.utils import timezone

from reader import ask, x
from reader.models import Ask, Connection, Item, Match, Watch

TOKEN = "AAAA" + "b" * 40 + "WXYZ"  # made up, built from parts
# Two posts, as X's search returns them: who wrote each is told beside them.
FOUND = {
    "data": [
        {
            "id": "1990000000000000000",
            "text": "Sync protocols should be boring.\nA thread.",
            "author_id": "7",
        },
        {"id": "1990000000000000001", "text": "x" * 200, "author_id": "8"},
    ],
    "includes": {"users": [{"id": "7", "username": "lena_builds", "name": "Lena"}]},
    "meta": {"result_count": 2},
}


@pytest.fixture
def asked(web: Any) -> list[httpx.Request]:
    """Stands in for X: notes every request and answers with the two posts."""
    seen: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append(request)
        return httpx.Response(200, json=FOUND)

    web(handler)
    return seen


def save_token(client: Client) -> Any:
    return client.put("/api/sources/x", {"token": f"  {TOKEN} "}, "application/json")


def watch(client: Client, name: str, kind: str = "keyword", on_x: bool = True) -> int:
    made = client.post("/api/watches", {"name": name, "kind": kind}, "application/json").json()
    number = int(made["watches"][-1]["id"])
    if on_x:
        switched = client.patch(f"/api/watches/{number}", {"on_x": True}, "application/json")
        assert switched.status_code == 200
    return number


def test_the_token_is_kept_sealed_and_only_its_last_characters_are_told(
    owner_client: Client, asked: list[httpx.Request]
) -> None:
    none = {"connected": False, "tail": "", "synced_at": None, "problem": ""}
    assert owner_client.get("/api/sources/x").json() == none
    saved = save_token(owner_client)
    assert saved.json() == {"connected": True, "tail": "WXYZ", "synced_at": None, "problem": ""}
    kept = Connection.objects.get(source="X")
    assert TOKEN not in kept.sealed and TOKEN not in saved.content.decode()
    # Saving it asks X nothing: X charges for what it returns.
    assert asked == []
    # Forgotten, it is gone, and nothing more is asked.
    watch(owner_client, "sync protocols")
    assert owner_client.delete("/api/sources/x").json() == none
    x.look_all()
    assert asked == []


def test_a_watch_switched_on_for_x_is_searched_once_a_day_and_its_posts_become_matches(
    owner_client: Client, asked: list[httpx.Request]
) -> None:
    save_token(owner_client)
    number = watch(owner_client, 'sync "protocols"')
    watch(owner_client, "not on x", on_x=False)
    x.look_all()

    # One request, for the watch that is on for X: its words together, the best ten of the
    # past day, with the token the owner gave.
    (request,) = asked
    assert request.headers["Authorization"] == f"Bearer {TOKEN}"
    assert request.url.host == "api.x.com"
    params = dict(request.url.params)
    assert params["query"] == '"sync protocols" -is:retweet'
    assert (params["max_results"], params["sort_order"]) == ("10", "relevancy")
    assert params["expansions"] == "author_id"
    since = datetime.strptime(params["start_time"], "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=UTC)
    assert 86_300 < (timezone.now() - since).total_seconds() < 86_500

    first, second = Item.objects.filter(source="X").order_by("guid")
    assert (first.title, first.origin) == ("Sync protocols should be boring.", "@lena_builds")
    assert first.url == "https://x.com/lena_builds/status/1990000000000000000"
    assert first.body == "Sync protocols should be boring.\nA thread."
    # When it was made is read from its number.
    assert first.published_at == x.made_at("1990000000000000000")
    assert 2025 <= first.published_at.year <= 2027
    # A long post is cut for its title; one whose writer X did not name still has an address.
    assert (len(second.title), second.title[-1], second.origin) == (141, "…", "X")
    assert second.url == "https://x.com/i/web/status/1990000000000000001"

    told = owner_client.get("/api/watches").json()
    assert (told["watches"][0]["on_x"], told["watches"][1]["on_x"]) == (True, False)
    assert {m["source"] for m in told["matches"]} == {"X"}
    assert Match.objects.filter(watch_id=number, judged=False).count() == 2
    assert owner_client.get("/api/sources/x").json()["synced_at"] is not None

    # Not again that day, however often the hourly run comes round. The day after, once more,
    # and a post already held is not made twice.
    x.look_all()
    assert len(asked) == 1
    Watch.objects.filter(pk=number).update(x_looked_at=timezone.now() - x.EVERY)
    x.look_all()
    assert (len(asked), Item.objects.filter(source="X").count()) == (2, 2)
    # Off, or off for X, it is not searched.
    Watch.objects.filter(pk=number).update(x_looked_at=None, on=False)
    x.look_all()
    owner_client.patch(f"/api/watches/{number}", {"on": True, "on_x": False}, "application/json")
    x.look_all()
    assert len(asked) == 2


def test_a_person_is_asked_for_by_account_and_a_topic_is_never_looked_for_on_x(
    owner_client: Client, asked: list[httpx.Request]
) -> None:
    save_token(owner_client)
    watch(owner_client, "@lena_builds", "person")
    watch(owner_client, "not an account!", "person")
    topic = watch(owner_client, "local-first", "topic", on_x=False)
    refused = owner_client.patch(f"/api/watches/{topic}", {"on_x": True}, "application/json")
    assert refused.status_code == 422
    x.look_all()
    # Only the one that is an account name is asked for; the other says why not.
    assert [dict(r.url.params)["query"] for r in asked] == ["from:lena_builds -is:retweet"]
    assert "is not an X account name" in owner_client.get("/api/sources/x").json()["problem"]


@pytest.mark.parametrize(
    ("status", "problem"),
    [(401, x.REJECTED), (402, "X answered 402, so nothing was fetched."), (200, x.UNREADABLE)],
)
def test_when_x_gives_nothing_the_connection_says_why_and_the_watch_is_tried_again(
    owner_client: Client, web: Any, status: int, problem: str
) -> None:
    calls = []

    def handler(request: httpx.Request) -> httpx.Response:
        calls.append(request)
        return httpx.Response(status, content=json.dumps({"data": "no"}).encode())

    web(handler)
    save_token(owner_client)
    watch(owner_client, "sync")
    x.look_all()
    told = owner_client.get("/api/sources/x").json()
    assert told["problem"].startswith(problem)
    # Neither the token nor anything of it is in what the owner is told.
    assert TOKEN not in json.dumps(told)
    assert Item.objects.filter(source="X").count() == 0
    # It was not looked for, so the next hour tries again: asking costs nothing.
    x.look_all()
    assert len(calls) == 2


def test_posts_from_x_are_never_sent_to_a_model(
    owner_client: Client, asked: list[httpx.Request]
) -> None:
    save_token(owner_client)
    watch(owner_client, "sync protocols")
    x.look_all()
    question = Ask.objects.create(question="What about sync protocols?", scope="everything")
    assert ask.chosen(question) == []
    post = Item.objects.filter(source="X").first()
    about = Ask.objects.create(question="Summarize", scope="item", item=post)
    assert ask.chosen(about) == []


def test_x_needs_an_open_session(client: Client, db: None) -> None:
    assert client.get("/api/sources/x").status_code == 401
