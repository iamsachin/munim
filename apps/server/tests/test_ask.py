import json
import re
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
        # How its stream ends: "response.completed", or "response.failed" part way.
        ends = "response.completed"
        seen: list[tuple[str, str, dict[str, Any]]] = []
        # Called after each piece of the answer has been taken, to look at what is saved then.
        between: Any = None

    stand = Stand()
    stand.seen = []

    def event(name: str, data: dict[str, Any]) -> bytes:
        return f"event: {name}\ndata: {json.dumps({'type': name, **data})}\n\n".encode()

    def pieces() -> list[str]:
        """The answer a word at a time, as a model sends it."""
        return re.findall(r"\S+\s*", stand.said)

    def openai_stream() -> Any:
        for n, piece in enumerate(pieces()):
            yield event(
                "response.output_text.delta",
                {
                    "item_id": "msg_1",
                    "output_index": 0,
                    "content_index": 0,
                    "delta": piece,
                    "logprobs": [],
                    "sequence_number": n,
                },
            )
            if stand.between:
                stand.between()
        response = {
            "id": "resp_1",
            "object": "response",
            "created_at": 1,
            "model": "gpt-example",
            "status": "completed",
            "output": [],
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
        }
        yield event(stand.ends, {"response": response, "sequence_number": 999})

    def anthropic_stream() -> Any:
        message: dict[str, Any] = {
            "id": "msg_1",
            "type": "message",
            "role": "assistant",
            "model": "claude-example",
            "content": [],
            "stop_reason": None,
            "stop_sequence": None,
            "usage": {"input_tokens": 1200, "output_tokens": 1},
        }
        yield event("message_start", {"message": message})
        yield event(
            "content_block_start", {"index": 0, "content_block": {"type": "text", "text": ""}}
        )
        for piece in pieces():
            delta = {"type": "text_delta", "text": piece}
            yield event("content_block_delta", {"index": 0, "delta": delta})
        yield event("content_block_stop", {"index": 0})
        yield event(
            "message_delta",
            {
                "delta": {"stop_reason": "end_turn", "stop_sequence": None},
                "usage": {"output_tokens": 80},
            },
        )
        yield event("message_stop", {})

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
        stream = anthropic_stream() if request.url.host == "api.anthropic.com" else openai_stream()
        return httpx2.Response(200, content=stream, headers={"Content-Type": "text/event-stream"})

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
    assert (body["model"], body["store"], body["stream"]) == ("gpt-example", False, True)
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
            "quote": "",
            "reply": None,
            "who": "",
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


def test_a_citation_carries_the_words_it_rests_on_if_the_item_has_them(
    library: dict[str, Item],
) -> None:
    items = [library["sync"], library["hn"]]
    text, cites = ask.cited(
        'Boring is best [1 "sync protocols  should be BORING"], truly [1], really '
        '[1 "Clever ones lose data"] [1].\n'
        'Sync is hard[2: “Sync is the hard part.”] and boring [1 "Sync protocols should be '
        'boring"].\n\n'
        'Cheese is nice [2 "cheese is nice"]. No such item [7 "Sync"]. And [1 "clever',
        items,
    )
    # A paragraph cites an item once, however often the model did. The same passage again, in
    # another paragraph, keeps its number. Words an item does not have are not shown as its
    # words: the item is cited without them. A citation still being written, at the end, is
    # not shown yet.
    assert text == (
        "Boring is best [1], truly, really.\n"
        "Sync is hard [2] and boring [1].\n\n"
        "Cheese is nice [3]. No such item. And"
    )
    assert [(str(c["title"])[:8], c["quote"], c["reply"], c["who"]) for c in cites] == [
        # As the item has the words, whatever their case and spacing in the answer.
        ("The case", "Sync protocols should be boring", None, ""),
        ("Show HN:", "Sync is the hard part", 0, "marrow_fern"),
        ("Show HN:", "", None, ""),
    ]


def test_only_what_was_given_can_be_cited(library: dict[str, Item]) -> None:
    items = [library["sync"], library["hn"]]
    text, cites = ask.cited("Second [2], first [1], invented [7] [0].\nSecond again [2].", items)
    assert text == "Second [1], first [2], invented.\nSecond again [1]."
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


def test_an_answer_is_shown_while_it_is_written(
    owner_client: Client, library: dict[str, Item], model: Any, monkeypatch: pytest.MonkeyPatch
) -> None:
    ready()
    monkeypatch.setattr(ask, "SHOW_EVERY_SECONDS", 0)
    model.said = "Boring is good [1].\nClever loses data [1]."
    asked = put(owner_client, "Summarize this", "item", library["sync"].pk).json()
    seen: list[tuple[str, str, int]] = []

    def look() -> None:
        told = owner_client.get("/api/asks").json()[0]
        seen.append((told["status"], told["answer"], len(told["cites"])))

    model.between = look
    answer_ask(ask_id=asked["id"])
    # Still being written, it is already there to read, a piece longer each time; an item is
    # listed from the moment it is first cited.
    assert seen[0] == ("pending", "Boring ", 0)
    assert seen[3] == ("pending", "Boring is good [1].\n", 1)
    assert [len(answer) for _, answer, _ in seen] == sorted(len(a) for _, a, _ in seen)
    done = owner_client.get("/api/asks").json()[0]
    assert (done["status"], done["answer"]) == ("answered", model.said)

    # A stream that fails part way leaves no half answer behind, and is not charged.
    model.ends = "response.failed"
    Usage.objects.all().delete()
    failed = put(owner_client, "Summarize this", "item", library["sync"].pk).json()
    answer_ask(ask_id=failed["id"])
    told = owner_client.get("/api/asks").json()[1]
    assert (told["status"], told["answer"], told["cites"]) == ("failed", "", [])
    assert told["problem"] == "OpenAI stopped before finishing its answer."
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


def test_a_follow_up_is_answered_from_the_same_items_with_what_was_said_before(
    owner_client: Client, library: dict[str, Item], model: Any
) -> None:
    ready()
    model.said = "Clever sync protocols lose data [1]."
    first = put(owner_client, "What about sync protocols?", "saved").json()
    assert first["follows"] is None
    answer_ask(ask_id=first["id"])

    # The follow-up has no words of its own to search by, and says "everything": it is asked
    # of what the first one was, the saved article, all the same.
    body = {"question": "Why?", "scope": "everything", "follows": first["id"]}
    second = owner_client.post("/api/asks", body, "application/json").json()
    assert (second["follows"], second["scope"]) == (first["id"], "saved")
    model.said = "Because they are clever [1]."
    answer_ask(ask_id=second["id"])
    sent = model.seen[-1][2]["input"]
    assert sent.startswith(
        "Earlier question: What about sync protocols?\n"
        "Earlier answer: Clever sync protocols lose data.\n\n"
        "Question: Why?\n\nItems:\n\n[1] The case for boring sync protocols"
    )
    assert "Show HN" not in sent and "Gardening" not in sent
    told = owner_client.get("/api/asks").json()[1]
    assert (told["answer"], told["cites"][0]["title"]) == (
        "Because they are clever [1].",
        "The case for boring sync protocols",
    )

    # A follow-up to a follow-up carries the whole conversation, oldest first.
    third = owner_client.post(
        "/api/asks",
        {"question": "And then?", "scope": "saved", "follows": second["id"]},
        "application/json",
    ).json()
    answer_ask(ask_id=third["id"])
    sent = model.seen[-1][2]["input"]
    assert sent.index("Earlier question: What about sync") < sent.index("Earlier question: Why?")
    assert sent.index("Earlier question: Why?") < sent.index("Question: And then?")

    # About one item, a follow-up is about that item. Following a question that is gone is
    # just a question.
    about = put(owner_client, "Summarize this thread", "item", library["hn"].pk).json()
    answer_ask(ask_id=about["id"])
    more = owner_client.post(
        "/api/asks",
        {"question": "Who said it?", "scope": "everything", "follows": about["id"]},
        "application/json",
    ).json()
    answer_ask(ask_id=more["id"])
    assert "[1] Show HN: an offline archive" in model.seen[-1][2]["input"]
    # Each says which item it is about, as that item is now.
    assert (
        about["about"]
        == more["about"]
        == {
            "item_id": library["hn"].pk,
            "source": "HN",
            "title": "Show HN: an offline archive",
            "origin": "612 points",
            "icon": "/api/sources/HN/icon",
            "quote": "",
            "reply": None,
            "who": "",
        }
    )
    assert first["about"] is None
    # The questions about one item are one conversation: a new one, asked from the item and
    # not as a follow-up, carries on from the last, with what was said before.
    again = put(owner_client, "And the archive?", "item", library["hn"].pk).json()
    assert again["follows"] == more["id"]
    answer_ask(ask_id=again["id"])
    assert "Earlier question: Who said it?" in model.seen[-1][2]["input"]
    # A question about another item starts its own.
    assert put(owner_client, "Summarize", "item", library["sync"].pk).json()["follows"] is None
    # With the item gone, its questions stay, about nothing that can be named.
    library["hn"].delete()
    assert owner_client.get("/api/asks").json()[-2]["about"] is None
    lost = owner_client.post(
        "/api/asks",
        {"question": "Anything?", "scope": "week", "follows": 99999},
        "application/json",
    ).json()
    assert (lost["follows"], lost["scope"]) == (None, "week")


def test_asks_need_an_open_session(client: Client, db: None, model: Any) -> None:
    assert client.get("/api/asks").status_code == 401
    assert put(client, "Anything new?").status_code == 401
    assert not Ask.objects.exists()
