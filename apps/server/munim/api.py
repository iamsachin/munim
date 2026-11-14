"""The REST API. Its OpenAPI document, served at /api/openapi.json, is what the web app's types
are generated from."""

from typing import Literal

from django.db import OperationalError, connection
from django.http import HttpRequest
from ninja import NinjaAPI, Schema, Status

from account.api import router as account_router
from reader.api import router as reader_router

api = NinjaAPI(title="Munim", version="0.1.0")
api.add_router("", account_router)
api.add_router("", reader_router)


class Health(Schema):
    status: Literal["ok", "unavailable"]


@api.get("/health", response={200: Health, 503: Health}, summary="Is the server able to work?")
def health(request: HttpRequest) -> Status[Health]:
    """Reports ok only if the database answers, so an install's health check means something."""
    try:
        connection.ensure_connection()
    except OperationalError:
        return Status(503, Health(status="unavailable"))
    return Status(200, Health(status="ok"))
