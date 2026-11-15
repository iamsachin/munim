---
name: port-design
description: Recreate a screen or component from the Munim design handoff (design/handoff/Atrium.dc.html) in the real React + Tailwind v4 app, pixel-perfectly. Use whenever building or changing any UI that exists in the handoff - tokens, shared components, or any of the 11 screens and the media preview.
---

# Porting from the handoff

The handoff is a prototype in a custom template format. Match what it draws, not how it is written.

## Reading the file

- `<sc-if value="{{ isX }}">` is a conditional block; one per screen, labelled with `data-screen-label`.
- `<sc-for list="{{ rows }}" as="r">` is a loop.
- `{{ name }}` values come from `renderVals()` in the script at the bottom. Dynamic styles such as `background: {{ it.bg }}` are states: find where `renderVals()` sets them to learn the selected, unread, disabled and on/off variants.
- `style-hover` and `style-focus` attributes are the hover and focus states.
- The upper-case arrays in the script (`ITEMS`, `SAVED`, `FEEDS`, `HIGHLIGHTS`, `LATER`, `WATCHES`, `MATCHES`, `DIGEST`) are the mock data. Reuse them as typed fixtures.

Read the whole block for the thing you are porting, plus its entries in `renderVals()`, before writing anything.

## Tokens

Defined once in the Tailwind `@theme` block. Components use only these.

| Token | Dark value | Use |
| --- | --- | --- |
| bg | `oklch(0.16 0.008 255)` | page ground, text on accent |
| panel | `oklch(0.185 0.008 255)` | sidebar, top bar, cards, detail pane |
| card | `oklch(0.225 0.008 255)` | hover and selected rows, inputs, bubbles |
| line | `oklch(0.285 0.008 255)` | borders; row rules use it at 55% |
| ink | `oklch(0.93 0.008 255)` | text; X source colour |
| mute | `oklch(0.71 0.008 255)` | secondary text, labels |
| accent | `oklch(0.82 0.13 75)` default | owner-settable; Reddit source colour |
| a2 | `oklch(0.78 0.09 240)` | RSS, Hacker News |
| a3 | `oklch(0.76 0.1 20)` | Instagram, destructive, disconnected |
| a4 | `oklch(0.78 0.1 305)` | YouTube |
| ok | `oklch(0.8 0.1 155)` | connected, healthy |
| scrim | `oklch(0.1 0.008 255 / 0.82)` | media preview backdrop |
| dim | `oklch(0.54 0.008 255)` | not in the handoff: faint interface marks that must still reach 3:1, such as the unsaved save-dot ring (owner's decision) |

The approved light theme overrides these in `styles.css`: bg 0.975, panel 0.955, card 0.925, line 0.87, dim 0.6, mute 0.46, ink 0.2, and the accent and source colours at lightness 0.45.

Accents: Amber `oklch(0.82 0.13 75)`, Blue `oklch(0.76 0.12 250)`, Green `oklch(0.82 0.13 155)`, Coral `oklch(0.76 0.13 25)`, Gray `oklch(0.9 0.008 255)`.

Not in the handoff, approved by the owner (2026-11-15): a word a search matched is marked with `found`, a2 at 28%, in ink whatever the text around it; the match the owner has stepped to is outlined in a2. A tick for each match sits in the thread pane's right margin (`found-tick`), and a "Match 1 of 7" row with ↑ and ↓ steps through them.

Not in the handoff, approved by the owner (2026-11-15): something that deletes asks first, in a centred dialog (`Modal`, a panel up to 420 wide): a title that names the thing, one muted paragraph saying exactly what is lost and what is kept, then Cancel (focused) and the destructive ghost button (`danger`). The RSS screen's "Remove feed" sits in a row above the feed's articles, beside their count.

Not in the handoff, approved by the owner (2026-11-15), for YouTube:

- A video is a still in a 16:9 frame with a "▶ Play" pill on the scrim (`Player`). Pressing it loads the source's own player in place. The preview modal uses the same component.
- A row's media box shows the item's own still; the striped box with its kind is the fallback.
- The YouTube page is cards by default (still with the length in its corner, title in up to two lines, channel and age, save dot), with a Cards/List pair of chips in the header on that page only. Choosing a card opens the preview modal, playing.
- A source that needs setting up gets a panel under the Connections table: a section label, one muted paragraph, the address to copy in mono, then the fields and Save in one row.

Tints are `color-mix(in oklch, ...)`, never new colours: AI card fill is accent 9% in card, AI card border accent 45%, ask bar fill accent 10% in bg with a 3px ring of accent 16%, highlight mark accent 22%.

Type: IBM Plex Sans 400/500/600, IBM Plex Mono 400/500. Base 13.5px, line-height 1.45. Sizes in use: 9, 10, 10.5, 11, 11.5, 12, 12.5, 13, 13.5, 14, 14.5, 15, 15.5, 17, 22. These fractional sizes are intentional; define each as a theme token and never round them. Mono is for source codes, counts, ages, metadata and upper-case section labels (10.5px, letter-spacing 0.08em).

Radii: 2 (highlight), 4 (badge, thumb), 5 (buttons, inputs, rows), 6 (cards), 8 (ask bar, preview), 99 (chips, toggles, dots).

Density: `--dn` is 1 (Compact), 1.7 (Comfortable, default) or 2.4 (Roomy). Row padding is `calc(Npx * var(--dn))` with N of 3, 4, 5 or 6 as written in the prototype. Density changes spacing only, never type size.

## In code

- Tokens: `apps/web/src/styles.css`, in the `@theme` block. The light theme is an override block below it.
- Spacing unit is 1px, so prototype pixels map directly: `padding: 14px` is `p-14`, `gap: 6px` is `gap-6`, `width: 200px` is `w-200`.
- Type sizes are named, not numbered: micro 9, dot 10, label 10.5, code 11, meta 11.5, sm 12, note 12.5, btn 13, base 13.5, input 14, prose 14.5, read 15, brand 15.5, title 17, headline 22. Use `text-meta`, never `text-[11.5px]`.
- Line heights: body is 1.45 and inherits. `leading-ui` (normal) is for controls the prototype styles with the `font:` shorthand; `leading-prose` 1.6, `leading-read` 1.65, `leading-title` 1.3, `leading-headline` 1.25.
- Density padding: `py-dn-5` is `calc(5px * var(--dn))`.
- Derived colours are tokens too: `rule` (row borders), `ai-fill`, `ai-line`, `ask-fill`, `ask-ring`, `mark`.
- `accent` is the only accent token. The owner's choice is stored raw in `--accent`; the light theme derives a darker `accent` from it. Text on an accent fill is `text-bg`.
- Runtime theme: `applyTheme()` in `apps/web/src/theme.ts` sets `data-theme`, `--accent` and `--dn` on the root element.
- Shared components: `apps/web/src/ui/`. The gallery at `apps/web/src/gallery/Gallery.tsx` shows every one; add each new shared component to it.
- Tables are CSS grid with ARIA table roles (`Table`, `TableHeader`, `Th`, `TableRow`, `Cell`). A row's main action is a `RowButton`, whose hit area covers the row; other controls in the row need `relative z-1`.
- Arbitrary values are allowed only where no token can exist: grid templates, and layout in viewport units or `ch` (`max-h-[70vh]`, `max-w-[62ch]`). Never for a colour, font size, radius or pixel spacing; use a named utility when one exists (`max-w-4/5`, not `max-w-[80%]`).
- Navigation is a link, not a button. For a link that looks like a button use `buttonClass()` from `ui/Button.tsx` on a router `Link`.
- Screens live in their module folder (`reader/`, `account/`), start with `ScreenHeader`, and are routed in `App.tsx`. Mock state and its selectors are in `reader/store.tsx`; fixtures are generated from the handoff into `reader/fixtures.ts`.
- Every screen gets an entry in `SCREENS` in `apps/web/e2e/screens.spec.ts` (five baselines and two axe scans) and a behaviour test for anything it lets the owner do.

## Keyboard

Single-key shortcuts are registered with `useKeys` from `shell/keys.ts`, which ignores keys typed in a field, behind a dialog, or with a modifier. Give it the owner's `theme.shortcuts` setting. `g`, `/` and `?` belong to the shell. Any new key must be added to `HELP` in `shell/shortcuts.ts`, and a new view to `GO`, which also feeds the command palette.

## Where the port departs from the handoff, on purpose

- Rows are never faded. The handoff drops unavailable or switched-off rows to 55% opacity, which makes their text fail contrast; mute the name instead (planned rows in Connections, an off watch). Only a truly disabled control dims.
- The thread pane always shows an item from the stream on screen: in a source stream, if the selected item is from another source, the source's first item is shown.
- An item that is already in the read-later queue shows as "Queued" and cannot be added twice.
- A control the mock cannot honour is disabled with a `title` giving the reason (RSS "Save" and "Open original").
- Buttons never wrap, and the thread's metadata line truncates, so the 920px minimum width holds together.
- The Saved list and its count follow what is saved in the stream; the handoff's two were independent.
- The light theme's media-preview veil is light, so the caption under the preview stays readable.
- Nothing is summarised automatically (owner's decision). Where the handoff shows an AI summary, the port shows `AskCard`: an ask field and a "Summarize this ..." suggestion.
- The Ask scope "Open thread" is "Open item", since it also covers articles.
- Security and settings drops "Unlock with Touch ID or Face ID" and "Hide previews in notifications" (a web app has neither), lists browsers rather than apps under Devices, and adds idle-lock timing, "Lock now" and "Change passphrase".
- The sidebar's bottom slot, the handoff's encryption status button, is the "Commands" button; it is pinned and the navigation scrolls above it.
- The reply box appears only for sources in which Munim can write (`NO_REPLY` in `reader/marks.ts` lists the ones it cannot, with the line shown instead). RSS items have no replies at all.
- Highlights are made by selecting text in a comment or an article body (`SelectionHighlight`, `highlightable()`), are marked in place by matching the quote's text, and get their notes on the Highlights screen. Text already inside a highlight offers nothing.
- The Stream, Saved, Read later and Today read real items from the server. An item is marked read only when the owner opens it deliberately (a click, `j` or `k`); the row shown by default stays unread, or the Unread filter would read its way down the list.
- No source can be replied to yet, so the reply box is gone and every item says why; it returns with Reddit write-back. The thread pane for a feed article shows the article's text in the RSS screen's reading size (owner's decision, 2026-11-14), has no replies, and does not say "No replies yet."
- The handoff's "2.1 GB" on Saved and the fixed date on Today were sample values; Saved shows no size and Today shows the real date.
- Counts are computed from the data (the sidebar's RSS count is 7, not the handoff's hard-coded 9).

## Shared components

Build each once and reuse; the prototype repeats their inline styles dozens of times. AI badge, AI card, section label, ghost button, primary button, filter chip, On/Off toggle pill, nav row, table header, table row (hover, selected with 2px inset accent bar, unread weight 600), source code tag, text input, status dot, highlight mark, citation row, media thumb, section card. Added with the owner's approval: select (a native dropdown dressed like the small input, for choices too many for chips) suggestion chip (a question the AI will be asked), modal (`ui/Modal.tsx`, every dialog uses it) and kbd (a keyboard key).

## Rules

1. Rename Atrium to Munim.
2. Replace clickable `div`s and `span`s with real `button`, `a`, `input` elements, and lists and tables with the right semantics, without changing how they look.
3. Add what the prototype lacks and the project requires: a themed `:focus-visible` ring using the accent, keyboard operation, accessible names for icon-only controls such as the save dot and media thumb.
4. Do not ship the prototype's security copy; see "Honesty rules" in CLAUDE.md.
5. If the design is ambiguous, or a state is missing (loading, error, empty), stop and use the `design-gap` skill rather than inventing it silently.
6. Do not add a visual element, animation or layout change that is not in the handoff.

## Verify

Run the app, look at the result in a browser beside the handoff source values, in all three densities and at 920px and a wide viewport. Then add or update the Playwright baseline and run the full gates from CLAUDE.md. New baselines are shown to the owner for approval.
