# The Munim image: the web app is built with Node, then everything is served by Python. Only the
# second stage ships.

FROM node:26-slim AS web
WORKDIR /src
RUN npm install --global pnpm@11.22.0
# The manifests first, so the installed packages are reused until one of these changes.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/web/package.json apps/web/
COPY apps/server/package.json apps/server/
RUN pnpm install --frozen-lockfile --filter web...
COPY apps/web apps/web
RUN pnpm --filter web build


FROM python:3.14-slim
COPY --from=ghcr.io/astral-sh/uv:0.13.8 /uv /bin/uv
ENV PYTHONUNBUFFERED=1 UV_COMPILE_BYTECODE=1 UV_LINK_MODE=copy
WORKDIR /app
COPY apps/server/pyproject.toml apps/server/uv.lock ./
RUN uv sync --frozen --no-dev
ENV PATH="/app/.venv/bin:$PATH"

COPY apps/server ./
COPY --from=web /src/apps/web/dist /app/web
ENV MUNIM_DATA_DIR=/data
# Gathers the admin's files. The two values only let the settings load; nothing here uses them.
RUN MUNIM_SECRET_KEY=build MUNIM_DB_PASSWORD=build python manage.py collectstatic --no-input

# Runs as its own user, which owns nothing but the data folder.
RUN useradd --system --uid 10001 munim && mkdir /data && chown munim /data
USER munim
VOLUME /data
EXPOSE 8000
CMD ["./start.sh"]
