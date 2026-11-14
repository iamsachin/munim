# Progress

Status of the build order in `.claude/CLAUDE.md`. Updated in the same commit as the work it describes. "Approved" means the owner has seen it running and said yes.

Last updated: 2026-11-14

## Now

Milestone 3 in progress. Merged: the Django scaffold (#6) and the account API with rate-limited passphrase checks (#8).

On branch `milestone-3-web-auth` (pull request #9), waiting for the owner: the web app's set-up, sign-in, lock screen with idle timer, devices, lock settings and change passphrase now use the real server. The reader's screens still run on sample data.

Next: Munim's own models (items, feeds, saved, highlights) and the first real source, RSS. Needs the owner's answer on YouTube access before that source.

Lesson for stacked pull requests: merge the base without deleting its branch, retarget the next one to `main`, then delete. Deleting the base branch closes the pull request stacked on it.

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
- [ ] Munim's own models and migrations
- [x] OpenAPI document committed, front-end types generated from it and checked for staleness
- [ ] Reader data from the server, replacing the mock store
- [ ] Loading, error and empty states wired into every screen (`ui/States.tsx`, wording in `reader/copy.ts`)
- [ ] Postgres job queue and scheduler
- [ ] Docker Compose: one app container serving web, API and jobs, plus Postgres
- [ ] Master key file, generated on first run
- [x] Server: passphrase sign-in, sessions, device list with Revoke, lock and idle lock, change passphrase (Django auth and sessions)
- [x] Server-side rate limiting on every passphrase check, with growing waits, counted in the database; tested by attempting a brute force from one address and from many
- [ ] Delete-all, when it exists, must confirm the passphrase through the same check
- [ ] Trusted reverse-proxy setting, so the limit sees real client addresses behind a proxy
- [x] Web app wired to the account API: setup, sign-in, lock screen with an idle timer, devices, lock settings, change passphrase
- [ ] Idle lock: watch it happen for real once (15 minutes in a browser); so far proven by unit tests and by the server's tests
- [ ] Encryption card on Security and settings, designed once the claims are true
- [ ] Export and delete-all (buttons are disabled until the server stores data; the approved passphrase confirmation for delete-all returns with it)
- [ ] Encrypted storage for source tokens and AI keys; then restore the sidebar status button and the Connections note with truthful wording
- [ ] RSS
- [ ] Hacker News
- [ ] YouTube
- [ ] Reddit (official OAuth)
- [ ] Saving: full text, threads, transcripts, thumbnails
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
