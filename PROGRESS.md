# Progress

Status of the build order in `.claude/CLAUDE.md`. Updated in the same commit as the work it describes. "Approved" means the owner has seen it running and said yes.

Last updated: 2026-11-17

## Now

Milestones 0 to 4 are built and approved by the owner (3 and 4 on 2026-11-17). The owner's daily use runs on the Docker install since that day.

Everything on screen comes from the server: RSS, Hacker News and YouTube; the Stream with search that also looks in replies; saving, with pictures kept; highlights, in items and in answers; Ask, with conversations and quoted citations; Digest, daily and weekly; watches by words and by topic; the AI screen with keys, models, prices, usage and the monthly limit.

Not possible today, and shown as such: Reddit (waits for Reddit's approval of the request sent 2026-11-15), and replies to any source. X is read for watches only. Instagram is dropped (2026-11-17): it has no official way to read a personal feed.

Next: what the owner chooses from "Later".

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
- [x] Idle lock: seen for real on 2026-11-17 (five minutes in a visible browser on the test stack: nothing at 4m30s, the Locked cover and a refusing server at 5m30s), and by a browser test that drives the clock
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
- [x] X, for watches only: a keyword or person watch switched on for X is searched there once a day, for at most ten posts, with the owner's own token; its posts are kept from AI calls (waits for the owner's approval; not yet tried against the real X)
- [x] Links in text: each with its site's icon; a bare address as a one-line card with the page's title, which the worker looks up when the item is opened (waits for the owner's approval; not yet seen against real pages)
- [x] Sign-in by a code: sent in an email on an install with mail set up, or written to the server's log on one without; sent only to the owner's address, under the same limit as the passphrase; no idle lock; deleting everything confirmed by a code (waits for the owner's approval; not yet sent through a real mail server)
- [ ] Reddit (official OAuth, read-only, kept out of AI calls): waits for Reddit's approval of the request sent 2026-11-15; shown as "Not available yet" until then
- [x] Connections says only what is true: Hacker News, YouTube and feeds from the server; Reddit "Not available yet" with the reason (X is since read for watches; Instagram is dropped)
- [x] Saving an item (full text of feed articles)
- [x] Saving keeps an item's full text and its comment thread as last fetched: no source ever deletes an item, and removing a feed leaves what was saved. Transcripts are dropped: no official API has them (owner's decision, 2026-11-15).
- [x] Saving an item fetches its pictures in the worker, shown or not, so they stay if the publisher takes them down
- [x] Search (Postgres full-text) in the Stream: the words typed are looked for together first, then anywhere, in titles and article text, in any form; quoted phrases, OR and exclusions as written. Replies are searched too (2026-11-17), and a match in one is marked there.
- [x] Search matches shown in the open article: marked words, a tick for each down the edge, and a stepper (approved)
- [x] Highlights on the server, stored with their position in the text: a highlight can cross bold, italic and links, is marked only where it was made, and is found again by its words if the text changes
- [x] **Approved by owner** (2026-11-17)

## 4. AI and write-back

- [x] OpenAI and Anthropic providers, keys set in the UI
- [x] Per-feature model selection: each provider's own model list, fetched with the key and again daily; the choice is kept on the server
- [x] Usage tracking and display: each call's tokens and cost at the price the owner entered for its model; a monthly limit in dollars that pauses AI
- [x] Summaries on demand, through Ask (no automatic summaries)
- [x] Digest (daily at 7:00 and weekly on Sunday, on the owner's clock): written by the worker from what came in, naming its items; off until switched on; a day that cannot be written says why; a day that waited on the owner is written once they have put it right
- [x] Ask with citations: over everything, saved, this week or the open item; answered by the worker; only the items given can be cited; Reddit content is never sent; the answer is shown as it is written; a follow-up carries its conversation on, from the same items; the Ask screen lists conversations, one for each post asked about, with the open one beside the list; a passage of an answer can be highlighted; a citation shows the words of the item it rests on and opens the item at them
- [x] Watches matching: a keyword by its words and a person by who published or replied, both free; a topic by the Watch model, hourly, on new items only; a topic also by its words together, and on its first look by the titles of the past week
- [ ] Replies where the official API allows (none of the connected sources does; Reddit stays read-only)
- [x] **Approved by owner** (2026-11-17)

## Later

Passkeys and two-step sign-in; phone layout; more of X than watches; Calendar, Mail and Budget modules.

## Open decisions

See "Open decisions" in `.claude/CLAUDE.md`.
