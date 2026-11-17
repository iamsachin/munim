import re
from datetime import timedelta
from smtplib import SMTPException
from typing import Any

import pytest
from django.contrib.auth.models import User
from django.core import mail
from django.test import Client
from django.utils import timezone

from account import codes
from account.models import Code
from munim.settings import MAIL_SETTINGS, mail_problem

from .conftest import PASSPHRASE, post

OWNER = "owner@example.com"


@pytest.fixture
def by_email(settings: Any, db: None) -> None:
    """An install whose mail is set up: its owner signs in with a mailed code."""
    settings.CODE_SIGN_IN = True
    settings.OWNER_EMAIL = OWNER
    settings.DEFAULT_FROM_EMAIL = "munim@example.com"


def mailed() -> str:
    """The code in the last mail, which goes to the owner and to nobody else."""
    message = mail.outbox[-1]
    assert (message.to, message.from_email) == ([OWNER], "munim@example.com")
    found = re.match(r"(\d{6})\n", str(message.body))
    assert found is not None
    return found.group(1)


def a_minute_later() -> None:
    Code.objects.update(made_at=timezone.now() - timedelta(seconds=61))


def signed_in(client: Client) -> Client:
    assert post(client, "sign-in/code", {}).status_code == 204
    assert post(client, "sign-in/code/confirm", {"code": mailed()}).status_code == 200
    return client


def test_a_code_is_mailed_to_the_owner_and_signs_them_in_once(
    client: Client, by_email: None
) -> None:
    # Nothing to set up by email: the first code makes the owner, who has no passphrase.
    assert client.get("/api/session").json() == {"state": "signed_out", "sign_in": "email"}
    assert post(client, "sign-in/code", {}).status_code == 204
    code = mailed()
    # It is kept only as a hash.
    assert code not in Code.objects.get(purpose="sign_in").hashed
    assert "sign in to Munim" in mail.outbox[0].body

    wrong = post(client, "sign-in/code/confirm", {"code": "000000" if code != "000000" else "1"})
    assert wrong.status_code == 401
    right = post(client, "sign-in/code/confirm", {"code": f" {code} "})
    assert (right.status_code, right.json()) == (200, {"state": "open", "sign_in": "email"})
    owner = User.objects.get()
    assert (owner.email, owner.has_usable_password()) == (OWNER, False)
    assert client.get("/api/counts").status_code == 200
    assert len(client.get("/api/devices").json()) == 1

    # A code works once: it does not let a second browser in.
    assert post(Client(), "sign-in/code/confirm", {"code": code}).status_code == 401
    # And there is no lock by email: it stays open however long it is left.
    session = client.session
    session["seen"] = 0
    session.save()
    assert client.get("/api/counts").status_code == 200


def test_a_code_goes_stale_after_ten_minutes_and_is_burnt_by_wrong_guesses(by_email: None) -> None:
    codes.send("sign_in")
    Code.objects.update(made_at=timezone.now() - timedelta(minutes=11))
    assert codes.right("sign_in", mailed()) is False

    codes.send("sign_in")
    code = mailed()
    for _ in range(codes.MOST_WRONG):
        assert codes.right("sign_in", "nope") is False
    # Guessed wrong too often, even the right code is no longer good.
    assert codes.right("sign_in", code) is False
    # A code for one purpose is not a code for another.
    a_minute_later()
    codes.send("sign_in")
    assert codes.right("confirm", mailed()) is False


def test_codes_cannot_be_asked_for_too_often(client: Client, by_email: None) -> None:
    assert post(client, "sign-in/code", {}).status_code == 204
    soon = post(client, "sign-in/code", {})
    assert (soon.status_code, soon["Retry-After"]) == (429, str(soon.json()["wait_seconds"]))
    assert 0 < soon.json()["wait_seconds"] <= 61
    assert len(mail.outbox) == 1
    # A minute apart they are sent, but only so many in an hour, whoever is asking.
    for _ in range(codes.MOST_AN_HOUR - 1):
        a_minute_later()
        assert post(Client(), "sign-in/code", {}).status_code == 204
    a_minute_later()
    capped = post(client, "sign-in/code", {})
    assert capped.status_code == 429 and capped.json()["wait_seconds"] > 60
    assert len(mail.outbox) == codes.MOST_AN_HOUR
    # The hour over, they are sent again.
    Code.objects.update(hour_from=timezone.now() - timedelta(hours=1, seconds=1))
    assert post(client, "sign-in/code", {}).status_code == 204


def test_guessing_codes_is_stopped_by_the_same_limit_as_the_passphrase(
    client: Client, by_email: None
) -> None:
    assert post(client, "sign-in/code", {}).status_code == 204
    code = mailed()
    answers = [
        post(client, "sign-in/code/confirm", {"code": f"{n:06d}"}).status_code for n in range(6)
    ]
    # A few wrong guesses, then even the right code has to wait.
    assert answers[:3] == [401, 401, 401] and set(answers[3:]) == {429}
    waiting = post(client, "sign-in/code/confirm", {"code": code})
    assert waiting.status_code == 429 and waiting.json()["wait_seconds"] > 0


def test_if_the_mail_cannot_be_sent_there_is_no_code(
    client: Client, by_email: None, monkeypatch: pytest.MonkeyPatch
) -> None:
    def fail(*args: Any, **kwargs: Any) -> None:
        raise SMTPException("the relay said no, with details nobody should see")

    monkeypatch.setattr(codes, "send_mail", fail)
    refused = post(client, "sign-in/code", {})
    assert refused.status_code == 502
    assert "relay" not in refused.content.decode()
    assert Code.objects.get(purpose="sign_in").hashed == ""


def test_by_email_the_passphrase_opens_nothing_and_by_passphrase_no_code_is_sent(
    owner_client: Client, settings: Any
) -> None:
    # By passphrase: no code can be asked for or used.
    fresh = Client()
    assert post(fresh, "sign-in/code", {}).status_code == 409
    assert post(fresh, "sign-in/code/confirm", {"code": "123456"}).status_code == 409
    assert mail.outbox == []
    # By email: the same install's passphrase, though right, is not a way in.
    settings.CODE_SIGN_IN = True
    settings.OWNER_EMAIL = OWNER
    assert post(fresh, "sign-in", {"passphrase": PASSPHRASE}).status_code == 409
    assert post(fresh, "setup", {"passphrase": PASSPHRASE}).status_code == 409
    assert fresh.get("/api/counts").status_code == 401


def test_by_email_deleting_everything_needs_a_code_mailed_for_it(
    client: Client, by_email: None
) -> None:
    signed_in(client)
    # The code that signed in was used up; and one for signing in would not do.
    assert post(client, "delete-all", {"code": mailed()}).status_code == 403
    assert post(Client(), "confirm/code", {}).status_code == 401
    assert post(client, "confirm/code", {}).status_code == 204
    assert "deleted" in mail.outbox[-1].body
    assert post(client, "delete-all", {"passphrase": mailed()}).status_code == 403
    assert post(client, "delete-all", {"code": mailed()}).status_code == 204
    # The account stays, and so does the session.
    assert client.get("/api/counts").status_code == 200


def test_the_mail_settings_are_all_six_or_none() -> None:
    all_six = dict.fromkeys(MAIL_SETTINGS, "x") | {"SMTP_PORT": "465"}
    assert mail_problem(dict.fromkeys(MAIL_SETTINGS, ""), False) == ""
    assert mail_problem(all_six, False) == ""
    assert "MUNIM_OWNER_EMAIL is not set" in mail_problem(all_six | {"OWNER_EMAIL": ""}, False)
    assert "MUNIM_SMTP_PORT is a number" in mail_problem(all_six | {"SMTP_PORT": "tls"}, False)
    # A code goes to one place: the owner's address or the log, not both.
    assert "choose where codes go" in mail_problem(all_six, True)
    assert mail_problem(dict.fromkeys(MAIL_SETTINGS, ""), True) == ""


def test_with_no_mail_the_code_is_written_to_the_servers_log_and_signs_in(
    client: Client, db: None, settings: Any, caplog: pytest.LogCaptureFixture
) -> None:
    settings.CODE_SIGN_IN = settings.CODES_TO_LOG = True
    assert client.get("/api/session").json() == {"state": "signed_out", "sign_in": "log"}
    assert post(client, "sign-in/code", {}).status_code == 204
    # Nothing is mailed: the code is in the log, where whoever runs the install reads it.
    assert mail.outbox == []
    (line,) = [record.getMessage() for record in caplog.records if record.name == "munim.codes"]
    found = re.search(r"to sign in to Munim: (\d{6})\.", line)
    assert found is not None
    signed = post(client, "sign-in/code/confirm", {"code": found.group(1)})
    assert (signed.status_code, signed.json()["sign_in"]) == (200, "log")
    assert client.get("/api/counts").status_code == 200
