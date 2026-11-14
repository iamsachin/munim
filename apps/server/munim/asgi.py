"""ASGI entry point: `munim.asgi:application`."""

import os

from django.core.asgi import get_asgi_application

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "munim.settings")

application = get_asgi_application()
