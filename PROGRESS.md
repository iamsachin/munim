# Progress

Status of the build order in `.claude/CLAUDE.md`. Updated in the same commit as the work it describes. "Approved" means the owner has seen it running and said yes.

Last updated: 2026-11-14

## Now

On branch `milestone-2-gaps` (pull request open, not merged). Approved by the owner on 2026-11-14: the AI screen and on-demand summaries.

In progress: sign-in, first-run and lock screens together with the Sign-in, Devices and Your data cards. Then loading, error and empty states; then keyboard navigation.

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
- [ ] **Designed screens approved by owner**
- [ ] Security and settings: honest Encryption, Sign-in and lock, Devices, Your data (design gap)
- [x] AI settings: keys, per-feature model, monthly limit, usage (design gap, approved)
- [x] On-demand summaries in place of automatic ones (approved)
- [ ] First-run setup, sign-in, lock screen (design gap)
- [ ] Loading, error and empty states for every screen (design gap)
- [ ] Keyboard navigation, command palette, shortcut help (design gap)
- [ ] Disabled-reply state for sources without an official write API (design gap)
- [ ] Highlight by selecting text, with a note
- [ ] **Approved by owner**

## 3. Server, sign-in, sources

- [ ] Server scaffold in `apps/server`: Django, Django Ninja, uv, ruff, mypy, pytest, wired into `pnpm check`
- [ ] Postgres, Django models and migrations, admin
- [ ] OpenAPI document, generated front-end client replacing the mock store
- [ ] Postgres job queue and scheduler
- [ ] Docker Compose: one app container serving web, API and jobs, plus Postgres
- [ ] Master key file, generated on first run
- [ ] Passphrase sign-in, sessions, device list with Revoke, idle lock (Django auth and sessions)
- [ ] Encrypted storage for source tokens and AI keys; then restore the sidebar status button and the Connections note with truthful wording
- [ ] RSS
- [ ] Hacker News
- [ ] YouTube
- [ ] Reddit (official OAuth)
- [ ] Saving: full text, threads, transcripts, thumbnails
- [ ] Search (Postgres full-text)
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
