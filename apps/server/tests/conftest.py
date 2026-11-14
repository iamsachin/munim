from typing import Any

import pytest
from django.test import Client

PASSPHRASE = "four unrelated words"  # noqa: S105  a test value


def post(client: Client, path: str, body: dict[str, Any] | None = None, **extra: Any) -> Any:
    return client.post(f"/api/{path}", body or {}, content_type="application/json", **extra)


@pytest.fixture
def owner_client(client: Client, db: None) -> Client:
    """A browser that has been through first-run setup, so it is signed in and open."""
    assert post(client, "setup", {"passphrase": PASSPHRASE}).status_code == 200
    return client
