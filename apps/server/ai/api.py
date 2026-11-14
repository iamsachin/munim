"""AI settings: the owner's key for each provider."""

from typing import Literal

from django.http import HttpRequest
from django.utils import timezone
from ninja import Field, Router, Schema, Status

from account.auth import Open
from ai import providers
from ai.models import Provider, ProviderKey
from munim import vault

router = Router(tags=["ai"], auth=Open())

ProviderCode = Literal["openai", "anthropic"]
MIN_KEY = 8


class Error(Schema):
    detail: str


class KeyIn(Schema):
    key: str = Field(max_length=500)


class KeyOut(Schema):
    """What the browser may know about a stored key. Never the key."""

    provider: ProviderCode
    # The key's last four characters; null if there is no key.
    tail: str | None
    # Whether the provider accepted it when it was saved.
    ok: bool


def _out(provider: str, key: ProviderKey | None) -> KeyOut:
    return KeyOut.model_validate(
        {"provider": provider, "tail": key.tail if key else None, "ok": bool(key and key.ok)}
    )


@router.get("/ai/keys", response=list[KeyOut])
def list_keys(request: HttpRequest) -> list[KeyOut]:
    stored = ProviderKey.objects.in_bulk()
    return [_out(provider, stored.get(provider)) for provider in Provider.values]


@router.put("/ai/keys/{provider}", response={200: KeyOut, 422: Error, 502: Error})
def set_key(
    request: HttpRequest, provider: ProviderCode, body: KeyIn
) -> Status[KeyOut] | Status[Error]:
    """Stores a key, sealed, after asking the provider whether it accepts it. A key the provider
    rejects is stored too, marked as rejected, so the owner sees which key that was."""
    key = body.key.strip()
    if len(key) < MIN_KEY:
        return Status(422, Error(detail="That is too short to be an API key."))
    try:
        ok = providers.accepts(Provider(provider), key)
    except providers.Unreachable as problem:
        return Status(502, Error(detail=str(problem)))
    stored, _ = ProviderKey.objects.update_or_create(
        provider=provider,
        defaults={
            "sealed": vault.seal(key),
            "tail": key[-4:],
            "ok": ok,
            "checked_at": timezone.now(),
        },
    )
    return Status(200, _out(provider, stored))


@router.delete("/ai/keys/{provider}", response={204: None})
def remove_key(request: HttpRequest, provider: ProviderCode) -> Status[None]:
    ProviderKey.objects.filter(provider=provider).delete()
    return Status(204, None)
