"""Rate limiting for every passphrase check, so the passphrase cannot be brute forced.

Each client address gets a few free tries, then waits that double up to a cap. Wrong passphrases
from all addresses together are capped too, so spreading guesses over many addresses does not help.
The counts live in the database: they survive a restart and are shared by every process.
"""

import math
from collections.abc import Callable
from datetime import datetime, timedelta

from django.conf import settings
from django.db import transaction
from django.http import HttpRequest
from django.utils import timezone

from account.models import Throttle

FREE_TRIES = 3
FIRST_WAIT = timedelta(seconds=30)
MAX_WAIT = timedelta(minutes=15)

EVERYONE = "everyone"
EVERYONE_TRIES = 20
EVERYONE_WINDOW = timedelta(hours=1)

FORGET_AFTER = timedelta(days=1)


class TooManyAttempts(Exception):
    """The caller must wait `seconds` before a passphrase will be looked at again."""

    def __init__(self, seconds: int) -> None:
        super().__init__(f"wait {seconds}s")
        self.seconds = seconds


def address(request: HttpRequest) -> str:
    """The visitor's address, which the limit is counted against.

    Behind reverse proxies everyone arrives from the proxy, so the address is read from
    X-Forwarded-For instead: as many entries back from the end as the install says it has
    proxies (see TRUSTED_PROXIES in the settings). Entries before that are whatever the visitor
    chose to send, so they are never believed.
    """
    hops = settings.TRUSTED_PROXIES
    header = str(request.META.get("HTTP_X_FORWARDED_FOR", ""))
    forwarded = [part.strip() for part in header.split(",") if part.strip()]
    if 0 < hops <= len(forwarded):
        return forwarded[-hops][:64]
    return str(request.META.get("REMOTE_ADDR", "unknown"))[:64]


def _wait(row: Throttle, now: datetime) -> int:
    if row.blocked_until is None or row.blocked_until <= now:
        return 0
    return math.ceil((row.blocked_until - now).total_seconds())


def attempt(client: str, check: Callable[[], bool]) -> bool:
    """Runs `check`, the passphrase comparison, if `client` may try now, and returns its result.

    Raises TooManyAttempts without running `check` if they must wait. A wrong result is counted.
    """
    with transaction.atomic():
        now = timezone.now()
        Throttle.objects.filter(last_failure__lt=now - FORGET_AFTER).exclude(key=EVERYONE).delete()

        # Both rows are locked for the whole check, so guesses sent at the same moment queue up
        # one behind another rather than all slipping through before any is counted. Always in
        # the same order, so two requests cannot deadlock.
        for key in (EVERYONE, client):
            Throttle.objects.get_or_create(key=key)
        everyone = Throttle.objects.select_for_update().get(key=EVERYONE)
        mine = Throttle.objects.select_for_update().get(key=client)

        wait = max(_wait(mine, now), _wait(everyone, now))
        if wait:
            raise TooManyAttempts(wait)

        if check():
            mine.delete()
            return True

        mine.failures += 1
        mine.last_failure = now
        if mine.failures >= FREE_TRIES:
            doublings = min(mine.failures - FREE_TRIES, 16)
            mine.blocked_until = now + min(MAX_WAIT, FIRST_WAIT * 2**doublings)
        mine.save()

        if everyone.last_failure is None or now - everyone.last_failure > EVERYONE_WINDOW:
            everyone.failures = 0
        everyone.failures += 1
        everyone.last_failure = now
        if everyone.failures >= EVERYONE_TRIES:
            everyone.failures = 0
            everyone.blocked_until = now + MAX_WAIT
        everyone.save()
        return False
