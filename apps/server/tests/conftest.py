import socket
from collections.abc import Callable
from typing import Any

import httpx
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


Handler = Callable[[httpx.Request], httpx.Response]


@pytest.fixture
def web(monkeypatch: pytest.MonkeyPatch) -> Callable[[Handler], None]:
    """Replaces the network: names resolve as below, and requests go to the given handler."""
    addresses = {"localhost": "127.0.0.1", "intranet.example": "10.0.0.5"}

    def resolve(host: str, port: int, **_: Any) -> list[Any]:
        address = addresses.get(host, "93.184.216.34")
        return [(socket.AF_INET, socket.SOCK_STREAM, 6, "", (address, port))]

    monkeypatch.setattr("reader.feeds.socket.getaddrinfo", resolve)
    real = httpx.Client

    def serve(handler: Handler) -> None:
        def client(**options: Any) -> httpx.Client:
            return real(transport=httpx.MockTransport(handler), **options)

        monkeypatch.setattr("reader.feeds.httpx.Client", client)

    return serve
