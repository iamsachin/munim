"""Secrets at rest. Source tokens and AI keys are sealed with the install's master key before
they are stored, so a copy of the database alone does not give them away.

The master key is MUNIM_MASTER_KEY, or a file in the data folder made the first time it is
needed. It is not derived from the passphrase: the worker uses these secrets with nobody signed
in. Anyone who has both the database and the key can read them; what the owner reads (articles,
highlights) is not sealed at all, so that search and Ask work.
"""

import os
import uuid
from pathlib import Path

from cryptography.fernet import Fernet, InvalidToken
from django.conf import settings

KEY_FILE = "master.key"


class Unreadable(Exception):
    """A stored secret was sealed with a different master key, or has been altered."""


def _key() -> bytes:
    if settings.MASTER_KEY:
        return str(settings.MASTER_KEY).encode()
    path = Path(settings.DATA_DIR) / KEY_FILE
    if not path.exists():
        path.parent.mkdir(parents=True, exist_ok=True)
        # Written whole under another name, then linked into place, which fails if the file
        # is already there: two processes starting together end up with the same one key.
        draft = path.with_name(f"{KEY_FILE}.{uuid.uuid4().hex}")
        with os.fdopen(os.open(draft, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600), "wb") as f:
            f.write(Fernet.generate_key())
        try:
            os.link(draft, path)
        except FileExistsError:
            pass
        finally:
            draft.unlink()
    return path.read_bytes().strip()


def kept_in() -> str:
    """Where the master key comes from: the install's own setting, or the file made here."""
    return "environment" if settings.MASTER_KEY else "file"


def seal(secret: str) -> str:
    return Fernet(_key()).encrypt(secret.encode()).decode()


def unseal(sealed: str) -> str:
    try:
        return Fernet(_key()).decrypt(sealed.encode()).decode()
    except InvalidToken:
        raise Unreadable("This was sealed with a different master key.") from None
