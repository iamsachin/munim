#!/bin/sh
# Runs the server for the web app's real-server browser tests: its own database, emptied on
# every start, on port 8001. Used by apps/web/playwright.config.ts. Needs `pnpm db`.
set -e
cd "$(dirname "$0")"
# The feed in real-server.spec.ts is served from this machine, which counts as a private network.
export MUNIM_DEBUG=1 MUNIM_DB_NAME=munim_e2e MUNIM_ALLOW_PRIVATE_FEEDS=1
# Its files (fetched images) go in a folder of their own, not beside the owner's.
MUNIM_DATA_DIR="$(mktemp -d)"
export MUNIM_DATA_DIR

uv run python - <<'PY'
import os

import psycopg

# Connect to the development database to create the test one beside it, if it is not there.
dsn = (
    f"host={os.environ.get('MUNIM_DB_HOST', '127.0.0.1')} "
    f"port={os.environ.get('MUNIM_DB_PORT', '5433')} "
    f"user={os.environ.get('MUNIM_DB_USER', 'munim')} "
    f"password={os.environ.get('MUNIM_DB_PASSWORD', 'munim')} dbname=munim"
)
with psycopg.connect(dsn, autocommit=True) as connection:
    exists = connection.execute("select 1 from pg_database where datname = 'munim_e2e'").fetchone()
    if not exists:
        connection.execute("create database munim_e2e")
PY

uv run python manage.py migrate --no-input >/dev/null
uv run python manage.py flush --no-input >/dev/null
exec uv run python manage.py runserver 8001 --noreload
