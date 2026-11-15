from decimal import Decimal

from django.db import models


class Throttle(models.Model):
    """Wrong passphrases counted for one client address, or for everyone together."""

    key = models.CharField(max_length=64, unique=True)
    failures = models.PositiveIntegerField(default=0)
    blocked_until = models.DateTimeField(null=True, blank=True)
    last_failure = models.DateTimeField(null=True, blank=True)

    def __str__(self) -> str:
        return f"{self.key}: {self.failures} wrong"


class Device(models.Model):
    """A signed-in browser. Tied to its session by key; the key itself never leaves the server."""

    session_key = models.CharField(max_length=40, unique=True)
    user_agent = models.CharField(max_length=300)
    created_at = models.DateTimeField(auto_now_add=True)
    last_seen_at = models.DateTimeField(auto_now_add=True)

    def __str__(self) -> str:
        return f"device {self.pk}"


class Preferences(models.Model):
    """The owner's server-side settings. There is one row."""

    # Minutes without activity before the app locks; null for never.
    lock_after_minutes = models.PositiveSmallIntegerField(null=True, blank=True, default=15)
    # Dollars of AI use in a month at which AI pauses; null for no limit.
    ai_limit = models.DecimalField(
        max_digits=8, decimal_places=2, null=True, blank=True, default=Decimal(10)
    )

    # Whether digests are written. Off until the owner switches it on: it calls a model
    # without being asked each time.
    digest_on = models.BooleanField(default=False)
    # The owner's time zone, as their browser named it when Digest was switched on ("" until
    # then): "at seven" is on their clock, not the server's.
    time_zone = models.CharField(max_length=64, blank=True)

    def __str__(self) -> str:
        return "preferences"

    @classmethod
    def load(cls) -> "Preferences":
        return cls.objects.get_or_create(pk=1)[0]
