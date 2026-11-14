from unittest.mock import patch

import pytest
from django.db import OperationalError
from django.test import Client


@pytest.mark.django_db
def test_health_is_ok_when_the_database_answers(client: Client) -> None:
    response = client.get("/api/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_health_is_503_when_the_database_does_not_answer(client: Client) -> None:
    with patch("munim.api.connection.ensure_connection", side_effect=OperationalError):
        response = client.get("/api/health")
    assert response.status_code == 503
    assert response.json() == {"status": "unavailable"}


def test_the_openapi_document_describes_the_api(client: Client) -> None:
    document = client.get("/api/openapi.json").json()
    assert document["info"]["title"] == "Munim"
    assert "/api/health" in document["paths"]


@pytest.mark.django_db
def test_the_admin_asks_for_a_sign_in(client: Client) -> None:
    response = client.get("/admin/", follow=True)
    assert response.status_code == 200
    assert response.redirect_chain[-1][0].startswith("/admin/login/")
