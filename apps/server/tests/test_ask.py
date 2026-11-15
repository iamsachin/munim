import json
from datetime import timedelta
from typing import Any

import httpx2
import pytest
from django.test import Client
from django.utils import timezone

from account.models import Preferences
from ai.models import FeatureModel, ModelPrice, ProviderKey, Usage
from munim import vault
from reader import ask
from reader.models import Ask, Feed, Item
from reader.tasks import answer_ask

KEY = "sk-proj-" + "a" * 16 + "WXYZ"  # made up, built from parts


@pytest.fixture
def model(monkeypatch: pytest.MonkeyPatch) -> Any:
    """Stands in for both providers' answering calls. `said` is what the model answers;
    `seen` is each request it was sent, as (address, key, body)."""

    class Stand:
        said = "Sync protocols should be boring [2]. Nothing here is about cheese."
        status = 200
        seen: list[tuple[str, str, dict[str, Any]]] = []

    stand = Stand()
    stand.seen = []

    def handler(request: httpx2.Request) -> httpx2.Response:
        headers = request.headers
        sent = (headers.get("x-api-key") or headers.get("authorization") or "").removeprefix(
            "Bearer "
        )
        stand.seen.append(
            (f"{request.url.host}{request.url.path}", sent, json.loads(request.content))
        )
        if stand.status != 200:
            return httpx2.Response(stand.status, json={"error": {"message": "no", "type": "x"}})
        if request.url.host == "api.anthropic.com":
            return httpx2.Response(
                200,
                json={
                    "id": "msg_1",
                    "type": "message",
                    "role": "assistant",
                    "model": "claude-example",
                    "content": [{"type": "text", "text": stand.said}],
                    "stop_reason": "end_turn",
                    "stop_sequence": None,
                    "usage": {"input_tokens": 1200, "output_tokens": 80},
                },
            )
        return httpx2.Response(
            200,
            json={
                "id": "resp_1",
                "object": "response",
                "created_at": 1,
                "model": "gpt-example",
                "status": "completed",
                "output": [
                    {
                        "id": "msg_1",
                        "type": "message",
                        "role": "assistant",
                        "status": "completed",
                        "content": [{"type": "output_text", "text": stand.said, "annotations": []}],
                    }
                ],
                "parallel_tool_calls": False,
                "tool_choice": "auto",
                "tools": [],
                "usage": {
                    "input_tokens": 1000,
                    "input_tokens_details": {"cached_tokens": 0},
                    "output_tokens": 50,
                    "output_tokens_details": {"reasoning_tokens": 0},
                    "total_tokens": 1050,
                },
            },
        )

    monkeypatch.setattr("ai.providers.TRANSPORT", httpx2.MockTransport(handler))
    return stand


def ready(provider: str = "openai", name: str = "gpt-example") -> None:
    """An accepted key for the provider, and its model chosen for Ask."""
    ProviderKey.objects.create(
        provider=provider,
        sealed=vault.seal(KEY),
        tail="WXYZ",
        ok=True,
        checked_at=timezone.now(),
        models=[name],
    )
    FeatureModel.objects.create(feature="ask", provider=provider, model=name)


@pytest.fixture
def library(owner_client: Client) -> dict[str, Item]:
    """A feed with two articles, a Hacker News story with a reply, and a Reddit post."""
    feed = Feed.objects.create(url="https://wire.example/feed", title="Wire Notes")
    now = timezone.now()
    return {
        "sync": Item.objects.create(
            feed=feed,
            guid="sync",
            title="The case for boring sync protocols",
            body="Sync protocols should be boring. Clever ones lose data.",
            published_at=now - timedelta(days=1),
            saved_at=now,
        ),
        "old": Item.objects.create(
            feed=feed,
            guid="old",
            title="Gardening notes",
            body="Tomatoes want sun.",
            published_at=now - timedelta(days=30),
        ),
        "hn": Item.objects.create(
            source="HN",
            guid="hn",
            title="Show HN: an offline archive",
            origin="612 points",
            body="",
            comments=[
                {
                    "who": "marrow_fern",
                    "meta": "2h",
                    "depth": 0,
                    "blocks": [
                        {"type": "paragraph", "spans": [{"text": "Sync is the hard part."}]}
                    ],
                }
            ],
            published_at=now - timedelta(hours=3),
        ),
        "reddit": Item.objects.create(
            source="RD",
            guid="rd",
            title="Sync protocols on Reddit",
            body="A Reddit post about sync protocols.",
            origin="r/selfhosted",
            published_at=now,
        ),
    }


def put(client: Client, question: str, scope: str = "everything", item: int | None = None) -> Any:
    body = {"question": question, "scope": scope, "item_id": item}
    return client.post("/api/asks", body, "application/json")


def test_a_question_is_answered_by_the_worker_from_matching_items_with_citations(
    owner_client: Client, library: dict[str, Item], model: Any
) -> None:
    ready()
    ModelPrice.objects.create(provider="openai", model="gpt-example", input=2, output=10)
    question = "What about sync protocols and the offline archive?"
    asked = put(owner_client, f"  {question}  ")
    assert asked.status_code == 201
    waiting = asked.json()
    assert (waiting["question"], waiting["status"]) == (question, "pending")
    assert (waiting["answer"], waiting["cites"]) == ("", [])
    # Nothing is sent to a model inside the request: the worker does it.
    assert model.seen == []

    # The items whose title or text has any of the question's words; not the rest. (A reply's
    # words are not searched, so the story is found by its title.)
    given = ask.chosen(Ask.objects.get(pk=waiting["id"]))
    assert {item.title for item in given} == {
        "The case for boring sync protocols",
        "Show HN: an offline archive",
    }
    number = given.index(library["hn"]) + 1
    model.said = f"Sync protocols should be boring [{number}]. Nothing here is about cheese."

    answer_ask(ask_id=waiting["id"])
    (address, key, body) = model.seen[0]
    assert (address, key) == ("api.openai.com/v1/responses", KEY)
    assert (body["model"], body["store"]) == ("gpt-example", False)
    assert body["instructions"] == ask.INSTRUCTIONS
    sent = body["input"]
    assert sent.startswith(f"Question: {question}")
    # Each item is numbered, and the story's reply goes with it.
    assert f"[{number}] Show HN: an offline archive" in sent
    assert f"[{3 - number}] The case for boring sync protocols" in sent
    assert "From Wire Notes, " in sent
    assert "marrow_fern: Sync is the hard part." in sent
    assert "Gardening" not in sent
    # Reddit's content is never sent to a model.
    assert "Reddit" not in sent

    (told,) = owner_client.get("/api/asks").json()
    assert told["status"] == "answered"
    # The one item cited is numbered from one, whatever its number was in the prompt.
    assert told["answer"] == "Sync protocols should be boring [1]. Nothing here is about cheese."
    assert told["cites"] == [
        {
            "item_id": library["hn"].pk,
            "source": "HN",
            "title": "Show HN: an offline archive",
            "origin": "612 points",
            "icon": "/api/sources/HN/icon",
        }
    ]
    # The call is on the record, at the price entered for the model.
    used = Usage.objects.get()
    assert (used.feature, used.model, used.tokens_in, used.tokens_out) == (
        "ask",
        "gpt-example",
        1000,
        50,
    )
    assert float(used.cost or 0) == pytest.approx(0.0025)

    # Run again, as after a crash, it does not ask or charge twice.
    answer_ask(ask_id=waiting["id"])
    assert len(model.seen) == 1


def test_only_what_was_given_can_be_cited(library: dict[str, Item]) -> None:
    items = [library["sync"], library["hn"]]
    text, cites = ask.cited("Second [2], first [1], second again [2], invented [7] [0].", items)
    assert text == "Second [1], first [2], second again [1], invented  ."
    assert [cite["title"] for cite in cites] == [
        "Show HN: an offline archive",
        "The case for boring sync protocols",
    ]
    assert ask.cited("No citations at all.", items) == ("No citations at all.", [])


def test_a_scope_limits_what_an_answer_may_draw_on(
    owner_client: Client, library: dict[str, Item], model: Any
) -> None:
    ready("anthropic", "claude-example")

    def sent_for(scope: str, question: str, item: int | None = None) -> str:
        answer_ask(ask_id=put(owner_client, question, scope, item).json()["id"])
        address, _, body = model.seen[-1]
        assert address == "api.anthropic.com/v1/messages"
        assert body["system"] == ask.INSTRUCTIONS
        return str(body["messages"][0]["content"])

    saved = sent_for("saved", "anything about sync?")
    assert "boring sync protocols" in saved and "Show HN" not in saved
    week = sent_for("week", "tomatoes")
    # Nothing this week is about tomatoes, so the newest of the week are given instead.
    assert "Gardening" not in week and "Show HN" in week
    everything = sent_for("everything", "tomatoes")
    assert everything.count("\n\n[") == 1 and "Gardening notes" in everything
    one = sent_for("item", "Summarize this thread", library["hn"].pk)
    assert "[1] Show HN" in one and "boring sync" not in one

    # A citation survives its item: it is kept as it was, without a way to open it.
    model.said = "It is about an archive [1]."
    summary = put(owner_client, "Summarize this thread", "item", library["hn"].pk).json()
    answer_ask(ask_id=summary["id"])
    library["hn"].delete()
    kept = owner_client.get("/api/asks").json()[-1]
    assert kept["status"] == "answered"
    assert (kept["cites"][0]["title"], kept["cites"][0]["item_id"]) == (
        "Show HN: an offline archive",
        None,
    )


def test_what_cannot_be_asked_is_said_at_once_and_costs_nothing(
    owner_client: Client, library: dict[str, Item], model: Any
) -> None:
    # No model chosen for Ask yet.
    refused = put(owner_client, "Anything new?").json()
    assert (refused["status"], refused["problem"]) == ("failed", ask.NO_MODEL)

    ready()
    # The scope is one item, and none was given, or it is gone.
    assert put(owner_client, "Summarize this", "item").json()["problem"] == ask.NO_ITEM
    assert put(owner_client, "Summarize this", "item", 99999).json()["problem"] == ask.NO_ITEM

    # A Reddit item is never sent, so there is nothing to answer from.
    reddit = put(owner_client, "Summarize this thread", "item", library["reddit"].pk).json()
    assert reddit["status"] == "pending"
    answer_ask(ask_id=reddit["id"])
    assert owner_client.get("/api/asks").json()[-1]["problem"] == ask.NOTHING

    # The month's limit is reached.
    Preferences.objects.update_or_create(pk=1, defaults={"ai_limit": 0})
    assert put(owner_client, "Anything new?").json()["problem"] == ask.PAUSED
    assert model.seen == []
    assert not Usage.objects.exists()

    # Not a question at all.
    assert put(owner_client, "").status_code == 422
    assert put(owner_client, "x" * 2001).status_code == 422
    assert put(owner_client, "Anything?", "tomorrow").status_code == 422


@pytest.mark.parametrize(
    ("status", "said"),
    [
        (401, "OpenAI rejected the key. Replace it under AI."),
        (429, "OpenAI answered 429, so there is no answer."),
        (500, "OpenAI answered 500, so there is no answer."),
    ],
)
def test_a_provider_that_does_not_answer_is_reported_without_the_key(
    owner_client: Client, library: dict[str, Item], model: Any, status: int, said: str
) -> None:
    ready()
    model.status = status
    asked = put(owner_client, "What about sync?").json()
    answer_ask(ask_id=asked["id"])
    told = owner_client.get("/api/asks")
    assert (told.json()[0]["status"], told.json()[0]["problem"]) == ("failed", said)
    assert KEY not in told.content.decode()
    assert not Usage.objects.exists()


def test_a_limit_reached_while_waiting_stops_the_call(
    owner_client: Client, library: dict[str, Item], model: Any
) -> None:
    ready()
    asked = put(owner_client, "What about sync?").json()
    Preferences.objects.update_or_create(pk=1, defaults={"ai_limit": 0})
    answer_ask(ask_id=asked["id"])
    assert owner_client.get("/api/asks").json()[0]["problem"] == ask.PAUSED
    assert model.seen == []


def test_asks_need_an_open_session(client: Client, db: None, model: Any) -> None:
    assert client.get("/api/asks").status_code == 401
    assert put(client, "Anything new?").status_code == 401
    assert not Ask.objects.exists()
