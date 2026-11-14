"""Django settings. Everything an install can change comes from MUNIM_* environment variables."""

import os
from pathlib import Path

from django.core.exceptions import ImproperlyConfigured

BASE_DIR = Path(__file__).resolve().parent.parent


def env(name: str, default: str | None = None) -> str:
    """The value of MUNIM_<name>, or the default. With no default, a missing value is an error."""
    value = os.environ.get(f"MUNIM_{name}", default)
    if value is None:
        raise ImproperlyConfigured(f"Set the MUNIM_{name} environment variable.")
    return value


# Development mode. Never set on a real install: it shows error details to anyone.
DEBUG = env("DEBUG", "0") == "1"

# Signs sessions. Development has a fixed key so nothing needs setting up; a real install must
# supply its own, and starts with an error rather than with a guessable one.
SECRET_KEY = env("SECRET_KEY", "dev-only-not-secret" if DEBUG else None)  # noqa: S105

ALLOWED_HOSTS = [h.strip() for h in env("ALLOWED_HOSTS", "localhost,127.0.0.1").split(",")]

# Origins, other than the server's own, whose pages may call the API: the address people type
# when Munim sits behind a reverse proxy, e.g. "https://munim.example.com". In development the
# web app is served by Vite on its own port and proxies the API here.
_DEV_ORIGINS = "http://localhost:5173,http://localhost:4173"
CSRF_TRUSTED_ORIGINS = [
    origin.strip()
    for origin in env("TRUSTED_ORIGINS", _DEV_ORIGINS if DEBUG else "").split(",")
    if origin.strip()
]

INSTALLED_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    "ninja",  # for its export_openapi_schema command
    "procrastinate.contrib.django",  # the job queue, in Postgres
    "account",
    "reader",
]

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "account.auth.AdminLock",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

ROOT_URLCONF = "munim.urls"
ASGI_APPLICATION = "munim.asgi.application"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]

# The defaults match the development database in compose.yaml.
DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.postgresql",
        "HOST": env("DB_HOST", "127.0.0.1"),
        "PORT": env("DB_PORT", "5433"),
        "NAME": env("DB_NAME", "munim"),
        "USER": env("DB_USER", "munim"),
        "PASSWORD": env("DB_PASSWORD", "munim" if DEBUG else None),
    }
}

AUTH_PASSWORD_VALIDATORS = [
    {
        "NAME": "django.contrib.auth.password_validation.MinimumLengthValidator",
        "OPTIONS": {"min_length": 12},
    },
]

# Finished jobs are deleted, so the queue's tables hold only what is waiting or has failed.
PROCRASTINATE_WORKER_DEFAULTS = {"delete_jobs": "successful"}

# Feeds on private networks (a service on the same LAN, say) are refused unless this is set,
# because a feed address can also be used to make the server reach things only it can reach.
ALLOW_PRIVATE_FEEDS = env("ALLOW_PRIVATE_FEEDS", "0") == "1"

# Sessions last 30 days. Cookies are sent over HTTPS only, unless an install on a private network
# without HTTPS opts out, accepting that anyone on that network can then read the session cookie.
SESSION_COOKIE_AGE = 60 * 60 * 24 * 30
SESSION_COOKIE_SECURE = CSRF_COOKIE_SECURE = not DEBUG and env("INSECURE_COOKIES", "0") != "1"

LANGUAGE_CODE = "en"
TIME_ZONE = "UTC"
USE_I18N = False
USE_TZ = True

STATIC_URL = "static/"
DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"
