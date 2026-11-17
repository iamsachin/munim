import pytest
from django.core.exceptions import ImproperlyConfigured

from munim.settings import env, why_not_local


def test_env_reads_the_prefixed_variable(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("MUNIM_EXAMPLE", "value")
    assert env("EXAMPLE", "fallback") == "value"


def test_env_falls_back_to_the_default(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("MUNIM_EXAMPLE", raising=False)
    assert env("EXAMPLE", "fallback") == "fallback"


def test_env_refuses_to_guess_a_required_value(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("MUNIM_EXAMPLE", raising=False)
    with pytest.raises(ImproperlyConfigured, match="MUNIM_EXAMPLE"):
        env("EXAMPLE")


@pytest.mark.parametrize(
    ("hosts", "origins", "proxies", "bind", "why"),
    [
        (["localhost", "127.0.0.1"], [], 0, "127.0.0.1", ""),
        (["localhost"], ["http://localhost:5173"], 0, "localhost", ""),
        (["munim.example.com"], [], 0, "127.0.0.1", "MUNIM_ALLOWED_HOSTS"),
        (["localhost", "*"], [], 0, "127.0.0.1", "MUNIM_ALLOWED_HOSTS"),
        (["localhost"], ["https://munim.example.com"], 0, "127.0.0.1", "MUNIM_TRUSTED_ORIGINS"),
        (["localhost"], [], 1, "127.0.0.1", "MUNIM_TRUSTED_PROXIES"),
        (["localhost"], [], 0, "0.0.0.0", "MUNIM_BIND"),  # noqa: S104
    ],
)
def test_sign_in_may_be_switched_off_only_where_munim_answers_on_its_own_machine(
    hosts: list[str], origins: list[str], proxies: int, bind: str, why: str
) -> None:
    assert why_not_local(hosts, origins, proxies, bind).startswith(why or "\0") or not why
    assert bool(why_not_local(hosts, origins, proxies, bind)) == bool(why)
