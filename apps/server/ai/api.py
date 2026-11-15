"""AI settings: the owner's key for each provider, and the model each feature runs on."""

from typing import Any, Literal

from django.db.models import Count, Sum
from django.http import HttpRequest
from django.utils import timezone
from ninja import Field, Router, Schema, Status

from account.auth import Open
from account.models import Preferences
from ai import providers, spend
from ai.models import Feature, FeatureModel, ModelPrice, Provider, ProviderKey, Usage
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


class Price(Schema):
    """What a model costs, in dollars for a million tokens, as the owner entered it."""

    provider: ProviderCode
    model: str = Field(min_length=1, max_length=200)
    input: float = Field(ge=0, le=10_000)
    output: float = Field(ge=0, le=10_000)


@router.get("/ai/prices", response=list[Price])
def list_prices(request: HttpRequest) -> list[ModelPrice]:
    return list(ModelPrice.objects.order_by("provider", "model"))


@router.put("/ai/prices", response=Price)
def set_price(request: HttpRequest, body: Price) -> ModelPrice:
    """Sets a model's price. It counts for calls made from now on; past calls keep their cost."""
    price, _ = ModelPrice.objects.update_or_create(
        provider=body.provider,
        model=body.model,
        defaults={"input": round(body.input, 4), "output": round(body.output, 4)},
    )
    return price


class Limit(Schema):
    # Dollars in a month; null for no limit.
    limit: float | None = Field(ge=0, le=100_000)


class LimitOut(Limit):
    # What this month has cost so far, and whether that has reached the limit.
    spent: float
    paused: bool


def _limit() -> LimitOut:
    limit = Preferences.load().ai_limit
    return LimitOut.model_validate(
        {"limit": limit, "spent": spend.spent(), "paused": spend.paused()}
    )


@router.get("/ai/limit", response=LimitOut)
def get_limit(request: HttpRequest) -> LimitOut:
    return _limit()


@router.put("/ai/limit", response=LimitOut)
def set_limit(request: HttpRequest, body: Limit) -> LimitOut:
    Preferences.objects.update_or_create(
        pk=1, defaults={"ai_limit": None if body.limit is None else round(body.limit, 2)}
    )
    return _limit()


class UsageRow(Schema):
    feature: FeatureCode
    model: str
    requests: int
    tokens_in: int
    tokens_out: int
    # Null if no call in the row had a price, so nothing is known of its cost.
    cost: float | None


class UsageOut(Schema):
    rows: list[UsageRow]
    cost: float


@router.get("/ai/usage", response=UsageOut)
def usage(request: HttpRequest, period: Literal["this", "last"] = "this") -> UsageOut:
    """A month's calls, summed for each feature and model."""
    start, end = spend.month(back=1 if period == "last" else 0)
    rows = (
        Usage.objects.filter(at__gte=start, at__lt=end)
        .values("feature", "model")
        .annotate(
            requests=Count("id"),
            tokens_in=Sum("tokens_in"),
            tokens_out=Sum("tokens_out"),
            cost=Sum("cost"),
        )
        .order_by("model")
    )
    # In the order the features are listed everywhere else.
    ordered = sorted(rows, key=lambda row: Feature.values.index(row["feature"]))
    total = sum(row["cost"] or 0 for row in ordered)
    return UsageOut.model_validate({"rows": ordered, "cost": total})
