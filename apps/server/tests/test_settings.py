import pytest
from django.core.exceptions import ImproperlyConfigured

from munim.settings import env


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
