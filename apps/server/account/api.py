"""Sign-in, sessions and devices. Every passphrase check here goes through `_check`."""

from collections.abc import Callable
from datetime import datetime
from typing import Literal

from django.conf import settings
from django.contrib.auth import login, logout, update_session_auth_hash
from django.contrib.auth.models import User
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError
from django.db import IntegrityError
from django.http import FileResponse, HttpRequest, HttpResponse
from django.shortcuts import get_object_or_404
from django.utils import timezone
from django.views.decorators.csrf import ensure_csrf_cookie
from ninja import Field, Router, Schema, Status
from ninja.decorators import decorate_view

from account import codes, devices
from account.auth import OWNER, Csrf, Open, SignedIn, is_locked, mark_active, owner
from account.models import Code, Device, Preferences
from account.throttle import TooManyAttempts, address, attempt
from ai.models import ProviderKey
from munim import data, vault
from reader.models import Connection

router = Router(tags=["account"])

State = Literal["setup", "signed_out", "locked", "open"]


class SessionOut(Schema):
    state: State
    # How this install lets its owner in: by passphrase, or by a code that is sent to their
    # email address or, on an install with no mail, written to the server's log.
    sign_in: Literal["passphrase", "email", "log"]


def _way() -> Literal["passphrase", "email", "log"]:
    if settings.CODES_TO_LOG:
        return "log"
    return "email" if settings.CODE_SIGN_IN else "passphrase"


class CodeIn(Schema):
    code: str = Field(min_length=1, max_length=12)


class ConfirmIn(Schema):
    """What confirms that everything is to be deleted: the passphrase, or where sign-in is by
    email the code just mailed for it."""

    passphrase: str = Field("", max_length=1024)
    code: str = Field("", max_length=12)


BY_CODE = "This Munim signs in with a code."
BY_PASSPHRASE = "This Munim signs in with a passphrase."  # noqa: S105  words for the owner, not a secret


class PassphraseIn(Schema):
    # The upper bound stops a huge value being fed to the slow password hash.
    passphrase: str = Field(max_length=1024)


class ChangeIn(Schema):
    current: str = Field(max_length=1024)
    new: str = Field(max_length=1024)


class Error(Schema):
    detail: str


class Wait(Schema):
    detail: str
    wait_seconds: int


class DeviceOut(Schema):
    id: int
    name: str
    last_seen: datetime
    current: bool


class SecurityOut(Schema):
    """What the Security screen says about encryption. Facts, read from this install."""

    # Where the master key that seals secrets comes from: MUNIM_MASTER_KEY, or a file in the
    # data folder, which is made when the first secret is sealed ("unmade" until then).
    master_key: Literal["environment", "file", "unmade"]
    # How many secrets are sealed with it now: API keys, and sign-ins to sources.
    sealed: int
    sign_ins: int


class LockSettings(Schema):
    minutes: Literal[5, 15, 60] | None


def _state(request: HttpRequest) -> State:
    if not request.user.is_authenticated:
        # By email there is nothing to set up: the first code sent makes the owner.
        return "signed_out" if owner() or settings.CODE_SIGN_IN else "setup"
    return "locked" if is_locked(request) else "open"


def _guarded(
    request: HttpRequest, response: HttpResponse, check: Callable[[], bool], wrong: int, said: str
) -> Status[Error] | Status[Wait] | None:
    """Runs a check of a secret under the rate limit. Returns the refusal, or None if right.

    `wrong` is the status for a wrong secret: 401 when signing in, 403 from a session that is
    already signed in, so the app can tell "wrong" from "you are no longer signed in".
    """
    try:
        right = attempt(address(request), check)
    except TooManyAttempts as wait:
        response["Retry-After"] = str(wait.seconds)
        return Status(429, Wait(detail="Too many attempts.", wait_seconds=wait.seconds))
    return None if right else Status(wrong, Error(detail=said))


def _check(
    request: HttpRequest, response: HttpResponse, passphrase: str, *, wrong: int = 401
) -> Status[Error] | Status[Wait] | None:
    """Checks the owner's passphrase under the rate limit."""
    user = owner()
    return _guarded(
        request,
        response,
        lambda: user is not None and user.check_password(passphrase),
        wrong,
        "That passphrase is not right.",
    )


def _check_code(
    request: HttpRequest, response: HttpResponse, purpose: str, code: str, *, wrong: int = 401
) -> Status[Error] | Status[Wait] | None:
    """Checks a mailed code under the same rate limit as the passphrase."""
    return _guarded(
        request,
        response,
        lambda: codes.right(purpose, code),
        wrong,
        "That code is not right, or is no longer good. Ask for a new one.",
    )


def _send_code(response: HttpResponse, purpose: str) -> Status[None] | Status[Error] | Status[Wait]:
    if not settings.CODE_SIGN_IN:
        return Status(409, Error(detail=BY_PASSPHRASE))
    try:
        codes.send(purpose)
    except codes.TooSoon as wait:
        response["Retry-After"] = str(wait.seconds)
        return Status(429, Wait(detail="A code was sent a moment ago.", wait_seconds=wait.seconds))
    except codes.Unsent:
        return Status(
            502, Error(detail="The code could not be sent. Check this install's mail settings.")
        )
    return Status(204, None)


def _weak(passphrase: str) -> Status[Error] | None:
    try:
        validate_password(passphrase)
    except ValidationError as problems:
        # Django's own wording says "password"; Munim says passphrase, and says it briefly.
        short = next((e for e in problems.error_list if e.code == "password_too_short"), None)
        if short is not None and short.params:
            return Status(
                422, Error(detail=f"Use at least {short.params['min_length']} characters.")
            )
        return Status(422, Error(detail=" ".join(problems.messages)))
    return None


def _open(request: HttpRequest, user: User) -> Status[SessionOut]:
    login(request, user)
    devices.remember(request)
    mark_active(request)
    return Status(200, SessionOut(state="open", sign_in=_way()))


@router.get("/session", response=SessionOut, summary="Where this browser stands")
@decorate_view(ensure_csrf_cookie)
def session(request: HttpRequest) -> SessionOut:
    """Also sets the CSRF cookie, so call it before anything else."""
    return SessionOut(state=_state(request), sign_in=_way())


@router.post("/setup", auth=Csrf(), response={200: SessionOut, 409: Error, 422: Error})
def setup(request: HttpRequest, body: PassphraseIn) -> Status[SessionOut] | Status[Error]:
    """First run: sets the passphrase and signs in. Works once."""
    if settings.CODE_SIGN_IN:
        return Status(409, Error(detail=BY_CODE))
    if owner():
        return Status(409, Error(detail="Munim is already set up."))
    if weak := _weak(body.passphrase):
        return weak
    try:
        user = User.objects.create_superuser(OWNER, password=body.passphrase)
    except IntegrityError:
        # Two set-ups at the same moment: the other one won.
        return Status(409, Error(detail="Munim is already set up."))
    return _open(request, user)


@router.post("/sign-in", auth=Csrf(), response={200: SessionOut, 401: Error, 409: Error, 429: Wait})
def sign_in(
    request: HttpRequest, response: HttpResponse, body: PassphraseIn
) -> Status[SessionOut] | Status[Error] | Status[Wait]:
    # One way in at a time: where codes are mailed, the passphrase opens nothing.
    if settings.CODE_SIGN_IN:
        return Status(409, Error(detail=BY_CODE))
    if refusal := _check(request, response, body.passphrase):
        return refusal
    user = owner()
    assert user is not None  # noqa: S101  a right passphrase means there is an owner
    return _open(request, user)


@router.post("/sign-in/code", auth=Csrf(), response={204: None, 409: Error, 429: Wait, 502: Error})
def send_sign_in_code(
    request: HttpRequest, response: HttpResponse
) -> Status[None] | Status[Error] | Status[Wait]:
    """Mails the owner a code to sign in with. Nobody says who they are: the code only ever
    goes to the owner's address, which whoever runs the install has set."""
    return _send_code(response, Code.Purpose.SIGN_IN)


@router.post(
    "/sign-in/code/confirm",
    auth=Csrf(),
    response={200: SessionOut, 401: Error, 409: Error, 429: Wait},
)
def sign_in_with_code(
    request: HttpRequest, response: HttpResponse, body: CodeIn
) -> Status[SessionOut] | Status[Error] | Status[Wait]:
    if not settings.CODE_SIGN_IN:
        return Status(409, Error(detail=BY_PASSPHRASE))
    if refusal := _check_code(request, response, Code.Purpose.SIGN_IN, body.code):
        return refusal
    # The first right code on a new install makes the owner; they have no passphrase.
    user = owner() or User.objects.create_superuser(OWNER, email=settings.OWNER_EMAIL)
    return _open(request, user)


@router.post("/confirm/code", auth=Open(), response={204: None, 409: Error, 429: Wait, 502: Error})
def send_confirm_code(
    request: HttpRequest, response: HttpResponse
) -> Status[None] | Status[Error] | Status[Wait]:
    """Mails the owner a code to confirm that everything is to be deleted."""
    return _send_code(response, Code.Purpose.CONFIRM)


@router.post("/sign-out", auth=SignedIn(), response={204: None})
def sign_out(request: HttpRequest) -> Status[None]:
    Device.objects.filter(session_key=request.session.session_key).delete()
    logout(request)
    return Status(204, None)


@router.post("/lock", auth=SignedIn(), response={204: None})
def lock(request: HttpRequest) -> Status[None]:
    request.session["locked"] = True
    return Status(204, None)


@router.post("/unlock", auth=SignedIn(), response={200: SessionOut, 403: Error, 429: Wait})
def unlock(
    request: HttpRequest, response: HttpResponse, body: PassphraseIn
) -> Status[SessionOut] | Status[Error] | Status[Wait]:
    if refusal := _check(request, response, body.passphrase, wrong=403):
        return refusal
    request.session["locked"] = False
    mark_active(request)
    return Status(200, SessionOut(state="open", sign_in=_way()))


@router.post("/passphrase", auth=Open(), response={204: None, 403: Error, 422: Error, 429: Wait})
def change_passphrase(
    request: HttpRequest, response: HttpResponse, body: ChangeIn
) -> Status[None] | Status[Error] | Status[Wait]:
    """Changes the passphrase and signs every other device out."""
    if refusal := _check(request, response, body.current, wrong=403):
        return refusal
    if weak := _weak(body.new):
        return weak
    user = owner()
    assert user is not None  # noqa: S101
    user.set_password(body.new)
    user.save()
    # Keeps this session signed in; every other session no longer matches the new passphrase.
    # It also gives this session a new key, so this browser's device entry must follow it, or it
    # would be taken for another device below and dropped.
    before = request.session.session_key
    update_session_auth_hash(request, user)
    Device.objects.filter(session_key=before).update(session_key=request.session.session_key)
    for device in Device.objects.exclude(session_key=request.session.session_key):
        devices.revoke(device)
    return Status(204, None)


@router.post("/active", auth=Open(), response={204: None}, summary="The owner is using the app")
def active(request: HttpRequest) -> Status[None]:
    """Keeps the idle lock away while the owner works without making other calls. Passing the
    `Open` check is what records the activity; the app calls this at most once a minute."""
    return Status(204, None)


@router.get("/devices", auth=Open(), response=list[DeviceOut])
def list_devices(request: HttpRequest) -> list[DeviceOut]:
    return [
        DeviceOut(
            id=d.pk,
            name=devices.device_name(d.user_agent),
            last_seen=d.last_seen_at,
            current=d.session_key == request.session.session_key,
        )
        for d in devices.current()
    ]


@router.delete("/devices/{device_id}", auth=Open(), response={204: None})
def revoke_device(request: HttpRequest, device_id: int) -> Status[None]:
    """Signs a device out. Revoking the current one signs this browser out."""
    device = get_object_or_404(Device, pk=device_id)
    if device.session_key == request.session.session_key:
        devices.revoke(device)
        logout(request)
    else:
        devices.revoke(device)
    return Status(204, None)


@router.get("/lock-settings", auth=Open(), response=LockSettings)
def get_lock_settings(request: HttpRequest) -> LockSettings:
    return LockSettings(minutes=Preferences.load().lock_after_minutes)  # type: ignore[arg-type]


@router.put("/lock-settings", auth=Open(), response=LockSettings)
def put_lock_settings(request: HttpRequest, body: LockSettings) -> LockSettings:
    preferences = Preferences.load()
    preferences.lock_after_minutes = body.minutes
    preferences.save()
    return body


@router.get("/security", auth=Open(), response=SecurityOut)
def security(request: HttpRequest) -> SecurityOut:
    return SecurityOut.model_validate(
        {
            "master_key": vault.kept_in(),
            "sealed": ProviderKey.objects.count(),
            "sign_ins": Connection.objects.exclude(sealed="").count(),
        }
    )


@router.get("/export", auth=Open(), include_in_schema=False)
def export(request: HttpRequest) -> FileResponse:
    """Everything Munim holds, as a zip of JSON and text files. No secrets are in it."""
    name = f"munim-export-{timezone.localdate().isoformat()}.zip"
    return FileResponse(
        data.export(), as_attachment=True, filename=name, content_type="application/zip"
    )


@router.post("/delete-all", auth=Open(), response={204: None, 403: Error, 429: Wait})
def delete_all(
    request: HttpRequest, response: HttpResponse, body: ConfirmIn
) -> Status[None] | Status[Error] | Status[Wait]:
    """Removes everything the owner put into Munim, after the passphrase, or where sign-in is
    by email after a code mailed for this. The account stays."""
    refusal = (
        _check_code(request, response, Code.Purpose.CONFIRM, body.code, wrong=403)
        if settings.CODE_SIGN_IN
        else _check(request, response, body.passphrase, wrong=403)
    )
    if refusal:
        return refusal
    data.delete_all()
    return Status(204, None)
