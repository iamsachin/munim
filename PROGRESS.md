# Progress

Status of the build order in `.claude/CLAUDE.md`. Updated in the same commit as the work it describes. "Approved" means the owner has seen it running and said yes.

Last updated: 2026-11-14

## Now

Milestone 1 is built and all gates pass. Waiting on the owner to review the gallery (`pnpm dev`) and decide:

1. Approve the dark design system as a faithful port of the handoff.
2. Approve or change the proposed light theme (values in `apps/web/src/styles.css`).
3. Unsaved save-dot: the design draws it in the `line` colour, about 1.4:1 against the ground, below the 3:1 needed for interface marks. Keep as designed, or lighten it.

Milestone 2 does not start until 1 is approved.

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
- [x] Light theme proposed (design gap, not yet approved)
- [x] Visual baselines recorded: both themes at every density and every accent (macOS Chromium)
- [ ] **Approved by owner**

Not built yet because only one screen uses each: ask bar, suggestion chip, chat bubble, media preview overlay. They come with their screens in milestone 2.

## 2. Screens on mock data

- [ ] Typed data layer with fixtures from the prototype
- [ ] App shell: sidebar, ask bar, routing
- [ ] Today
- [ ] Stream and thread pane
- [ ] Media preview
- [ ] Read later
- [ ] Saved
- [ ] Highlights
- [ ] RSS
- [ ] Digest
- [ ] Watches
- [ ] Ask
- [ ] Connections
- [ ] Security and settings (honest copy, design gap)
- [ ] AI settings: keys, per-feature model, usage (design gap)
- [ ] First-run setup, sign-in, lock screen (design gap)
- [ ] Loading, error and empty states for every screen (design gap)
- [ ] Keyboard navigation, command palette, shortcut help (design gap)
- [ ] **Approved by owner**

## 3. Server, sign-in, sources

- [ ] Server scaffold, Postgres, migrations, Docker Compose
- [ ] Passphrase sign-in, sessions, device list with Revoke, idle lock
- [ ] Encrypted storage for source tokens and AI keys
- [ ] RSS
- [ ] Hacker News
- [ ] YouTube
- [ ] Reddit (official OAuth)
- [ ] Saving: full text, threads, transcripts, thumbnails
- [ ] Search
- [ ] **Approved by owner**

## 4. AI and write-back

- [ ] OpenAI and Anthropic providers, keys set in the UI
- [ ] Per-feature model selection
- [ ] Usage tracking and display
- [ ] Summaries
- [ ] Digest (daily, weekly)
- [ ] Ask with citations
- [ ] Watches matching
- [ ] Replies where the official API allows (Reddit first)
- [ ] **Approved by owner**

## Later

Passkeys and two-step sign-in; phone layout; X and Instagram; Calendar, Mail and Budget modules.

## Open decisions

See "Open decisions" in `.claude/CLAUDE.md`.
