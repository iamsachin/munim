import os
import stat
import subprocess
import sys
from pathlib import Path
from typing import Any

import pytest
from cryptography.fernet import Fernet

from munim import vault

SECRET = "a made-up secret, " + "x" * 8  # built from parts so no scanner takes it for real


def test_a_secret_is_sealed_and_can_be_read_back(settings: Any) -> None:
    sealed = vault.seal(SECRET)
    assert SECRET not in sealed
    assert vault.unseal(sealed) == SECRET
    # Sealing the same secret twice does not give the same text, so equal secrets do not show.
    assert vault.seal(SECRET) != sealed


def test_the_master_key_is_made_once_and_readable_only_by_its_owner(settings: Any) -> None:
    path = Path(settings.DATA_DIR) / "master.key"
    assert not path.exists()
    sealed = vault.seal(SECRET)
    made = path.read_bytes()
    assert stat.S_IMODE(os.stat(path).st_mode) == 0o600

    # The next use reads the same key and leaves no draft behind.
    assert vault.unseal(sealed) == SECRET
    vault.seal("another")
    assert path.read_bytes() == made
    assert [p.name for p in Path(settings.DATA_DIR).iterdir()] == ["master.key"]


def test_a_key_given_by_the_install_is_used_and_none_is_written(settings: Any) -> None:
    settings.MASTER_KEY = Fernet.generate_key().decode()
    sealed = vault.seal(SECRET)
    assert vault.unseal(sealed) == SECRET
    assert list(Path(settings.DATA_DIR).iterdir()) == []


def test_what_was_sealed_with_another_key_cannot_be_read(settings: Any) -> None:
    sealed = vault.seal(SECRET)
    settings.MASTER_KEY = Fernet.generate_key().decode()
    with pytest.raises(vault.Unreadable):
        vault.unseal(sealed)
    with pytest.raises(vault.Unreadable):
        vault.unseal("not sealed at all")


def test_the_server_does_not_start_with_a_master_key_it_cannot_use() -> None:
    started = subprocess.run(  # noqa: S603  our own interpreter and settings
        [sys.executable, "-c", "import munim.settings"],
        env={**os.environ, "MUNIM_DEBUG": "1", "MUNIM_MASTER_KEY": "not-a-key"},
        capture_output=True,
        text=True,
        check=False,
    )
    assert started.returncode != 0
    assert "MUNIM_MASTER_KEY is not a valid key" in started.stderr
