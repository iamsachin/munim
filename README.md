# Munim

A self-hosted personal hub. The first part is a reader: one stream for RSS, Hacker News and your
YouTube subscriptions, with saving, read-later, highlights and search. The AI features (digests,
Ask, watches) are being built; Calendar, Mail and Budget come later. One owner per install.

Only official APIs are used: no scraping. Reddit would be read-only and waits for Reddit's
approval of API access; X and Instagram have no official way in for a personal reader today.

Munim is early. Expect changes between versions.

## Install

You need Docker.

```sh
git clone https://github.com/iamsachin/munim.git
cd munim
docker compose up -d
```

Open http://localhost:8000 and set a passphrase. That is the whole install: one container runs
the web app, the API and the background jobs, next to a Postgres container.

## Reaching it from another machine

Out of the box Munim answers only on the machine it runs on. To change that, put the values you
need in a file named `.env` beside `compose.yaml`, then run `docker compose up -d` again.

| Value                                  | What it does                                                                                                                                                       |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `MUNIM_BIND`                           | The address the port is published on. `0.0.0.0` for every network interface. Default `127.0.0.1`.                                                                  |
| `MUNIM_PORT`                           | The port. Default `8000`.                                                                                                                                          |
| `MUNIM_ALLOWED_HOSTS`                  | The names people type to reach it, comma separated, for example `munim.example.com`.                                                                               |
| `MUNIM_TRUSTED_ORIGINS`                | Its full public address when it is behind a reverse proxy, for example `https://munim.example.com`.                                                                |
| `MUNIM_TRUSTED_PROXIES`                | How many reverse proxies are in front of Munim: `1` for one. It lets the limit on passphrase guesses count each visitor separately. Leave it at `0` with no proxy. |
| `MUNIM_INSECURE_COOKIES`               | `1` lets you sign in over plain http from another machine. Anyone on that network can then read your session. Put it behind https instead.                         |
| `MUNIM_DB_PASSWORD`                    | The database's password. Set it before the first start; the database is not reachable from outside either way.                                                     |
| `MUNIM_SECRET_KEY`, `MUNIM_MASTER_KEY` | Leave unset: both are made on first start and kept in the data volume.                                                                                             |

Behind a reverse proxy, set `MUNIM_TRUSTED_PROXIES` to the number of proxies in front. Without it,
every visitor looks to Munim like the proxy itself, so the wait after wrong passphrases is shared
by everyone rather than counted per visitor. The proxy must add to the `X-Forwarded-For` header,
as nginx, Caddy and Traefik do by default. Never set it without a proxy: the header would then be
whatever a visitor chose to send.

## Connecting YouTube

Munim reads your YouTube subscriptions by signing in to Google as you, with read-only access.
Google requires each install to do that through a Google Cloud project of its own:

1. In [Google Cloud](https://console.cloud.google.com/), create a project and switch on the
   **YouTube Data API v3**.
2. Set up the OAuth consent screen (external), and add your own Google account as a test user.
3. Create an **OAuth client ID** of the type **Web application**. As its authorized redirect URI,
   give the address Munim shows under Connections, YouTube, Set up. Google accepts only an https
   address, or `http://localhost`.
4. Paste the client ID and secret into Munim, then choose Connect and sign in.

While the Google project's publishing status is "Testing", Google ends the sign-in after 7 days
and you connect again. Publishing the project removes that limit. Munim checks for new videos
every hour and stays within Google's free daily allowance.

## Connecting X

X charges for every post an app reads, so Munim reads X only for watches. On the Watches screen
a keyword or a person can be switched on for X; it is then searched there once a day, and at
most 10 posts come back.

1. In [X's developer console](https://console.x.com/), create an app and buy credits.
2. Paste the app's Bearer Token into Munim under Connections, X, Set up.

Munim stores the token sealed and never shows it again. Posts from X are not sent to an AI
model.

## Upgrade

```sh
git pull
docker compose up -d --build
```

The database is brought up to date when the container starts.

## Back up

Everything lives in two Docker volumes. Back up both, together:

```sh
docker compose exec -T db pg_dump -U munim munim > munim.sql
docker compose cp app:/data ./munim-data
```

`munim-data` holds `master.key`, which seals the API keys you give Munim, and `secret.key`,
which signs sessions. Without `master.key` the stored keys cannot be read and must be entered
again; nothing else is lost.

## Development

`pnpm db` starts a development Postgres, `pnpm dev` the app at http://localhost:5173. The rules
of the project are in `.claude/CLAUDE.md`; what is built and what is next is in `PROGRESS.md`.

## Licence

AGPL-3.0. See `LICENSE`.
