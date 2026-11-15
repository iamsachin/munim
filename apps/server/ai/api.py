"""AI settings: the owner's key for each provider, and the model each feature runs on."""

from typing import Any, Literal

from django.http import HttpRequest
from django.utils import timezone
from ninja import Field, Router, Schema, Status

from account.auth import Open
from ai import providers
from ai.models import Feature, FeatureModel, Provider, ProviderKey
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
    # Whether the provider accepted it when it was last asked.
    ok: bool
    # The models the provider lists for it, newest first. Empty without an accepted key.
    models: list[str]


def _out(provider: str, key: ProviderKey | None) -> KeyOut:
    return KeyOut.model_validate(
        {
            "provider": provider,
            "tail": key.tail if key else None,
            "ok": bool(key and key.ok),
            "models": key.models if key and key.ok else [],
        }
    )


def asked(listed: list[str] | None) -> dict[str, Any]:
    """What to keep of a provider's answer: its models, or that it rejected the key."""
    return {"models": listed or [], "ok": listed is not None, "checked_at": timezone.now()}


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
        listed = providers.models_of(Provider(provider), key)
    except providers.Unreachable as problem:
        return Status(502, Error(detail=str(problem)))
    stored, _ = ProviderKey.objects.update_or_create(
        provider=provider,
        defaults={"sealed": vault.seal(key), "tail": key[-4:], **asked(listed)},
    )
    return Status(200, _out(provider, stored))


@router.delete("/ai/keys/{provider}", response={204: None})
def remove_key(request: HttpRequest, provider: ProviderCode) -> Status[None]:
    ProviderKey.objects.filter(provider=provider).delete()
    return Status(204, None)


FeatureCode = Literal["digest", "ask", "watch"]


class ChoiceIn(Schema):
    provider: ProviderCode
    model: str = Field(max_length=200)


class ChoiceOut(Schema):
    """The model a feature runs on. Both null: none chosen, so the feature is off."""

    feature: FeatureCode
    provider: ProviderCode | None
    model: str | None


def _choice(feature: str, chosen: FeatureModel | None) -> ChoiceOut:
    return ChoiceOut.model_validate(
        {
            "feature": feature,
            "provider": chosen.provider if chosen else None,
            "model": chosen.model if chosen else None,
        }
    )


@router.get("/ai/features", response=list[ChoiceOut])
def list_features(request: HttpRequest) -> list[ChoiceOut]:
    chosen = FeatureModel.objects.in_bulk()
    return [_choice(feature, chosen.get(feature)) for feature in Feature.values]


@router.put("/ai/features/{feature}", response={200: ChoiceOut, 422: Error})
def choose_model(
    request: HttpRequest, feature: FeatureCode, body: ChoiceIn
) -> Status[ChoiceOut] | Status[Error]:
    """Sets the model a feature runs on: one its provider lists for the owner's accepted key."""
    key = ProviderKey.objects.filter(provider=body.provider, ok=True).first()
    if key is None or body.model not in key.models:
        name = Provider(body.provider).label
        return Status(422, Error(detail=f"{name} does not list that model for your key."))
    chosen, _ = FeatureModel.objects.update_or_create(
        feature=feature, defaults={"provider": body.provider, "model": body.model}
    )
    return Status(200, _choice(feature, chosen))
