from pathlib import Path
from typing import Any

import pytest
from django.test import Client


@pytest.fixture
def built(settings: Any, tmp_path: Path) -> Path:
    """A stand-in for the built web app."""
    (tmp_path / "index.html").write_text("<!doctype html><title>Munim</title>")
    settings.WEB_DIR = tmp_path
    return tmp_path


@pytest.mark.parametrize("address", ["/", "/stream", "/rss", "/settings", "/sign-in", "/a/b/c"])
def test_every_screen_address_gets_the_web_app(client: Client, built: Path, address: str) -> None:
    response = client.get(address)
    assert response.status_code == 200
    assert response["Content-Type"] == "text/html; charset=utf-8"
    assert b"<title>Munim</title>" in response.content
    # The page is asked for afresh each time, so a new version is picked up at once.
    assert response["Cache-Control"] == "no-cache"


@pytest.mark.parametrize(
    "address", ["/api/nothing-here", "/assets/missing.js", "/static/missing.css", "/admin/nope/"]
)
def test_what_is_not_a_screen_is_not_given_the_web_app(
    client: Client, built: Path, db: None, address: str
) -> None:
    response = client.get(address)
    assert response.status_code in (302, 404)
    assert b"<title>Munim</title>" not in response.content


def test_the_api_still_answers_beside_the_web_app(client: Client, built: Path, db: None) -> None:
    assert client.get("/api/health").json() == {"status": "ok"}


def test_without_a_built_web_app_the_server_says_so(client: Client, settings: Any) -> None:
    settings.WEB_DIR = Path("/nowhere")
    response = client.get("/stream")
    assert response.status_code == 404
    assert response.content == b"The web app is not built here."
