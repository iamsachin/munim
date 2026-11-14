---
name: design-gap
description: Design a Munim screen, state or component that has no design in the handoff, then get the owner's approval before building on it. Use for AI settings, first-run setup, sign-in and lock, loading/error/empty states, the light theme, the honest security screen, the command palette, new modules, or any UI the handoff does not show.
---

# Filling a design gap

The owner chose "I design, you approve". Nothing undesigned is built on until they have seen it running and said yes.

## Steps

1. **Confirm it is a gap.** Search `design/handoff/Atrium.dc.html` for the screen, state or component. If it is there, use `port-design` instead.
2. **Ask what you cannot decide.** Behaviour, content and scope questions go to the owner before any drawing. Visual questions do not; propose and show.
3. **Design in the existing language.** Use only the tokens and shared components listed in `port-design`. Find the closest designed screen and follow its structure:
   - settings-like content: the two-column section cards of "Security and settings";
   - lists of things with status and an action: the "Connections" table (the AI screen at `account/AiSettings.tsx` is the worked example of a designed gap);
   - on/off choices: the 52px On/Off pill; one-of-many: filter chips;
   - AI content: the AI badge and AI card, nothing else;
   - anything before the app is open (first run, sign-in, lock): `account/AuthCard.tsx`;
   - an action only the server can perform, while the app runs on sample data: do the checks, then show `SAMPLE_ONLY` from `account/auth.ts`;
   - empty states: one line of muted text, as in "Nothing matches this filter."
   A new component is a last resort and is itself part of what gets approved.
4. **Build it for real, with mock data**, in the app, not as a separate mockup. Include every state: empty, loading, error, disabled, long content, each density.
5. **Show it.** Give the owner the route to open, say what is new compared with the handoff, and list the decisions you made for them. Screenshots only if they ask.
6. **Wait for approval.** Then add Playwright baselines and run the gates in CLAUDE.md. If they ask for changes, repeat from step 3.
7. **Record it.** Remove the item from "Design gaps" in `.claude/CLAUDE.md`. If the approved design introduced a token or shared component, add it to the tables in `port-design`.

## Light theme

Approved. Every new design must be checked in both themes and every accent: body-size text at 4.5:1, interface marks at 3:1. In light, `accent` is the owner's accent at lightness 0.45, so it works as text, border and fill (with `text-bg` on top).

## Copy

Plain, short, sentence case, no exclamation marks, matching the prototype's voice. Say what the app actually does. Where something is not built or not available, say so in one line.
