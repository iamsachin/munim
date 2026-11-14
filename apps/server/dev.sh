#!/bin/sh
# Development: the web server and the job worker together, with the database brought up to date.
# Stopping this stops both. Needs `pnpm db`.
set -e
cd "$(dirname "$0")"
export MUNIM_DEBUG=1

uv run python manage.py migrate --no-input >/dev/null
uv run python manage.py procrastinate worker &
WORKER=$!
trap 'kill "$WORKER" 2>/dev/null' EXIT INT TERM
uv run python manage.py runserver 8000
