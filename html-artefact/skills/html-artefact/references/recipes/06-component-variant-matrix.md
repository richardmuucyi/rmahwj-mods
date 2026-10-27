# 06 — Component variant matrix

**Category:** Design & Prototypes
**Reference HTML:** `references/thariq-examples/06-component-variants.html`
**JS:** Moderate — range/radio/checkbox inputs drive CSS variables

## Intent

One component (here: a Card) rendered in every size × state × intent on a single sheet, with a sticky toolbar of live knobs so you can tune padding / border / shadow and watch every variant update in unison. End the user holds the values they want and prompts the next step ("apply padding=12, no border, lift shadow").

## Example prompt

> Build me a variant matrix for our Card component. Show every size × state × intent on one sheet, and put a toolbar at the top with live knobs for padding, border style, and shadow so I can tune the defaults and see all variants react.

## Standard sections (in order)

1. **Sticky `.toolbar`** with: padding `<input type="range">` (with px readout in mono), border-style `<input type="radio">` group, shadow checkbox
2. Eyebrow + H1
3. **Matrix of `.card` variants** — each labelled with `.variant-label` (mono uppercase) and `.variant-note` (one-line description of the state)
4. **`.snippet-panel`** showing the JSX (or your framework's) equivalent — `<Card.Header avatar title="…" />` — so the user can copy out
5. (Optional) hover-state preview row shown via `mouseenter`

## Interactive elements

- **Range slider** (padding) — px readout updates live in mono next to the slider
- **Radio segments** (border style: none / dashed / solid)
- **Checkbox** (shadow on/off)
- **Hover preview** on individual cards (CSS `:hover`)

## JS patterns to copy

- **CSS-variable-as-state-channel** (`shared-patterns.md` §1) — JS sets `--card-pad`, `--card-border`, `--card-shadow` on `document.documentElement.style` and every `.card` updates from the cascade

## Distinctive styling

- **Live tokens via CSS custom properties** — every card reads `padding: var(--card-pad)`, `border: var(--card-border)`, etc.
- **Variant labels in mono uppercase** with letter-spacing — same eyebrow pattern as the masthead
- **JSX snippet block** uses the same hand-rolled `<span class="kw|fn|str">` highlighter as recipe 01

## Anti-patterns

- **Don't manipulate each card's style directly.** Go through CSS variables on `:root` so adding a 30th variant is free.
- **Don't put the knobs at the bottom.** Sticky top toolbar — the user wants to see the effect on every variant as they tune.
- **Don't expose every prop.** Pick the 3-4 that materially change the visual.

## Variations

- **N components, one variant each** → recipe `05-design-system.md`
- **For animation tuning** (timing, easing) instead of static styling, see recipe `07-animation-sandbox.md`
