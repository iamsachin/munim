# Progress

Status of the build order in `.claude/CLAUDE.md`. Updated in the same commit as the work it describes. "Approved" means the owner has seen it running and said yes.

Last updated: 2026-11-14

## Now

Milestone 3 in progress. Merged: the Django scaffold (#6), the account API (#8), the web app signing in against the server (#9), RSS (#10), background polling (#11), the Stream on real items (#12), feed articles readable in the thread pane (#13), rich text as blocks with images fetched through the server (#14), Hacker News with its discussions (#15), and sealed storage for secrets with the AI provider keys on the server (#16).

Open: the Docker Compose install.

Still on sample data in the browser: highlights, watches, digest, Ask, every Connections row except Hacker News, and on the AI screen the models, usage and limit (the provider keys are real).

Next: YouTube, once the owner has chosen between an API key and OAuth.

## 0. Preparation

- [x] Brainstorm and decisions recorded in `.claude/CLAUDE.md`
- [x] `port-design` and `design-gap` skills
- [x] Design handoff copied to `design/handoff/`
- [x] Licence (AGPL-3.0), git repository

## 1. Design system

- [x] Workspace scaffold (pnpm, `apps/web`, strict TypeScript, ESLint, Prettier)
- [x] `pnpm check` runs types, lint, format, Vitest, Playwright visual regression, axe
- [x] Tokens in the Tailwind `@theme` block: colours, type sizes, radii, density
- [x] Fonts (IBM Plex Sans, IBM Plex Mono), self-hosted
- [x] Shared components on a gallery page: AI badge, AI card, section label, buttons (ghost, primary, accent outline), filter chip, On/Off toggle, accent swatch, nav row, table (header, row, row button), source code tag, text input, status dot, highlight mark, save dot, citation row, media thumb, section card
- [x] Accent and density switching
- [x] Themed focus ring; every control is a native, keyboard-operable element
- [x] Light theme (design gap, approved)
- [x] Visual baselines recorded: both themes at every density and every accent (macOS Chromium)
- [x] Unsaved save-dot ring lightened to 3:1 (`dim` token, owner's decision)
- [x] duhview review on request for critical pull requests (`.duhview/`, GitHub Action)
- [x] **Approved by owner**

Not built yet because only one screen uses each: ask bar, suggestion chip, chat bubble, media preview overlay. They come with their screens in milestone 2.

## 2. Screens on mock data

- [x] Typed data layer with fixtures generated from the prototype
- [x] App shell: sidebar, ask bar, routing
- [x] Today
- [x] Stream and thread pane
- [x] Media preview
- [x] Read later
- [x] Saved
- [x] Highlights (list only; highlighting by selecting text is not built)
- [x] RSS
- [x] Digest
- [x] Watches
- [x] Ask
- [x] Connections
- [x] Appearance settings (theme, accent, density), remembered in the browser
- [x] **Designed screens approved by owner**
- [x] Security and settings: Sign-in and lock, Devices, Your data (design gap, approved)
- [x] AI settings: keys, per-feature model, monthly limit, usage (design gap, approved)
- [x] On-demand summaries in place of automatic ones (approved)
- [x] First-run setup, sign-in, lock screen (design gap, approved)
- [x] Loading, error and empty states: patterns and wording (design gap, approved; wired in milestone 3)
- [x] Keyboard navigation, command palette, shortcut help (design gap, approved)
- [x] Disabled-reply state for sources without an official write API (design gap, approved)
- [x] Highlight by selecting text, with a note (approved)
- [x] **Approved by owner**

## 3. Server, sign-in, sources

- [x] Server scaffold in `apps/server`: Django, Django Ninja, uv, ruff, mypy, pytest, wired into `pnpm check`
- [x] Development Postgres in Docker; Django admin and built-in migrations
- [x] Feed and Article models and migrations, in the admin
- [x] Stream items, with read, saved and read-later state (feed articles only so far)
- [ ] Models for the rest: other sources' items and their comments, highlights, watches
- [x] OpenAPI document committed, front-end types generated from it and checked for staleness
- [x] Stream, Saved, Read later, Today and sidebar counts from the server
- [ ] Highlights, watches, digest, Ask, connections and AI settings from the server
- [ ] Loading, error and empty states wired into every screen (`ui/States.tsx`, wording in `reader/copy.ts`); done for RSS and the device list
- [x] Postgres job queue, scheduler and worker (Procrastinate); `pnpm dev` runs the worker
- [x] Docker Compose: one app container serving web, API and the job worker, plus Postgres (`docker compose up -d`; `README.md` has install, upgrade and backup)
- [x] Master key file, generated on first use (or `MUNIM_MASTER_KEY`)
- [x] Server: passphrase sign-in, sessions, device list with Revoke, lock and idle lock, change passphrase (Django auth and sessions)
- [x] Server-side rate limiting on every passphrase check, with growing waits, counted in the database; tested by attempting a brute force from one address and from many
- [ ] Delete-all, when it exists, must confirm the passphrase through the same check
- [ ] Trusted reverse-proxy setting, so the limit sees real client addresses behind a proxy
- [x] Web app wired to the account API: setup, sign-in, lock screen with an idle timer, devices, lock settings, change passphrase
- [ ] Idle lock: watch it happen for real once (15 minutes in a browser); so far proven by unit tests and by the server's tests
- [ ] Encryption card on Security and settings, designed once the claims are true
- [ ] Export and delete-all (buttons are disabled until the server stores data; the approved passphrase confirmation for delete-all returns with it)
- [x] Encrypted storage for secrets (`munim/vault.py`), first used by the AI provider keys, which the server checks with the provider and stores sealed
- [ ] Restore the sidebar status button and the Connections note with truthful wording, now that secrets are sealed (needs the owner's approval of the wording)
- [x] RSS: add a feed, fetch and parse it safely, read its articles; every feed is polled every fifteen minutes
- [ ] RSS: remove a feed from the app (only possible in the admin now; needs a design)
- [x] RSS articles in the Stream, with unread state
- [x] Rich text: every source's text becomes blocks on the server (headings, lists, quotes, code, links, bold and italic), with images fetched through the server and kept in the data folder
- [x] Hacker News: the front page and each story's discussion, switched on and off in Connections
- [ ] YouTube
- [ ] Reddit (official OAuth)
- [x] Saving an item (full text of feed articles)
- [ ] Saving: comment threads, transcripts, thumbnails
- [ ] Search (Postgres full-text)
- [ ] Highlights stored with their position in the text, so a short quote is not also marked inside other words
- [ ] **Approved by owner**

## 4. AI and write-back

- [ ] OpenAI and Anthropic providers, keys set in the UI
- [ ] Per-feature model selection
- [ ] Usage tracking and display
- [ ] Summaries on demand, through Ask (no automatic summaries)
- [ ] Digest (daily, weekly)
- [ ] Ask with citations
- [ ] Watches matching
- [ ] Replies where the official API allows (Reddit first)
- [ ] **Approved by owner**

## Later

Passkeys and two-step sign-in; phone layout; X and Instagram; Calendar, Mail and Budget modules.

## Open decisions

See "Open decisions" in `.claude/CLAUDE.md`.
