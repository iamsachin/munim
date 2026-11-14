# Munim

Munim is an open-source, self-hosted personal hub. The first module is a **reader**: one stream for RSS, Hacker News, YouTube, Reddit, X and Instagram, with saving, read-later, highlights, watches, AI summaries, digests and Ask. Calendar, Mail and Budget are later modules.

The quality bar is the point of this project. Prefer a smaller thing finished properly over a larger thing half done.

## Design source of truth

- `design/handoff/Atrium.dc.html` is the design. Read it, do not render or screenshot it unless asked. Every dimension, colour and layout rule is in its inline styles; the mock data and behaviour are in the script at the bottom.
- The prototype calls the app "Atrium". The product is **Munim**: replace the wordmark and any copy that says Atrium.
- `Feed*.dc.html`, `Pairings.dc.html` and `uploads/` are earlier explorations. Reference only; Atrium wins any conflict.
- Do not use the "Organic" design system that Claude Design may attach. It is deliberately excluded.
- Recreate the visual output pixel-perfectly. Do not copy the prototype's structure: it is one file of inline styles with clickable `div`s.
- Porting a designed screen or component: use the `port-design` skill.
- Anything with no design (see "Design gaps"): use the `design-gap` skill. The owner approves it in the browser before anything is built on top of it.

## Decisions already made

| Area         | Decision                                                                                                                                                                                                                                                                                                                                                                                                               |
| ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Audience     | Open-source self-host. One owner account per install.                                                                                                                                                                                                                                                                                                                                                                  |
| Platform     | Web app, desktop width (min 920px). No phone layout yet.                                                                                                                                                                                                                                                                                                                                                               |
| Stack        | React + Vite + TypeScript front end. Python backend. Postgres.                                                                                                                                                                                                                                                                                                                                                         |
| Backend      | Django with Django Ninja. One app process serves the built web app, the API and runs background jobs, next to Postgres. Use what Django provides (ORM, migrations, auth, sessions, admin) before writing or adding anything.                                                                                                                                                                                           |
| API          | REST with JSON through Django Ninja, validated by Pydantic, with a published OpenAPI document. The front end's types and client are generated from that document, never written by hand.                                                                                                                                                                                                                               |
| Database     | Django ORM and Django migrations.                                                                                                                                                                                                                                                                                                                                                                                      |
| Jobs         | Queued and scheduled in Postgres (polling, transcripts, summaries, digests). No Redis. Jobs survive restarts and run with nobody signed in.                                                                                                                                                                                                                                                                            |
| AI clients   | The official `openai` and `anthropic` Python SDKs behind one small interface of our own. No LiteLLM, no agent framework.                                                                                                                                                                                                                                                                                               |
| Search       | Postgres full-text search first. The schema leaves room for pgvector embeddings later; none are computed yet.                                                                                                                                                                                                                                                                                                          |
| Styling      | Tailwind v4. Design tokens live in one `@theme` block; no raw colour, font or size values in components.                                                                                                                                                                                                                                                                                                               |
| Themes       | Dark as designed, plus the approved light theme. Five accents, three densities, as designed.                                                                                                                                                                                                                                                                                                                           |
| Input        | Keyboard-first: j/k row navigation, single-key actions, command palette, on top of standard accessibility.                                                                                                                                                                                                                                                                                                             |
| Scope        | Hub. Code is organised by module from day one; the reader is the first module. Calendar, Mail and Budget stay as the disabled placeholders in the design until each is designed.                                                                                                                                                                                                                                       |
| Sources      | RSS, Hacker News and YouTube first. Reddit next through its official OAuth API. X and Instagram are shown as "Not available yet". Official APIs only: no scraping, no bridges. Hacker News is the front page from Y Combinator's own API, with each discussion from HN Search (run by Algolia) in one request, which the owner accepts as official (2026-11-14).                                                       |
| Writing back | Replies, comments and votes only where the source's official API allows it (Reddit first). Elsewhere the control is disabled with a one-line reason and a link to the original.                                                                                                                                                                                                                                        |
| Saving       | Full text, whole comment thread, video transcript and chapters, image thumbnails. Never download video files.                                                                                                                                                                                                                                                                                                          |
| AI           | OpenAI and Anthropic, each with an owner-supplied key set in the UI. Three features call a model, each with its own provider and model setting: Digest, Ask, Watch matching. Nothing is summarised automatically: a summary is an Ask the owner sends ("Summarize this thread"), to save tokens. A monthly spend limit pauses all AI when reached. Settings show usage per feature and model.                          |
| Encryption   | Source tokens and AI keys are encrypted by the app with a master key. The key is a file generated on first run in the data folder, or supplied as an environment variable; it is not derived from the passphrase. Content is plain in Postgres so search and Ask work. Disk encryption is the self-hoster's job.                                                                                                       |
| Sign-in      | One passphrase, server-side sessions, built on Django's auth and session framework. The device list is the session list, with working Revoke and idle lock. Every place a passphrase is checked (sign-in, unlock, change passphrase, delete-all confirmation) is rate limited on the server so it cannot be brute forced; the wait shown in the browser is only the display of that. Passkeys and two-step come later. |
| Distribution | Docker Compose: app container plus Postgres. `docker compose up` is the whole install.                                                                                                                                                                                                                                                                                                                                 |
| Licence      | AGPL-3.0.                                                                                                                                                                                                                                                                                                                                                                                                              |

Tooling, confirmed by the owner: uv for Python dependencies (its lockfile is committed); Docker Postgres for development and tests. Chosen by Claude and still open to change: ruff, mypy in strict mode with django-stubs, and pytest with pytest-django, matching the owner's duhview project; Procrastinate as the Postgres job queue (Django 6.1 ships no database-backed runner and no scheduling; checked 2026-11-14); `openapi-typescript` to generate the front end's types; the page polls for new items at first, server-sent events later if polling proves too slow; Vitest and Playwright on the front end.

Version pins with a reason: TypeScript stays on 6.0 until typescript-eslint supports 7. ESLint is 10 with a peer allowance for eslint-plugin-jsx-a11y in `pnpm-workspace.yaml`.

## Honesty rules

- The security copy in the prototype is false for this architecture ("End-to-end encrypted", "Keys stay on your devices", "Encrypted · keys on device", "the server cannot read your saved items"). Never ship it. The screen must describe what the app actually does; rewriting it is a design gap.
- No control may look functional when it is not. Unbuilt features are disabled and say why.
- AI output is always marked with the AI badge and, where it makes claims, cites the items it drew on.
- Until a security feature is real, the UI says nothing about it. The Encryption card on Security and settings and the line on the AI screen say only what this install does (wording approved by the owner, 2026-11-15); any change to them, or any new security claim, needs the owner's approval. The handoff's sidebar status button is not coming back (its slot is the Commands button); its Saved line ("Stored encrypted") stays out because content is not encrypted; its Connections note returns when a source first stores a token.

## Design gaps (need a design before code)

Anything the handoff does not show.

## Build order

1. **Design system.** Tokens, type, density, and the shared components from the prototype, on a gallery page that is reviewed and approved before any screen is built.
2. **Screens on mock data** behind a typed data layer, so real sources replace mocks without touching the UI.
3. **Server, sign-in, Postgres**, then sources in the order above.
4. **AI features**, then write-back.

Do not start a step until the previous one is approved.

`PROGRESS.md` is the checklist for this build order. Read it at the start of a session; tick items and update its "Now" section in the same commit as the work.

## Definition of done

A piece of work is done only when all of these pass, and the result has been looked at running in a browser:

- `tsc` strict, ESLint and Prettier clean.
- Front end: Vitest unit tests for logic and the data layer.
- Server (from milestone 3): ruff, mypy strict with django-stubs, and pytest (pytest-django) with unit tests for parsers and logic and integration tests for routes, source connectors and jobs against a real Postgres.
- Playwright visual regression against approved baselines for every component and screen touched. A changed baseline needs the owner's approval, never a silent update.
- Accessibility: real buttons, links and inputs; full keyboard operation; visible themed focus; axe checks pass; contrast holds in both themes and every accent.

`pnpm check` runs all of the above. Report failures with their output; never describe unverified work as done.

While working, run only the tests the change touches (one pytest file, one Playwright test by name). Run the whole of `pnpm check` once before a pull request is opened, and again before it is merged if anything changed since (owner's decision, 2026-11-15: the full gate on every step was slowing the work down).

## Commands

- `pnpm db`: start the development Postgres (Docker, port 5433, `compose.dev.yaml`) and wait until it is healthy. Everything below needs it.
- `docker compose up -d --build`: the install itself (`compose.yaml`, `Dockerfile`, `apps/server/start.sh`), at http://localhost:8000. To try it without touching anything else, give it its own name and port: `MUNIM_PORT=8010 docker compose -p munim-smoke up -d --build --wait`, and remove it with `docker compose -p munim-smoke down -v --rmi local`.
- `pnpm dev`: the web app at http://localhost:5173, the Django server at http://localhost:8000 and the job worker, together. The web app proxies `/api` and `/admin` to the server and shows "Munim is not answering" without it. The design-system gallery is at `/gallery`; API docs at `/api/docs`.
- `pnpm dev:web`, `pnpm dev:server`: either one on its own.
- `pnpm test-stack:server` and `pnpm test-stack:web`: a second copy of the app for trying things by hand, at http://localhost:4173, on its own database (`munim_e2e`) that is emptied each time the server starts. `pnpm test-stack:worker` runs its jobs, which anything fetched in the background (Hacker News) needs.
- `pnpm gen:api`: regenerate `apps/server/openapi.json` and the web app's types (`apps/web/src/api/schema.d.ts`) from the server's code. Run it after changing any endpoint or schema; `pnpm check` fails if they are stale.
- `pnpm check`: for the web app, types, lint, format, unit tests, then a production build with Playwright visual regression and axe; for the server, mypy, ruff and pytest; and that the generated API types are current. Playwright also starts the real server on its own database (`munim_e2e`) for `real-server.spec.ts`.
- `pnpm format`: apply Prettier.
- `pnpm --filter web exec playwright test --update-snapshots`: re-record baselines. Only for a change the owner has approved; look at every changed image first.

Baselines are recorded on macOS Chromium and are platform-specific; other platforms need their own.

## The owner's data

The development database (`munim`, behind `pnpm dev` on ports 5173 and 8000) is the owner's own install: their passphrase, feeds and reading state. Never flush it, seed it, sign in to it or change its rows. Reading it to diagnose something is fine. Anything you try by hand, including every agent-browser test, runs on the test stack (`pnpm test-stack:server`, `pnpm test-stack:web`), whose database is disposable. Migrating the development database is the one change allowed, because the owner's `pnpm dev` does it anyway.

## Git

- Work on a feature branch. Commit each finished piece yourself once the gates pass. Small conventional commits.
- Push the branch and open a pull request for each piece. Merge it yourself (rebase, delete the branch) when both of these hold, without asking (owner's standing rule, 2026-11-14): `pnpm check` passes, and you have tested the change in a real browser with the agent-browser skill, in a visible window, and it passed. If the browser test finds a problem, fix it and run the test again before merging. A design the owner has not seen (anything from the `design-gap` skill) still waits for their approval first. Never push to `main` directly. For stacked pull requests, merge the base without deleting its branch, retarget the next one to `main`, then delete; deleting the base branch closes the one stacked on it.
- **duhview is paused (owner's decision, 2026-11-15): do not request a review on any pull request until the owner says to use it again.** The rest of this rule is how it works when it is back. duhview reviews a pull request only on request (owner's decision, 2026-11-14): comment `@duhview review` on it. Ask for one on critical pull requests, meaning anything touching sign-in, sessions, secrets, encryption, database migrations, source connectors, write-back to sources, or AI calls and their cost; not on UI-only work. Settings are in `.duhview/` and are read from the base branch. Fix its major findings before asking for a merge. Minor findings, and ones about something already planned for later, can be left; list the ones left in the summary to the owner. Each review costs up to the budget in `.duhview/config.yaml`.
- The Playwright gate runs a production build. Anything that behaves differently in development (React StrictMode runs effects twice) must also be tried against `pnpm dev`.

## Engineering rules

- Solve the whole task with the least new code. No abstraction, option or dependency that nothing needs yet. In particular: no plugin framework for modules until a second module exists; a module is a folder with its routes, screens and data.
- Never hard-code model names or lists. Read them from the provider's models endpoint. Consult the `claude-api` skill before writing any Anthropic code.
- Secrets never reach the browser, logs, error messages or test fixtures. A stored secret (an AI key now, source tokens later) is sealed with `seal()` in `munim/vault.py` before it is saved and read back only with `unseal()`; the browser is told at most its last four characters. The master key is `MUNIM_MASTER_KEY`, or `master.key` in the data folder, made on first use. Tests get an empty data folder of their own (`own_data_folder` in `conftest.py`).
- AI providers are reached only through `ai/providers.py`, with the official SDKs. Their HTTP library is `httpx2`, not `httpx`; tests replace `ai.providers.TRANSPORT` so nothing reaches a real provider.
- Every migration must be safe to run on a stranger's existing data. Read every generated migration before keeping it: when a model is renamed and changed at once, Django writes "delete the old table, create a new one", which destroys the data. Write the rename by hand (`RenameModel`, then the field changes) and prove it with a test that migrates real rows, as `tests/test_migrations.py` does.
- Anything the server fetches because of an address someone typed (feeds now, more sources later) goes through `download()` in `reader/feeds.py` or the same checks: http(s) only, private networks refused at every redirect, size and time capped. `MUNIM_ALLOW_PRIVATE_FEEDS=1` is the only way round it.
- Content from outside is stored as blocks (`reader/blocks.py`: paragraph, heading, list, quote, code, image, with bold, italic, code and link marks) and drawn by `Blocks.tsx`. Every source's text is converted to blocks on the server; nothing a source sends is rendered as HTML, and no new block or mark is added without a converter test.
- Images in content reach the browser only through `/api/items/{id}/images/{n}`, which fetches with `download()` and keeps a copy in the data folder (`MUNIM_DATA_DIR`). The browser never asks a publisher for anything, so publishers do not learn the owner's address or when they read.
- Background work is a Procrastinate task in the app's `tasks.py`, run by the worker (`manage.py procrastinate worker`). A scheduled task takes both a `queueing_lock` and a `lock`, so missed runs do not pile up and runs never overlap. Reading the API never fetches from the outside world; only tasks, the add-a-feed call and the first request for an image do.
- A source followed as a whole (Hacker News) has a `Connection` row and is off until the owner switches it on in Connections. Switching it on queues its first fetch for the worker; it is never fetched inside the request.
- A reply's text is blocks too, drawn by the same `Blocks` component. Replies carry no images.
- A highlight is stored by where it is: the item, the reply (or none), the unit (each paragraph, heading, quotation paragraph and list item is one; `reader/units.ts`) and the characters within it, plus its words. The browser marks it there if the words still match, and otherwise finds it by its words. A new kind of block must say how many units it is (`unitCount`).
- Search is Postgres full-text on `Item.search`, a column Postgres itself keeps from the title and the text, so nothing has to remember to update it. Text a search should find must end up in `Item.body`.
- Server data in the web app is read with TanStack Query (`apps/web/src/api/queries.tsx`); each screen shows `LoadingRows`, `ErrorState` and `EmptyState` for its own reads.
- An install reached through a reverse proxy must list its public address in `MUNIM_TRUSTED_ORIGINS`, or Django refuses its calls as cross-site.
- The install is one container: `start.sh` migrates, then runs gunicorn and the Procrastinate worker, and stops the container if either stops. Django serves the built web app: its files through WhiteNoise, every screen address through `munim/web.py`. A new top-level path served by Django (like `api/` or `admin/`) must be added to the exclusions in `munim/urls.py`. Anything an install can set is passed through `compose.yaml` and listed in `README.md`.
- The development database is the Compose project `munim` (`compose.dev.yaml`); the install is `munim-install`. Never run a Compose command against the project `munim` other than `pnpm db`.
- Everything an install can change is a `MUNIM_*` environment variable read through `env()` in `munim/settings.py`. A secret has no default outside development mode (`MUNIM_DEBUG=1`): the server must fail to start rather than run on a guessable value.
- Server tests treat warnings as errors. Fix a deprecation when it appears.
- The passphrase is compared in exactly one place: `_check` in `account/api.py`, which runs it under `attempt()` from `account/throttle.py`. Any new endpoint that asks for the passphrase calls `_check`; never call `check_password` anywhere else. The admin has no sign-in form of its own for the same reason.
- The web app talks to the server only through `api` in `apps/web/src/api/client.ts`, typed from the generated schema. A call that needs an open session passes its error to `session.refused()`, which follows the server to the lock or sign-in screen.
- Statuses mean one thing each: 401 not signed in (or a wrong passphrase at sign-in), 403 a wrong passphrase from a signed-in session, 423 locked, 429 wait.
- Browser tests of screens use the stand-in server in `apps/web/e2e/fake-server.ts`, so they stay fast and parallel; keep it in step with the real API. Anything that crosses the browser-server boundary for real (cookies, CSRF, the proxy) is tested in `real-server.spec.ts`.
- API endpoints declare who may call them: `Open()` (signed in and unlocked) by default, `SignedIn()` only for what a locked session must still reach, `Csrf()` only for what happens before sign-in.
- Validate at trust boundaries with Pydantic on the server: HTTP input, source API responses, feed XML, AI output that drives UI. The browser validates what it reads from its own storage.
- Respect each source's rate limits and terms. Cache and poll conservatively.

## Open decisions (ask before building the part that depends on them)

- YouTube: API key for public channels, or OAuth for the owner's subscriptions.
- Spend limit pricing: the limit is in dollars, which needs each model's price. Providers' model lists do not include prices, so either Munim ships a price table that goes stale between releases, or the owner enters prices, or the limit is in tokens.
- Digest schedule: fixed at 7:00 daily and Sunday weekly as designed, or configurable. (They run on the server either way.)
