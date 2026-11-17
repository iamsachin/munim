"""Who may call what. There is one account, the owner. A session is signed out, locked or open."""

import time
from typing import Any

from django.conf import settings
from django.contrib.auth import login
from django.contrib.auth.models import User
from django.http import HttpRequest
from django.utils import timezone
from ninja.errors import HttpError
from ninja.security import APIKeyCookie, SessionAuth

from account.models import Device, Preferences

OWNER = "owner"
TOUCH_EVERY_SECONDS = 60


def owner() -> User | None:
    return User.objects.filter(username=OWNER).first()


def is_locked(request: HttpRequest) -> bool:
    """True if the session was locked by hand, or has been idle longer than the owner allows.
    Never, where sign-in is switched off: a lock that opens for anyone locks nothing. Nor
    where sign-in is by email (owner's decision, 2026-11-17): waiting for a mail every few
    minutes would be worse than any passphrase, so a device stays signed in until it is
    signed out or its thirty days are up."""
    if settings.NO_SIGN_IN or settings.EMAIL_SIGN_IN:
        return False
    session = request.session
    if session.get("locked"):
        return True
    minutes = Preferences.load().lock_after_minutes
    seen = session.get("seen")
    if minutes is not None and seen is not None and time.time() - seen > minutes * 60:
        session["locked"] = True
        return True
    return False


def touch(request: HttpRequest) -> None:
    """Notes that the owner is active. At most once a minute, to avoid a write on every request."""
    now = time.time()
    if now - request.session.get("seen", 0) >= TOUCH_EVERY_SECONDS:
        mark_active(request)


def mark_active(request: HttpRequest) -> None:
    request.session["seen"] = time.time()
    Device.objects.filter(session_key=request.session.session_key).update(
        last_seen_at=timezone.now()
    )


class Csrf(APIKeyCookie):
    """For calls made before signing in: no account needed, but the CSRF check still applies."""

    param_name = settings.CSRF_COOKIE_NAME

    def authenticate(self, request: HttpRequest, key: str | None) -> Any:
        return True


class SignedIn(SessionAuth):
    """Signed in, whether or not the session is locked."""


class Open(SessionAuth):
    """Signed in and not locked. A locked session gets 423, so the app can show the lock screen."""

    def authenticate(self, request: HttpRequest, key: str | None) -> Any:
        user = super().authenticate(request, key)
        if user is None:
            return None
        if is_locked(request):
            raise HttpError(423, "Locked")
        touch(request)
        return user


class NoSignIn:
    """Middleware: where sign-in is switched off (MUNIM_NO_SIGN_IN, which the settings allow
    only on an install that answers on its own machine alone), whoever asks is signed in as
    the owner. Until there is an owner, first-run setup is still shown."""

    def __init__(self, get_response: Any) -> None:
        self.get_response = get_response

    def __call__(self, request: HttpRequest) -> Any:
        if settings.NO_SIGN_IN and not request.user.is_authenticated:
            user = owner()
            if user is not None:
                # Imported here: the device list needs the app registry, which is not ready
                # when middleware is first loaded.
                from account import devices

                login(request, user)
                devices.remember(request)
                mark_active(request)
        return self.get_response(request)


class AdminLock:
    """Middleware: the admin is closed to a locked session, like the rest of the app."""

    def __init__(self, get_response: Any) -> None:
        self.get_response = get_response

    def __call__(self, request: HttpRequest) -> Any:
        if (
            request.path.startswith("/admin/")
            and request.user.is_authenticated
            and is_locked(request)
        ):
            from django.shortcuts import redirect

            return redirect("/")
        return self.get_response(request)
