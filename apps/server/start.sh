#!/bin/bash
# The install's one container: brings the database up to date, then runs the web server and
# the job worker together. If either stops, so does the container, and Docker starts it again.
set -euo pipefail
cd "$(dirname "$0")"

# Signs sessions. Unless the install supplies one, it is made once and kept with the data, like
# the master key, so it is never a value anyone could guess.
if [ -z "${MUNIM_SECRET_KEY:-}" ]; then
  key="${MUNIM_DATA_DIR:?}/secret.key"
  if [ ! -s "$key" ]; then
    (umask 077 && python -c 'import secrets; print(secrets.token_urlsafe(64))' >"$key.new")
    mv "$key.new" "$key"
  fi
  MUNIM_SECRET_KEY="$(cat "$key")"
  export MUNIM_SECRET_KEY
fi

python manage.py migrate --no-input

stopping=0
trap 'stopping=1; kill -TERM "$worker" "$server" 2>/dev/null' TERM INT

python manage.py procrastinate worker &
worker=$!
# Threads, not more processes: requests mostly wait on the database or on a source.
gunicorn munim.wsgi --bind 0.0.0.0:8000 --workers 2 --threads 4 --access-logfile - \
  --no-control-socket &
server=$!

wait -n "$worker" "$server" || true
kill -TERM "$worker" "$server" 2>/dev/null || true
wait || true
# Asked to stop is a clean exit; anything else is a failure Docker should restart.
[ "$stopping" = 1 ]
