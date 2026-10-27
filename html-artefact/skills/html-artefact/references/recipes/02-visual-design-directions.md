# 02 — Visual design directions

**Category:** Exploration & Planning
**Reference HTML:** `references/thariq-examples/02-exploration-visual-designs.html`
**JS:** Light — one event listener flips a `data-bg` attribute

## Intent

N live mini-renders of one component (e.g. an empty-state, a card, a hero) laid out as a grid so the reader can react to actual visuals rather than imagine them. A sticky toolbar lets them flip light/dark surface to see how each design holds up.

## Example prompt

> Explore four visual directions for our empty-state component. Render each live so we can compare tone, density, and how well they hold up on light and dark surfaces.

## Standard sections (in order)

1. **Sticky `.toolbar`** at top — project title (left) + light/dark `.seg` segmented control (right)
2. Eyebrow + H1 + `.prompt-box`
3. **2×2 (or 2×3) `.board` grid** of `<article class="artboard">` cells. Each cell:
   - Tag label ("A — Minimal", "B — Illustrative", ...)
   - `.stage` — self-contained mini-canvas containing the live design (real HTML/CSS, not an image)
   - `.rationale` — one paragraph on what trade-off this design is making

## Interactive elements

- **Light/dark surface toggle** via segmented radio inputs. Hidden radios + `:has(input:checked)` selector styles the active pill. One JS line flips `data-bg="light|dark"` on `<body>`; CSS does the rest.

## JS patterns to copy

- **CSS-variable-as-state-channel** (`shared-patterns.md` §1) — toolbar toggle updates one attribute, CSS rules cascade. ~10 lines of JS total.

## Distinctive styling

- **Each `.stage` is a scoped mini-canvas** — designs use scoped class names (`.es-a`, `.es-b`) so styles don't bleed between cells
- **Sticky toolbar** with kraft-paper background, persists during scroll
- **Segmented control** built with hidden radios + `:has()` — no JS to update the active visual

## Anti-patterns

- **Don't make every cell structurally identical.** The whole point is that design B uses an SVG illustration where A uses none. Let each cell author itself.
- **Don't show static images.** Live HTML/CSS lets the user inspect the spacing, hover the buttons, see the actual fonts.

## Variations

- **N = 3-6** is the sweet spot. More than 6 and the grid stops being scannable on a laptop.
- **For code (not design) options**, see recipe `01-side-by-side-code-approaches.md`.
- **For tunable variants of one design** (slider for padding, etc.), see recipe `06-component-variant-matrix.md`.
