"""What AI use has cost, and whether the monthly limit has stopped it."""

from datetime import datetime, timedelta
from decimal import Decimal

from django.db.models import Sum
from django.utils import timezone

from account.models import Preferences
from ai.models import ModelPrice, Usage

MILLION = Decimal(1_000_000)


def month(back: int = 0) -> tuple[datetime, datetime]:
    """The start of this month, or of the one `back` months ago, and the start of the next.
    Months turn at midnight UTC, the server's clock."""
    first = timezone.now().replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    for _ in range(back):
        first = (first - timedelta(days=1)).replace(day=1)
    following = (first + timedelta(days=32)).replace(day=1)
    return first, following


def spent() -> Decimal:
    """What this month's calls have cost. Calls on a model with no price are not in it."""
    start, end = month()
    total = Usage.objects.filter(at__gte=start, at__lt=end).aggregate(total=Sum("cost"))
    return total["total"] or Decimal(0)


def paused() -> bool:
    """Whether this month's cost has reached the owner's limit. Every feature asks this before
    it calls a model."""
    limit = Preferences.load().ai_limit
    return limit is not None and spent() >= limit


def record(feature: str, provider: str, model: str, tokens_in: int, tokens_out: int) -> None:
    """Notes one call to a model, at the price the owner has entered for it, if any."""
    price = ModelPrice.objects.filter(provider=provider, model=model).first()
    cost = (tokens_in * price.input + tokens_out * price.output) / MILLION if price else None
    Usage.objects.create(
        feature=feature,
        provider=provider,
        model=model,
        tokens_in=tokens_in,
        tokens_out=tokens_out,
        cost=cost,
    )
