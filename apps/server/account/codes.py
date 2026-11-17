"""One-time codes mailed to the owner, where an install signs in by email.

A code signs the owner in, or confirms that everything is to be deleted. It is six digits,
works once and for ten minutes, and is kept only as a keyed hash. Whether a code is right is
decided in one place, `right()`, which is only ever called under the rate limit that guards the
passphrase (`attempt()` in account/throttle.py).
"""

import hmac
import secrets
from datetime import timedelta
from smtplib import SMTPException

from django.conf import settings
from django.core.mail import send_mail
from django.db import transaction
from django.utils import timezone
from django.utils.crypto import salted_hmac

from account.models import Code

VALID_FOR = timedelta(minutes=10)
# How often a code may be asked for, and how many in an hour: whoever can reach the sign-in
# screen can ask, and the owner's inbox must not fill because of it.
SEND_EVERY = timedelta(seconds=60)
MOST_AN_HOUR = 6
HOUR = timedelta(hours=1)
# Wrong guesses at one code before it is thrown away. The rate limit stops a guesser long
# before; this holds even if the limit were ever loosened.
MOST_WRONG = 5

WORDS = {
    Code.Purpose.SIGN_IN: ("Your Munim sign-in code", "to sign in to Munim"),
    Code.Purpose.CONFIRM: (
        "Your Munim code to delete everything",
        "to confirm that everything in Munim is to be deleted",
    ),
}


class TooSoon(Exception):
    """A code was asked for too soon after the last; `seconds` is how long to wait."""

    def __init__(self, seconds: int) -> None:
        super().__init__(f"wait {seconds}s")
        self.seconds = seconds


class Unsent(Exception):
    """The mail could not be handed over, so there is no code."""


def _hashed(code: str) -> str:
    return salted_hmac("munim.account.code", code, algorithm="sha256").hexdigest()


def send(purpose: str) -> None:
    """Makes a new code for the purpose, in place of any other, and mails it to the owner."""
    now = timezone.now()
    with transaction.atomic():
        row, _ = Code.objects.select_for_update().get_or_create(
            purpose=purpose, defaults={"made_at": now, "hour_from": now}
        )
        if row.sent and now - row.made_at < SEND_EVERY:
            raise TooSoon(int((row.made_at + SEND_EVERY - now).total_seconds()) + 1)
        if now - row.hour_from >= HOUR:
            row.hour_from, row.sent = now, 0
        if row.sent >= MOST_AN_HOUR:
            raise TooSoon(int((row.hour_from + HOUR - now).total_seconds()) + 1)
        code = f"{secrets.randbelow(10**6):06d}"
        row.hashed, row.made_at, row.wrong, row.sent = _hashed(code), now, 0, row.sent + 1
        row.save()
    subject, what = WORDS[Code.Purpose(purpose)]
    body = (
        f"{code}\n\nThis is the code {what}. It works once, for ten minutes.\n"
        "If you did not ask for it, you can ignore this mail."
    )
    try:
        send_mail(subject, body, None, [settings.OWNER_EMAIL])
    except (SMTPException, OSError):
        # The code never left, so it must not stay good.
        Code.objects.filter(purpose=purpose).update(hashed="")
        raise Unsent from None


def right(purpose: str, given: str) -> bool:
    """Whether `given` is the live code for the purpose. A right code is used up; a code
    guessed wrong too often is thrown away."""
    with transaction.atomic():
        row = Code.objects.select_for_update().filter(purpose=purpose).first()
        if row is None or not row.hashed or timezone.now() - row.made_at > VALID_FOR:
            return False
        if hmac.compare_digest(row.hashed, _hashed(given.strip())):
            row.hashed = ""
            row.save(update_fields=["hashed"])
            return True
        row.wrong += 1
        if row.wrong >= MOST_WRONG:
            row.hashed = ""
        row.save(update_fields=["wrong", "hashed"])
        return False
