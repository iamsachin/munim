from datetime import timedelta
from decimal import Decimal
from typing import Any

from django.test import Client
from django.utils import timezone

from ai import spend
from ai.models import Usage


def put(client: Client, path: str, body: dict[str, Any]) -> Any:
    return client.put(f"/api/ai/{path}", body, "application/json")


def price(client: Client, model: str, input: float, output: float) -> Any:
    body = {"provider": "openai", "model": model, "input": input, "output": output}
    return put(client, "prices", body)


def test_a_call_costs_what_the_owner_says_its_model_costs(owner_client: Client) -> None:
    assert owner_client.get("/api/ai/prices").json() == []
    saved = price(owner_client, "gpt-example", 2.5, 10)
    assert saved.status_code == 200
    assert saved.json() == {
        "provider": "openai",
        "model": "gpt-example",
        "input": 2.5,
        "output": 10,
    }

    # A million tokens in and half a million out, at $2.50 and $10 a million.
    spend.record("ask", "openai", "gpt-example", 1_000_000, 500_000)
    assert Usage.objects.get().cost == Decimal("7.5")
    # A model with no price is used all the same, and its cost is not known.
    spend.record("digest", "openai", "gpt-unpriced", 2_000, 100)
    spend.record("ask", "openai", "gpt-example", 200_000, 0)

    told = owner_client.get("/api/ai/usage").json()
    assert told == {
        "rows": [
            {
                "feature": "digest",
                "model": "gpt-unpriced",
                "requests": 1,
                "tokens_in": 2_000,
                "tokens_out": 100,
                "cost": None,
            },
            {
                "feature": "ask",
                "model": "gpt-example",
                "requests": 2,
                "tokens_in": 1_200_000,
                "tokens_out": 500_000,
                "cost": 8.0,
            },
        ],
        "cost": 8.0,
    }

    # A new price counts from now on; what was already spent stays as it was.
    price(owner_client, "gpt-example", 5, 10)
    assert len(owner_client.get("/api/ai/prices").json()) == 1
    spend.record("ask", "openai", "gpt-example", 1_000_000, 0)
    assert owner_client.get("/api/ai/usage").json()["cost"] == 13.0


def test_usage_is_kept_by_the_month(owner_client: Client) -> None:
    price(owner_client, "gpt-example", 1, 1)
    spend.record("ask", "openai", "gpt-example", 1_000_000, 0)
    first, _ = spend.month()
    # A call on the last day of last month, and one the month before that.
    for back in (first - timedelta(days=1), first - timedelta(days=40)):
        spend.record("watch", "openai", "gpt-example", 3_000_000, 0)
        Usage.objects.filter(feature="watch", at__gte=first).update(at=back)

    this = owner_client.get("/api/ai/usage").json()
    assert [(row["feature"], row["cost"]) for row in this["rows"]] == [("ask", 1.0)]
    last = owner_client.get("/api/ai/usage?period=last").json()
    assert [(row["feature"], row["cost"]) for row in last["rows"]] == [("watch", 3.0)]
    assert owner_client.get("/api/ai/usage?period=ever").status_code == 422
    # Only this month counts towards the limit.
    assert spend.spent() == Decimal(1)


def test_the_months_turn_at_the_first(owner_client: Client) -> None:
    first, following = spend.month()
    assert (first.day, first.hour, following.day) == (1, 0, 1)
    assert first <= timezone.now() < following
    before, until = spend.month(back=1)
    assert until == first
    assert before.day == 1 and before < first
    assert spend.month(back=12)[0].month == first.month


def test_ai_pauses_when_the_month_reaches_the_limit(owner_client: Client) -> None:
    # A new install has a limit of ten dollars, so that a mistake cannot cost more.
    assert owner_client.get("/api/ai/limit").json() == {
        "limit": 10.0,
        "spent": 0.0,
        "paused": False,
    }
    price(owner_client, "gpt-example", 4, 0)
    spend.record("ask", "openai", "gpt-example", 1_000_000, 0)
    assert owner_client.get("/api/ai/limit").json()["spent"] == 4.0
    assert not spend.paused()

    assert put(owner_client, "limit", {"limit": 4}).json() == {
        "limit": 4.0,
        "spent": 4.0,
        "paused": True,
    }
    assert spend.paused()
    assert put(owner_client, "limit", {"limit": 4.01}).json()["paused"] is False
    # No limit never pauses, and a limit of nothing always does.
    assert put(owner_client, "limit", {"limit": None}).json() == {
        "limit": None,
        "spent": 4.0,
        "paused": False,
    }
    assert put(owner_client, "limit", {"limit": 0}).json()["paused"] is True
    # Calls on a model with no price cannot be counted, so they never reach a limit.
    put(owner_client, "limit", {"limit": 5})
    spend.record("ask", "openai", "gpt-unpriced", 900_000_000, 0)
    assert not spend.paused()


def test_what_is_not_a_price_or_a_limit_is_refused(owner_client: Client) -> None:
    assert price(owner_client, "gpt-example", -1, 1).status_code == 422
    assert price(owner_client, "gpt-example", 1, 10_001).status_code == 422
    assert price(owner_client, "", 1, 1).status_code == 422
    assert price(owner_client, "m" * 201, 1, 1).status_code == 422
    body = {"provider": "mistral", "model": "x", "input": 1, "output": 1}
    assert put(owner_client, "prices", body).status_code == 422
    assert put(owner_client, "limit", {"limit": -1}).status_code == 422
    assert put(owner_client, "limit", {"limit": "ten"}).status_code == 422
    assert put(owner_client, "limit", {}).status_code == 422
    assert owner_client.get("/api/ai/prices").json() == []
    assert owner_client.get("/api/ai/limit").json()["limit"] == 10.0


def test_spend_needs_an_open_session(client: Client, db: None) -> None:
    assert client.get("/api/ai/prices").status_code == 401
    assert price(client, "gpt-example", 1, 1).status_code == 401
    assert client.get("/api/ai/usage").status_code == 401
    assert client.get("/api/ai/limit").status_code == 401
    assert put(client, "limit", {"limit": None}).status_code == 401
