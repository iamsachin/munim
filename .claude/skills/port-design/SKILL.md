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

Accents: Amber `oklch(0.82 0.13 75)`, Blue `oklch(0.76 0.12 250)`, Green `oklch(0.82 0.13 155)`, Coral `oklch(0.76 0.13 25)`, Gray `oklch(0.9 0.008 255)`.

Tints are `color-mix(in oklch, ...)`, never new colours: AI card fill is accent 9% in card, AI card border accent 45%, ask bar fill accent 10% in bg with a 3px ring of accent 16%, highlight mark accent 22%.

Type: IBM Plex Sans 400/500/600, IBM Plex Mono 400/500. Base 13.5px, line-height 1.45. Sizes in use: 9, 10, 10.5, 11, 11.5, 12, 12.5, 13, 13.5, 14, 14.5, 15, 15.5, 17, 22. These fractional sizes are intentional; define each as a theme token and never round them. Mono is for source codes, counts, ages, metadata and upper-case section labels (10.5px, letter-spacing 0.08em).

Radii: 2 (highlight), 4 (badge, thumb), 5 (buttons, inputs, rows), 6 (cards), 8 (ask bar, preview), 99 (chips, toggles, dots).

Density: `--dn` is 1 (Compact), 1.7 (Comfortable, default) or 2.4 (Roomy). Row padding is `calc(Npx * var(--dn))` with N of 3, 4, 5 or 6 as written in the prototype. Density changes spacing only, never type size.

## Shared components

Build each once and reuse; the prototype repeats their inline styles dozens of times. AI badge, AI card, section label, ghost button, primary button, filter chip, On/Off toggle pill, nav row, table header, table row (hover, selected with 2px inset accent bar, unread weight 600), source code tag, text input, status dot, highlight mark, citation row, media thumb, section card.

## Rules

1. Rename Atrium to Munim.
2. Replace clickable `div`s and `span`s with real `button`, `a`, `input` elements, and lists and tables with the right semantics, without changing how they look.
3. Add what the prototype lacks and the project requires: a themed `:focus-visible` ring using the accent, keyboard operation, accessible names for icon-only controls such as the save dot and media thumb.
4. Do not ship the prototype's security copy; see "Honesty rules" in CLAUDE.md.
5. If the design is ambiguous, or a state is missing (loading, error, empty), stop and use the `design-gap` skill rather than inventing it silently.
6. Do not add a visual element, animation or layout change that is not in the handoff.

## Verify

Run the app, look at the result in a browser beside the handoff source values, in all three densities and at 920px and a wide viewport. Then add or update the Playwright baseline and run the full gates from CLAUDE.md. New baselines are shown to the owner for approval.
