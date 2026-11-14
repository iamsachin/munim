"""Signed-in browsers: what to call them, and keeping the list in step with sessions."""

from django.contrib.sessions.models import Session
from django.http import HttpRequest
from django.utils import timezone

from account.models import Device

# Order matters: Edge and Opera also say "Chrome", and Chrome also says "Safari".
_BROWSERS = [("Edg/", "Edge"), ("OPR/", "Opera"), ("Firefox/", "Firefox"), ("Chrome/", "Chrome")]
_SYSTEMS = [
    ("iPhone", "iPhone"),
    ("iPad", "iPad"),
    ("Android", "Android"),
    ("Windows", "Windows"),
    ("Mac OS X", "macOS"),
    ("Linux", "Linux"),
]


def device_name(user_agent: str) -> str:
    """A short name such as "Firefox on Linux" from a browser's User-Agent header."""
    browser = next((name for mark, name in _BROWSERS if mark in user_agent), None)
    if browser is None and "Safari/" in user_agent:
        browser = "Safari"
    system = next((name for mark, name in _SYSTEMS if mark in user_agent), None)
    if browser and system:
        return f"{browser} on {system}"
    return browser or system or "Unknown browser"


def remember(request: HttpRequest) -> None:
    """Records the browser that has just signed in."""
    if request.session.session_key is None:
        request.session.save()
    Device.objects.update_or_create(
        session_key=request.session.session_key,
        defaults={"user_agent": request.headers.get("User-Agent", "")[:300]},
    )


def current() -> list[Device]:
    """The devices whose sessions are still alive. Rows for dead sessions are dropped."""
    alive = Session.objects.filter(expire_date__gt=timezone.now()).values("session_key")
    Device.objects.exclude(session_key__in=alive).delete()
    return list(Device.objects.order_by("-last_seen_at"))


def revoke(device: Device) -> None:
    Session.objects.filter(session_key=device.session_key).delete()
    device.delete()
