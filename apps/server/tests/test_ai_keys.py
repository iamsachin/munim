from typing import Any

import httpx2
import pytest
from django.test import Client

from ai.models import FeatureModel, ProviderKey
from ai.tasks import refresh_models
from munim import vault

# Made up, and built from parts so that no scanner takes them for real keys.
OPENAI_KEY = "sk-proj-" + "a" * 16 + "WXYZ"
ANTHROPIC_KEY = "sk-ant-" + "b" * 16 + "QRST"

MODELS: dict[str, dict[str, Any]] = {
    "api.openai.com": {
        "object": "list",
        "data": [
            {"id": "gpt-older", "object": "model", "created": 1, "owned_by": "openai"},
            {"id": "gpt-example", "object": "model", "created": 2, "owned_by": "openai"},
            # Not models that answer in text, so not ones a feature can run on.
            {"id": "gpt-image-example", "object": "model", "created": 3, "owned_by": "openai"},
            {"id": "text-embedding-example", "object": "model", "created": 0, "owned_by": "x"},
            {"id": "gpt-example-mini-tts", "object": "model", "created": 4, "owned_by": "x"},
        ],
    },
    "api.anthropic.com": {
        "data": [
            {
                "id": "claude-example",
                "type": "model",
                "display_name": "Example",
                "created_at": "2026-01-01T00:00:00Z",
            }
        ],
        "has_more": False,
        "first_id": "claude-example",
        "last_id": "claude-example",
    },
}


@pytest.fixture
def provider(monkeypatch: pytest.MonkeyPatch) -> Any:
    """Stands in for both providers. `seen` lists what each was sent; `status` is its answer."""

    class Stand:
        seen: list[tuple[str, str, str]] = []
        status = 200

    stand = Stand()
    stand.seen = []

    def handler(request: httpx2.Request) -> httpx2.Response:
        # Which header carries the key is the SDK's business; that it was sent is ours.
        headers = request.headers
        sent = (headers.get("x-api-key") or headers.get("authorization") or "").removeprefix(
            "Bearer "
        )
        stand.seen.append((request.url.host, request.url.path, sent))
        if stand.status == 0:
            raise httpx2.ConnectError("no route", request=request)
        if stand.status != 200:
            return httpx2.Response(stand.status, json={"error": {"message": "no", "type": "x"}})
        return httpx2.Response(200, json=MODELS[request.url.host])

    monkeypatch.setattr("ai.providers.TRANSPORT", httpx2.MockTransport(handler))
    return stand


def put(client: Client, name: str, key: str) -> Any:
    return client.put(f"/api/ai/keys/{name}", {"key": key}, "application/json")


def test_there_are_no_keys_to_begin_with(owner_client: Client) -> None:
    assert owner_client.get("/api/ai/keys").json() == [
        {"provider": "openai", "tail": None, "ok": False, "models": []},
        {"provider": "anthropic", "tail": None, "ok": False, "models": []},
    ]


def test_a_key_the_provider_accepts_is_stored_sealed_and_never_sent_back(
    owner_client: Client, provider: Any
) -> None:
    saved = put(owner_client, "openai", f"  {OPENAI_KEY}\n")
    assert saved.status_code == 200
    # Its models come with it, as the provider lists them, newest first.
    assert saved.json() == {
        "provider": "openai",
        "tail": "WXYZ",
        "ok": True,
        "models": ["gpt-example", "gpt-older"],
    }
    assert provider.seen == [("api.openai.com", "/v1/models", OPENAI_KEY)]

    assert put(owner_client, "anthropic", ANTHROPIC_KEY).json()["ok"] is True
    assert provider.seen[1] == ("api.anthropic.com", "/v1/models", ANTHROPIC_KEY)

    listed = owner_client.get("/api/ai/keys")
    assert [(k["tail"], k["ok"]) for k in listed.json()] == [("WXYZ", True), ("QRST", True)]
    assert OPENAI_KEY not in listed.content.decode()

    stored = ProviderKey.objects.get(provider="openai")
    assert OPENAI_KEY not in stored.sealed
    assert vault.unseal(stored.sealed) == OPENAI_KEY


def test_a_key_the_provider_rejects_is_kept_and_marked(owner_client: Client, provider: Any) -> None:
    provider.status = 401
    assert put(owner_client, "anthropic", ANTHROPIC_KEY).json() == {
        "provider": "anthropic",
        "tail": "QRST",
        "ok": False,
        "models": [],
    }


@pytest.mark.parametrize(
    ("status", "said"),
    [
        (500, "OpenAI answered 500, so the key was not checked."),
        (403, "OpenAI answered 403, so the key was not checked."),
        (0, "OpenAI could not be reached, so the key was not checked."),
    ],
)
def test_if_the_provider_cannot_be_asked_nothing_changes(
    owner_client: Client, provider: Any, status: int, said: str
) -> None:
    put(owner_client, "openai", OPENAI_KEY)
    provider.status = status
    other = "sk-proj-" + "c" * 16 + "LMNO"
    refused = put(owner_client, "openai", other)
    assert refused.status_code == 502
    assert refused.json() == {"detail": said}
    assert other not in refused.content.decode()
    assert owner_client.get("/api/ai/keys").json()[0] == {
        "provider": "openai",
        "tail": "WXYZ",
        "ok": True,
        "models": ["gpt-example", "gpt-older"],
    }


def test_something_too_short_to_be_a_key_is_refused_without_asking(
    owner_client: Client, provider: Any
) -> None:
    refused = put(owner_client, "openai", "  short ")
    assert refused.status_code == 422
    assert refused.json() == {"detail": "That is too short to be an API key."}
    assert provider.seen == []
    assert put(owner_client, "mistral", OPENAI_KEY).status_code == 422


def test_a_key_can_be_removed(owner_client: Client, provider: Any) -> None:
    put(owner_client, "openai", OPENAI_KEY)
    assert owner_client.delete("/api/ai/keys/openai").status_code == 204
    assert owner_client.get("/api/ai/keys").json()[0]["tail"] is None
    assert not ProviderKey.objects.exists()
    # Removing what is not there is not an error.
    assert owner_client.delete("/api/ai/keys/openai").status_code == 204


def choose(client: Client, feature: str, provider: str, model: str) -> Any:
    body = {"provider": provider, "model": model}
    return client.put(f"/api/ai/features/{feature}", body, "application/json")


def test_each_feature_runs_on_a_model_its_provider_lists(
    owner_client: Client, provider: Any
) -> None:
    off = {"provider": None, "model": None}
    assert owner_client.get("/api/ai/features").json() == [
        {"feature": "digest", **off},
        {"feature": "ask", **off},
        {"feature": "watch", **off},
    ]
    # Without an accepted key there is nothing to choose from.
    assert choose(owner_client, "ask", "openai", "gpt-example").status_code == 422

    put(owner_client, "openai", OPENAI_KEY)
    chosen = choose(owner_client, "ask", "openai", "gpt-example")
    assert chosen.status_code == 200
    assert chosen.json() == {"feature": "ask", "provider": "openai", "model": "gpt-example"}
    assert choose(owner_client, "ask", "openai", "gpt-older").json()["model"] == "gpt-older"
    assert owner_client.get("/api/ai/features").json()[1]["model"] == "gpt-older"
    assert FeatureModel.objects.count() == 1

    # Not a model that provider lists, not a provider with a key, not a feature.
    refused = choose(owner_client, "ask", "openai", "claude-example")
    assert refused.status_code == 422
    assert refused.json() == {"detail": "OpenAI does not list that model for your key."}
    assert choose(owner_client, "ask", "anthropic", "claude-example").status_code == 422
    assert choose(owner_client, "summary", "openai", "gpt-example").status_code == 422
    assert owner_client.get("/api/ai/features").json()[1]["model"] == "gpt-older"

    # The choice outlives its key, so it is back when the key is.
    owner_client.delete("/api/ai/keys/openai")
    assert owner_client.get("/api/ai/features").json()[1]["model"] == "gpt-older"


def test_the_daily_check_learns_new_models_and_a_withdrawn_key(
    owner_client: Client, provider: Any, monkeypatch: pytest.MonkeyPatch
) -> None:
    put(owner_client, "openai", OPENAI_KEY)
    put(owner_client, "anthropic", ANTHROPIC_KEY)
    newer = {"id": "gpt-newer", "object": "model", "created": 9, "owned_by": "openai"}
    listed: dict[str, Any] = MODELS["api.openai.com"]
    monkeypatch.setitem(listed, "data", [*listed["data"], newer])
    provider.seen.clear()

    refresh_models(timestamp=0)
    openai, anthropic = owner_client.get("/api/ai/keys").json()
    assert openai["models"] == ["gpt-newer", "gpt-example", "gpt-older"]
    assert anthropic["models"] == ["claude-example"]
    # Each provider was asked with its own key, read back from where it is sealed.
    assert {(host, key) for host, _, key in provider.seen} == {
        ("api.openai.com", OPENAI_KEY),
        ("api.anthropic.com", ANTHROPIC_KEY),
    }

    # A provider that cannot be asked teaches nothing: what is stored stands.
    provider.status = 500
    refresh_models(timestamp=0)
    assert owner_client.get("/api/ai/keys").json()[0]["models"][0] == "gpt-newer"

    # A key withdrawn at the provider is shown as rejected, with nothing to choose from.
    provider.status = 401
    refresh_models(timestamp=0)
    assert [(k["ok"], k["models"]) for k in owner_client.get("/api/ai/keys").json()] == [
        (False, []),
        (False, []),
    ]
    assert vault.unseal(ProviderKey.objects.get(provider="openai").sealed) == OPENAI_KEY


def test_keys_need_an_open_session(client: Client, db: None, provider: Any) -> None:
    assert client.get("/api/ai/keys").status_code == 401
    assert put(client, "openai", OPENAI_KEY).status_code == 401
    assert client.delete("/api/ai/keys/openai").status_code == 401
    assert client.get("/api/ai/features").status_code == 401
    assert choose(client, "ask", "openai", "gpt-example").status_code == 401
    assert provider.seen == []


def test_the_security_screen_is_told_facts_not_secrets(
    owner_client: Client, provider: Any, settings: Any
) -> None:
    # Nothing has been sealed yet, so no key file has been made.
    assert owner_client.get("/api/security").json() == {
        "master_key": "unmade",
        "sealed": 0,
        "sign_ins": 0,
    }
    put(owner_client, "openai", OPENAI_KEY)
    told = owner_client.get("/api/security")
    assert told.json() == {"master_key": "file", "sealed": 1, "sign_ins": 0}
    assert OPENAI_KEY not in told.content.decode()

    from cryptography.fernet import Fernet

    settings.MASTER_KEY = Fernet.generate_key().decode()
    assert owner_client.get("/api/security").json()["master_key"] == "environment"
    assert settings.MASTER_KEY not in owner_client.get("/api/security").content.decode()


def test_security_facts_need_an_open_session(client: Client, db: None) -> None:
    assert client.get("/api/security").status_code == 401
