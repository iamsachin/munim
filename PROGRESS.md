# Progress

Status of the build order in `.claude/CLAUDE.md`. Updated in the same commit as the work it describes. "Approved" means the owner has seen it running and said yes.

Last updated: 2026-11-14

## Now

Milestone 1 not started. Next: scaffold the workspace and the `pnpm check` gate.

## 0. Preparation

- [x] Brainstorm and decisions recorded in `.claude/CLAUDE.md`
- [x] `port-design` and `design-gap` skills
- [x] Design handoff copied to `design/handoff/`
- [x] Licence (AGPL-3.0), git repository

## 1. Design system

- [ ] Workspace scaffold (pnpm, `apps/web`, strict TypeScript, ESLint, Prettier)
- [ ] `pnpm check` runs types, lint, Vitest, Playwright visual regression, axe
- [ ] Tokens in the Tailwind `@theme` block: colours, type sizes, radii, density
- [ ] Fonts (IBM Plex Sans, IBM Plex Mono)
- [ ] Shared components on a gallery page: AI badge, AI card, section label, ghost button, primary button, filter chip, On/Off toggle, nav row, table header, table row, source code tag, text input, status dot, highlight mark, citation row, media thumb, section card
- [ ] Accent and density switching
- [ ] Themed focus ring and keyboard operation for every component
- [ ] Light theme (design gap)
- [ ] Visual baselines recorded
- [ ] **Approved by owner**

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
