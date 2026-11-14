import time
from datetime import timedelta

import pytest
from django.contrib.auth.models import User
from django.test import Client
from django.utils import timezone

from account.models import Device, Throttle

from .conftest import PASSPHRASE, post


def state(client: Client) -> str:
    return str(client.get("/api/session").json()["state"])


def sign_in(
    passphrase: str = PASSPHRASE, *, address: str = "127.0.0.1", user_agent: str = ""
) -> tuple[Client, int]:
    """Signs in from a fresh browser. Returns it and the response status."""
    client = Client()
    response = post(
        client,
        "sign-in",
        {"passphrase": passphrase},
        REMOTE_ADDR=address,
        HTTP_USER_AGENT=user_agent,
    )
    return client, response.status_code


# --- first run


@pytest.mark.django_db
def test_a_fresh_install_asks_for_setup_then_setup_signs_in(client: Client) -> None:
    assert state(client) == "setup"
    response = post(client, "setup", {"passphrase": PASSPHRASE})
    assert response.status_code == 200
    assert response.json() == {"state": "open"}
    assert state(client) == "open"
    assert state(Client()) == "signed_out"


@pytest.mark.django_db
def test_setup_refuses_a_short_passphrase(client: Client) -> None:
    response = post(client, "setup", {"passphrase": "elevenchars"})
    assert response.status_code == 422
    assert response.json() == {"detail": "Use at least 12 characters."}
    assert not User.objects.exists()


def test_setup_works_only_once(owner_client: Client) -> None:
    response = post(Client(), "setup", {"passphrase": "another long passphrase"})
    assert response.status_code == 409
    assert User.objects.count() == 1
    assert sign_in("another long passphrase")[1] == 401


@pytest.mark.django_db
def test_calls_that_change_things_need_the_csrf_token() -> None:
    strict = Client(enforce_csrf_checks=True)
    assert post(strict, "setup", {"passphrase": PASSPHRASE}).status_code == 403
    token = strict.get("/api/session").cookies["csrftoken"].value
    response = post(strict, "setup", {"passphrase": PASSPHRASE}, HTTP_X_CSRFTOKEN=token)
    assert response.status_code == 200
    # Signing in rotates the token; the old one no longer works for a signed-in call.
    assert post(strict, "lock", HTTP_X_CSRFTOKEN=token).status_code == 403


# --- signing in and out


def test_sign_in_needs_the_right_passphrase(owner_client: Client) -> None:
    other, status = sign_in("not the passphrase")
    assert status == 401
    assert state(other) == "signed_out"
    other, status = sign_in()
    assert status == 200
    assert state(other) == "open"


def test_sign_out_ends_the_session_and_forgets_the_device(owner_client: Client) -> None:
    assert Device.objects.count() == 1
    assert post(owner_client, "sign-out").status_code == 204
    assert state(owner_client) == "signed_out"
    assert Device.objects.count() == 0
    assert owner_client.get("/api/devices").status_code == 401


@pytest.mark.django_db
def test_nothing_private_is_served_without_signing_in(client: Client) -> None:
    for path in ("devices", "lock-settings"):
        assert client.get(f"/api/{path}").status_code == 401
    for path in ("sign-out", "lock", "unlock", "passphrase"):
        assert (
            post(client, path, {"passphrase": "x", "current": "x", "new": "x"}).status_code == 401
        )


# --- rate limiting


def test_three_wrong_passphrases_make_even_the_right_one_wait(owner_client: Client) -> None:
    for _ in range(3):
        assert sign_in("wrong")[1] == 401

    blocked = post(Client(), "sign-in", {"passphrase": PASSPHRASE})
    assert blocked.status_code == 429
    assert blocked.json()["wait_seconds"] == int(blocked["Retry-After"])
    assert 0 < blocked.json()["wait_seconds"] <= 30

    # Once the wait is over the right passphrase works, and the count starts again.
    Throttle.objects.update(blocked_until=timezone.now() - timedelta(seconds=1))
    assert sign_in()[1] == 200
    assert not Throttle.objects.filter(key="127.0.0.1").exists()


def test_a_brute_force_from_one_address_gets_three_guesses(
    owner_client: Client, monkeypatch: pytest.MonkeyPatch
) -> None:
    looked_at = []
    real = User.check_password

    def counting(self: User, raw: str) -> bool:
        looked_at.append(raw)
        return real(self, raw)

    monkeypatch.setattr(User, "check_password", counting)
    statuses = [sign_in(f"guess number {n}")[1] for n in range(200)]

    assert len(looked_at) == 3
    assert statuses[:3] == [401, 401, 401]
    assert set(statuses[3:]) == {429}


def test_spreading_guesses_over_many_addresses_is_capped_for_everyone(
    owner_client: Client, monkeypatch: pytest.MonkeyPatch
) -> None:
    looked_at = []

    def always_wrong(self: User, raw: str) -> bool:
        looked_at.append(raw)
        return False

    monkeypatch.setattr(User, "check_password", always_wrong)
    for n in range(100):
        sign_in("a guess", address=f"10.0.0.{n}")

    assert len(looked_at) == 20
    # An address that has never guessed is made to wait too.
    assert sign_in(address="192.168.1.9")[1] == 429


@pytest.mark.django_db
def test_waits_double_from_thirty_seconds_up_to_fifteen_minutes() -> None:
    from account.throttle import attempt

    waits = []
    for _ in range(12):
        # Let each wait pass, and keep the everyone-cap out of the way, to see the next one.
        Throttle.objects.filter(key="a").update(blocked_until=None)
        Throttle.objects.filter(key="everyone").update(failures=0, blocked_until=None)
        assert attempt("a", lambda: False) is False
        until = Throttle.objects.get(key="a").blocked_until
        waits.append(round((until - timezone.now()).total_seconds()) if until else 0)

    assert waits == [0, 0, 30, 60, 120, 240, 480, 900, 900, 900, 900, 900]


@pytest.mark.django_db
def test_counts_for_addresses_not_seen_for_a_day_are_dropped() -> None:
    from account.throttle import attempt

    attempt("old", lambda: False)
    Throttle.objects.filter(key="old").update(last_failure=timezone.now() - timedelta(days=2))
    attempt("new", lambda: False)
    assert set(Throttle.objects.values_list("key", flat=True)) == {"everyone", "new"}


def test_unlock_and_change_passphrase_share_the_limit(owner_client: Client) -> None:
    for _ in range(3):
        assert post(owner_client, "unlock", {"passphrase": "wrong"}).status_code == 401
    assert post(owner_client, "unlock", {"passphrase": PASSPHRASE}).status_code == 429
    change = post(owner_client, "passphrase", {"current": PASSPHRASE, "new": "a brand new phrase"})
    assert change.status_code == 429
    assert sign_in()[1] == 429


# --- locking


def test_a_locked_session_is_refused_until_unlocked(owner_client: Client) -> None:
    assert post(owner_client, "lock").status_code == 204
    assert state(owner_client) == "locked"
    assert owner_client.get("/api/devices").status_code == 423

    assert post(owner_client, "unlock", {"passphrase": "wrong"}).status_code == 401
    assert state(owner_client) == "locked"
    assert post(owner_client, "unlock", {"passphrase": PASSPHRASE}).json() == {"state": "open"}
    assert owner_client.get("/api/devices").status_code == 200


def test_an_idle_session_locks_itself_after_the_chosen_time(owner_client: Client) -> None:
    def idle_for(minutes: float) -> None:
        session = owner_client.session
        session["seen"] = time.time() - minutes * 60
        session["locked"] = False
        session.save()

    idle_for(14)
    assert state(owner_client) == "open"
    idle_for(16)
    assert owner_client.get("/api/devices").status_code == 423
    assert state(owner_client) == "locked"

    assert post(owner_client, "unlock", {"passphrase": PASSPHRASE}).status_code == 200
    body = {"minutes": None}
    assert owner_client.put("/api/lock-settings", body, "application/json").json() == body
    idle_for(600)
    assert state(owner_client) == "open"


def test_lock_settings_accept_only_the_offered_times(owner_client: Client) -> None:
    assert owner_client.get("/api/lock-settings").json() == {"minutes": 15}
    for minutes in (5, 60):
        body = {"minutes": minutes}
        assert owner_client.put("/api/lock-settings", body, "application/json").json() == body
    assert (
        owner_client.put("/api/lock-settings", {"minutes": 7}, "application/json").status_code
        == 422
    )


# --- devices


FIREFOX_LINUX = "Mozilla/5.0 (X11; Linux x86_64; rv:140.0) Gecko/20100101 Firefox/140.0"


def test_devices_lists_signed_in_browsers_and_marks_this_one(owner_client: Client) -> None:
    sign_in(user_agent=FIREFOX_LINUX)
    listed = owner_client.get("/api/devices").json()
    assert {(d["name"], d["current"]) for d in listed} == {
        ("Unknown browser", True),
        ("Firefox on Linux", False),
    }
    assert "session_key" not in str(listed)


def test_revoking_a_device_signs_it_out(owner_client: Client) -> None:
    other, _ = sign_in(user_agent=FIREFOX_LINUX)
    target = next(d for d in owner_client.get("/api/devices").json() if not d["current"])

    assert owner_client.delete(f"/api/devices/{target['id']}").status_code == 204
    assert state(other) == "signed_out"
    assert len(owner_client.get("/api/devices").json()) == 1
    assert owner_client.delete(f"/api/devices/{target['id']}").status_code == 404


def test_revoking_this_device_signs_this_browser_out(owner_client: Client) -> None:
    mine = owner_client.get("/api/devices").json()[0]
    assert owner_client.delete(f"/api/devices/{mine['id']}").status_code == 204
    assert state(owner_client) == "signed_out"


# --- changing the passphrase


def test_changing_the_passphrase_signs_other_devices_out(owner_client: Client) -> None:
    other, _ = sign_in()
    new = "a brand new phrase"

    wrong = post(owner_client, "passphrase", {"current": "not it", "new": new})
    assert wrong.status_code == 401
    weak = post(owner_client, "passphrase", {"current": PASSPHRASE, "new": "short"})
    assert weak.status_code == 422
    assert post(owner_client, "passphrase", {"current": PASSPHRASE, "new": new}).status_code == 204

    assert state(owner_client) == "open"
    assert state(other) == "signed_out"
    # This browser keeps its place in the device list, although its session key has changed.
    assert [d["current"] for d in owner_client.get("/api/devices").json()] == [True]
    assert sign_in(PASSPHRASE)[1] == 401
    assert sign_in(new)[1] == 200


def test_an_oversized_passphrase_is_rejected_before_it_is_hashed(owner_client: Client) -> None:
    assert sign_in("x" * 5000)[1] == 422
    assert not Throttle.objects.exists()


# --- the admin


def test_the_admin_has_no_sign_in_form_of_its_own(owner_client: Client) -> None:
    stranger = Client()
    response = stranger.post("/admin/login/", {"username": "owner", "password": PASSPHRASE})
    assert response.status_code == 302
    assert response["Location"].startswith("/sign-in")
    assert stranger.get("/admin/").status_code == 302


def test_the_admin_follows_the_session(owner_client: Client) -> None:
    assert owner_client.get("/admin/").status_code == 200
    post(owner_client, "lock")
    locked = owner_client.get("/admin/")
    assert (locked.status_code, locked["Location"]) == (302, "/")
