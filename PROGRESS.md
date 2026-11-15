# Progress

Status of the build order in `.claude/CLAUDE.md`. Updated in the same commit as the work it describes. "Approved" means the owner has seen it running and said yes.

Last updated: 2026-11-15

## Now

Milestone 3 in progress. Merged: the Django scaffold (#6), the account API (#8), the web app signing in against the server (#9), RSS (#10), background polling (#11), the Stream on real items (#12), feed articles readable in the thread pane (#13), rich text as blocks with images fetched through the server (#14), Hacker News with its discussions (#15), sealed storage for secrets with the AI provider keys on the server (#16), the Docker Compose install (#17), full-text search in the Stream (#18), search matches marked in the open article (#19), highlights on the server (#20), removing a feed (#21), the Encryption card (#22), export and delete-all (#23), the trusted-proxies setting (#24), and YouTube through OAuth with click-to-play and a card view (#25).

Nothing in the browser runs on sample data any more. Watches are real: matched on the server, a topic by a model. Digest is real: switched on, the worker writes one each day and each Sunday. Ask is real: the worker puts a question to the model chosen for it, from the items in its scope, and the answer cites them. The AI screen is all the server's: keys, models, each feature's model, the prices the owner enters, usage and the monthly limit.

Reddit is not possible today: Reddit requires its approval before an app may read anything (2026-11-15). It joins X and Instagram as "Not available yet" on Connections, each with its reason, and is built only if Reddit approves the owner's request.

Next: the owner's approval of milestones 3 and 4; what is left unticked in milestone 3 (saving comment threads and transcripts, the idle lock seen for real).

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
- [x] Models for the rest: other sources' items and their comments, highlights, watches, digests, questions and answers
- [x] OpenAPI document committed, front-end types generated from it and checked for staleness
- [x] Stream, Saved, Read later, Today and sidebar counts from the server
- [x] Highlights, watches, digest, Ask, connections and AI settings from the server; no sample data is left in the web app
- [x] Loading, error and empty states wired into every screen (`ui/States.tsx`, wording in `reader/copy.ts`); audited 2026-11-15, when Today's watches were the one gap. Connections says each row's state in the row itself.
- [x] Postgres job queue, scheduler and worker (Procrastinate); `pnpm dev` runs the worker; a job left behind by a worker that died is put back within five minutes
- [x] Docker Compose: one app container serving web, API and the job worker, plus Postgres (`docker compose up -d`; `README.md` has install, upgrade and backup)
- [x] Master key file, generated on first use (or `MUNIM_MASTER_KEY`)
- [x] Server: passphrase sign-in, sessions, device list with Revoke, lock and idle lock, change passphrase (Django auth and sessions)
- [x] Server-side rate limiting on every passphrase check, with growing waits, counted in the database; tested by attempting a brute force from one address and from many
- [x] Delete-all confirms the passphrase through the same rate-limited check as sign-in
- [x] Trusted reverse-proxy setting (`MUNIM_TRUSTED_PROXIES`), so the limit sees real client addresses behind a proxy
- [x] Web app wired to the account API: setup, sign-in, lock screen with an idle timer, devices, lock settings, change passphrase
- [ ] Idle lock: watch it happen for real once (15 minutes in a browser); so far proven by unit tests and by the server's tests
- [x] Encryption card on Security and settings, saying what this install does; and a line on the AI screen about how keys are kept (approved)
- [x] Export (a zip of JSON and text files, with no secrets in it) and delete-all (feeds, items, highlights, connections and API keys; the account stays)
- [x] Encrypted storage for secrets (`munim/vault.py`), first used by the AI provider keys, which the server checks with the provider and stores sealed
- [x] The Connections note about stored sign-ins is back, worded truthfully; the sidebar's status slot stays the Commands button
- [x] RSS: add a feed, fetch and parse it safely, read its articles; every feed is polled every fifteen minutes
- [x] RSS: remove a feed from the app; what the owner saved, queued or highlighted stays (approved)
- [x] RSS articles in the Stream, with unread state
- [x] Rich text: every source's text becomes blocks on the server (headings, lists, quotes, code, links, bold and italic), with images fetched through the server and kept in the data folder
- [x] Hacker News: the front page and each story's discussion, switched on and off in Connections
- [x] YouTube: the owner's subscriptions through OAuth, set up and connected on Connections; videos play where they are; the YouTube page is cards by default (approved)
- [ ] Reddit (official OAuth, read-only, kept out of AI calls): waits for Reddit's approval of the request sent 2026-11-15; shown as "Not available yet" until then
- [x] Connections says only what is true: Hacker News, YouTube and feeds from the server; Reddit, X and Instagram "Not available yet" with the reason
- [x] Saving an item (full text of feed articles)
- [x] Saving keeps an item's full text and its comment thread as last fetched: no source ever deletes an item, and removing a feed leaves what was saved. Transcripts are dropped: no official API has them (owner's decision, 2026-11-15).
- [ ] Saving: a saved item's pictures are kept only once they have been shown; they are not fetched at the moment of saving
- [x] Search (Postgres full-text) in the Stream: the words typed are looked for together first, then anywhere, in titles and article text, in any form; quoted phrases, OR and exclusions as written. Replies are not searched yet.
- [x] Search matches shown in the open article: marked words, a tick for each down the edge, and a stepper (approved)
- [x] Highlights on the server, stored with their position in the text: a highlight can cross bold, italic and links, is marked only where it was made, and is found again by its words if the text changes
- [ ] **Approved by owner**

## 4. AI and write-back

- [x] OpenAI and Anthropic providers, keys set in the UI
- [x] Per-feature model selection: each provider's own model list, fetched with the key and again daily; the choice is kept on the server
- [x] Usage tracking and display: each call's tokens and cost at the price the owner entered for its model; a monthly limit in dollars that pauses AI (the Prices table waits for the owner's approval)
- [x] Summaries on demand, through Ask (no automatic summaries)
- [x] Digest (daily at 7:00 and weekly on Sunday, on the owner's clock): written by the worker from what came in, naming its items; off until switched on; a day that cannot be written says why (the switch and its states wait for the owner's approval; not yet written by a real model)
- [x] Ask with citations: over everything, saved, this week or the open item; answered by the worker; only the items given can be cited; Reddit content is never sent; the answer is shown as it is written; a follow-up carries its conversation on, from the same items; the Ask screen lists conversations, one for each post asked about, with the open one beside the list; a passage of an answer can be highlighted; a citation shows the words of the item it rests on and opens the item at them (the screen waits for the owner's approval; quoting has not been tried with a real model)
- [x] Watches matching: a keyword by its words and a person by who published or replied, both free; a topic by the Watch model, hourly, on new items only (the kind picker, Remove and the dropped "In" column wait for the owner's approval; no topic has been judged by a real model yet)
- [ ] Replies where the official API allows (none of the connected sources does; Reddit stays read-only)
- [ ] **Approved by owner**

## Later

Passkeys and two-step sign-in; phone layout; X and Instagram; Calendar, Mail and Budget modules.

## Open decisions

See "Open decisions" in `.claude/CLAUDE.md`.
