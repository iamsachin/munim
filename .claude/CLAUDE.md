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

| Area | Decision |
| --- | --- |
| Audience | Open-source self-host. One owner account per install. |
| Platform | Web app, desktop width (min 920px). No phone layout yet. |
| Stack | React + Vite + TypeScript front end. Python backend. Postgres. |
| Backend | Django with Django Ninja. One app process serves the built web app, the API and runs background jobs, next to Postgres. Use what Django provides (ORM, migrations, auth, sessions, admin) before writing or adding anything. |
| API | REST with JSON through Django Ninja, validated by Pydantic, with a published OpenAPI document. The front end's types and client are generated from that document, never written by hand. |
| Database | Django ORM and Django migrations. |
| Jobs | Queued and scheduled in Postgres (polling, transcripts, summaries, digests). No Redis. Jobs survive restarts and run with nobody signed in. |
| AI clients | The official `openai` and `anthropic` Python SDKs behind one small interface of our own. No LiteLLM, no agent framework. |
| Search | Postgres full-text search first. The schema leaves room for pgvector embeddings later; none are computed yet. |
| Styling | Tailwind v4. Design tokens live in one `@theme` block; no raw colour, font or size values in components. |
| Themes | Dark as designed, plus the approved light theme. Five accents, three densities, as designed. |
| Input | Keyboard-first: j/k row navigation, single-key actions, command palette, on top of standard accessibility. |
| Scope | Hub. Code is organised by module from day one; the reader is the first module. Calendar, Mail and Budget stay as the disabled placeholders in the design until each is designed. |
| Sources | RSS, Hacker News and YouTube first. Reddit next through its official OAuth API. X and Instagram are shown as "Not available yet". Official APIs only: no scraping, no bridges. |
| Writing back | Replies, comments and votes only where the source's official API allows it (Reddit first). Elsewhere the control is disabled with a one-line reason and a link to the original. |
| Saving | Full text, whole comment thread, video transcript and chapters, image thumbnails. Never download video files. |
| AI | OpenAI and Anthropic, each with an owner-supplied key set in the UI. Three features call a model, each with its own provider and model setting: Digest, Ask, Watch matching. Nothing is summarised automatically: a summary is an Ask the owner sends ("Summarize this thread"), to save tokens. A monthly spend limit pauses all AI when reached. Settings show usage per feature and model. |
| Encryption | Source tokens and AI keys are encrypted by the app with a master key. The key is a file generated on first run in the data folder, or supplied as an environment variable; it is not derived from the passphrase. Content is plain in Postgres so search and Ask work. Disk encryption is the self-hoster's job. |
| Sign-in | One passphrase, server-side sessions, built on Django's auth and session framework. The device list is the session list, with working Revoke and idle lock. Every place a passphrase is checked (sign-in, unlock, change passphrase, delete-all confirmation) is rate limited on the server so it cannot be brute forced; the wait shown in the browser is only the display of that. Passkeys and two-step come later. |
| Distribution | Docker Compose: app container plus Postgres. `docker compose up` is the whole install. |
| Licence | AGPL-3.0. |

Chosen by Claude, not yet confirmed by the owner (change freely if told otherwise): pnpm workspace with `apps/web` (exists) and `apps/server` (the Python project, created in milestone 3); uv for Python dependencies; ruff, mypy in strict mode and pytest, matching the owner's duhview project; for the Postgres job queue, Django's own tasks framework if its database backend is ready, otherwise Procrastinate's Django integration (check both before adopting one); `openapi-typescript` to generate the front end's types; the page polls for new items at first, server-sent events later if polling proves too slow; Vitest and Playwright on the front end.

Version pins with a reason: TypeScript stays on 6.0 until typescript-eslint supports 7. ESLint is 10 with a peer allowance for eslint-plugin-jsx-a11y in `pnpm-workspace.yaml`.

## Honesty rules

- The security copy in the prototype is false for this architecture ("End-to-end encrypted", "Keys stay on your devices", "Encrypted · keys on device", "the server cannot read your saved items"). Never ship it. The screen must describe what the app actually does; rewriting it is a design gap.
- No control may look functional when it is not. Unbuilt features are disabled and say why.
- AI output is always marked with the AI badge and, where it makes claims, cites the items it drew on.
- Until a security feature is real, the UI says nothing about it. The handoff's encryption lines in the sidebar, Saved and Connections are left out for now and return, worded truthfully, when milestone 3 builds the feature.

## Design gaps (need a design before code)

first-run setup and sign-in; lock screen; loading, error and empty states for every screen; honest security screen; command palette and shortcut help; disabled-reply state.

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

## Commands

- `pnpm dev`: the web app at http://localhost:5173. The design-system gallery is at `/gallery`.
- `pnpm check`: types, lint, format, unit tests, then a production build with Playwright visual regression and axe.
- `pnpm format`: apply Prettier.
- `pnpm --filter web exec playwright test --update-snapshots`: re-record baselines. Only for a change the owner has approved; look at every changed image first.

Baselines are recorded on macOS Chromium and are platform-specific; other platforms need their own.

## Git

- Work on a feature branch. Commit each finished piece yourself once the gates pass. Small conventional commits.
- Never merge to `main` or push unless asked.
- duhview reviews a pull request only on request (owner's decision, 2026-11-14): comment `@duhview review` on it. Ask for one on critical pull requests, meaning anything touching sign-in, sessions, secrets, encryption, database migrations, source connectors, write-back to sources, or AI calls and their cost; not on UI-only work. Settings are in `.duhview/` and are read from the base branch. Fix its major findings before asking for a merge. Minor findings, and ones about something already planned for later, can be left; list the ones left in the summary to the owner. Each review costs up to the budget in `.duhview/config.yaml`.
- The Playwright gate runs a production build. Anything that behaves differently in development (React StrictMode runs effects twice) must also be tried against `pnpm dev`.

## Engineering rules

- Solve the whole task with the least new code. No abstraction, option or dependency that nothing needs yet. In particular: no plugin framework for modules until a second module exists; a module is a folder with its routes, screens and data.
- Never hard-code model names or lists. Read them from the provider's models endpoint. Consult the `claude-api` skill before writing any Anthropic code.
- Secrets never reach the browser, logs, error messages or test fixtures.
- Every migration must be safe to run on a stranger's existing data.
- Validate at trust boundaries with Pydantic on the server: HTTP input, source API responses, feed XML, AI output that drives UI. The browser validates what it reads from its own storage.
- Respect each source's rate limits and terms. Cache and poll conservatively.

## Open decisions (ask before building the part that depends on them)

- YouTube: API key for public channels, or OAuth for the owner's subscriptions.
- Spend limit pricing: the limit is in dollars, which needs each model's price. Providers' model lists do not include prices, so either Munim ships a price table that goes stale between releases, or the owner enters prices, or the limit is in tokens.
- Digest schedule: fixed at 7:00 daily and Sunday weekly as designed, or configurable. (They run on the server either way.)
