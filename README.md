# Munim

A self-hosted personal hub. The first part is a reader: one stream for RSS and Hacker News, with
saving, read-later and highlights. YouTube, Reddit and the AI features (digests, Ask, watches)
are being built; Calendar, Mail and Budget come later. One owner per install.

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

| Value                                  | What it does                                                                                                                               |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `MUNIM_BIND`                           | The address the port is published on. `0.0.0.0` for every network interface. Default `127.0.0.1`.                                          |
| `MUNIM_PORT`                           | The port. Default `8000`.                                                                                                                  |
| `MUNIM_ALLOWED_HOSTS`                  | The names people type to reach it, comma separated, for example `munim.example.com`.                                                       |
| `MUNIM_TRUSTED_ORIGINS`                | Its full public address when it is behind a reverse proxy, for example `https://munim.example.com`.                                        |
| `MUNIM_INSECURE_COOKIES`               | `1` lets you sign in over plain http from another machine. Anyone on that network can then read your session. Put it behind https instead. |
| `MUNIM_DB_PASSWORD`                    | The database's password. Set it before the first start; the database is not reachable from outside either way.                             |
| `MUNIM_SECRET_KEY`, `MUNIM_MASTER_KEY` | Leave unset: both are made on first start and kept in the data volume.                                                                     |

Behind a reverse proxy, every visitor looks to Munim like the proxy itself, so the wait after
wrong passphrases is shared by everyone rather than counted per address.

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
