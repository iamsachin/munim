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
| Stack | TypeScript everywhere. React + Vite front end, Node server, Postgres. |
| Styling | Tailwind v4. Design tokens live in one `@theme` block; no raw colour, font or size values in components. |
| Themes | Dark as designed, plus a light theme (a design gap). Five accents, three densities, as designed. |
| Input | Keyboard-first: j/k row navigation, single-key actions, command palette, on top of standard accessibility. |
| Scope | Hub. Code is organised by module from day one; the reader is the first module. Calendar, Mail and Budget stay as the disabled placeholders in the design until each is designed. |
| Sources | RSS, Hacker News and YouTube first. Reddit next through its official OAuth API. X and Instagram are shown as "Not available yet". Official APIs only: no scraping, no bridges. |
| Writing back | Replies, comments and votes only where the source's official API allows it (Reddit first). Elsewhere the control is disabled with a one-line reason and a link to the original. |
| Saving | Full text, whole comment thread, video transcript and chapters, image thumbnails. Never download video files. |
| AI | OpenAI and Anthropic, each with an owner-supplied key set in the UI. Each AI feature (summary, digest, Ask, and any new one) has its own provider and model setting. Settings show usage per provider, model and feature. |
| Encryption | Source tokens and AI keys are encrypted by the app with a master key. Content is plain in Postgres so search and Ask work. Disk encryption is the self-hoster's job. |
| Sign-in | One passphrase, server-side sessions. The device list is the session list, with working Revoke and idle lock. Passkeys and two-step come later. |
| Distribution | Docker Compose: app container plus Postgres. `docker compose up` is the whole install. |
| Licence | AGPL-3.0. |

Chosen by Claude, not yet confirmed by the owner (change freely if told otherwise): pnpm workspace with `apps/web` (exists), `apps/server` and `packages/shared` (created when first needed); Hono for the server; Drizzle with checked-in SQL migrations; Zod at every trust boundary; Vitest; Playwright.

Version pins with a reason: TypeScript stays on 6.0 until typescript-eslint supports 7. ESLint is 10 with a peer allowance for eslint-plugin-jsx-a11y in `pnpm-workspace.yaml`.

## Honesty rules

- The security copy in the prototype is false for this architecture ("End-to-end encrypted", "Keys stay on your devices", "Encrypted · keys on device", "the server cannot read your saved items"). Never ship it. The screen must describe what the app actually does; rewriting it is a design gap.
- No control may look functional when it is not. Unbuilt features are disabled and say why.
- AI output is always marked with the AI badge and, where it makes claims, cites the items it drew on.

## Design gaps (need a design before code)

AI settings (keys, per-feature model, usage); first-run setup and sign-in; lock screen; loading, error and empty states for every screen; light theme; honest security screen; command palette and shortcut help; disabled-reply state.

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
- Vitest: unit tests for logic, parsers and the data layer; integration tests for source connectors and server routes.
- Playwright visual regression against approved baselines for every component and screen touched. A changed baseline needs the owner's approval, never a silent update.
- Accessibility: real buttons, links and inputs; full keyboard operation; visible themed focus; axe checks pass; contrast holds in both themes and every accent.

`pnpm check` runs all of the above. Report failures with their output; never describe unverified work as done.

## Commands

- `pnpm dev`: the web app at http://localhost:5173. Until the app shell exists this is the design-system gallery.
- `pnpm check`: types, lint, format, unit tests, then a production build with Playwright visual regression and axe.
- `pnpm format`: apply Prettier.
- `pnpm --filter web exec playwright test --update-snapshots`: re-record baselines. Only for a change the owner has approved; look at every changed image first.

Baselines are recorded on macOS Chromium and are platform-specific; other platforms need their own.

## Git

- Work on a feature branch. Commit each finished piece yourself once the gates pass. Small conventional commits.
- Never merge to `main` or push unless asked.

## Engineering rules

- Solve the whole task with the least new code. No abstraction, option or dependency that nothing needs yet. In particular: no plugin framework for modules until a second module exists; a module is a folder with its routes, screens and data.
- Never hard-code model names or lists. Read them from the provider's models endpoint. Consult the `claude-api` skill before writing any Anthropic code.
- Secrets never reach the browser, logs, error messages or test fixtures.
- Every migration must be safe to run on a stranger's existing data.
- Validate at trust boundaries: HTTP input, source API responses, feed XML, AI output that drives UI.
- Respect each source's rate limits and terms. Cache and poll conservatively.

## Open decisions (ask before building the part that depends on them)

- Retrieval for Ask: Postgres full-text only, or embeddings as well (Anthropic has no embeddings API, so this would need OpenAI or a local model).
- Where the master encryption key comes from: environment variable, or derived from the passphrase at unlock.
- YouTube: API key for public channels, or OAuth for the owner's subscriptions.
- Digest schedule and whether digests run without the app open.
