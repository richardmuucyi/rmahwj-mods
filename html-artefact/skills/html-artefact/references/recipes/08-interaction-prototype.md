# 08 — Interaction prototype

**Category:** Prototyping
**Reference HTML:** `references/thariq-examples/08-prototype-interaction.html`
**JS:** Moderate — vanilla HTML5 drag-and-drop with drop indicator

## Intent

A working prototype of one interaction (e.g. drag-to-reorder a sidebar) at enough fidelity that you can *feel* whether it's right before committing to a library or framework. Real drag handles, a drop-indicator line that snaps between items, smooth settle on drop. Throwaway — exists to make one design decision.

## Example prompt

> Throwaway HTML so we can feel the sidebar drag-to-reorder before committing to a library. Real drag handles, a drop-indicator line, a smooth settle when the item lands.

## Standard sections (in order)

1. Eyebrow + H1 + `.sub` framing line ("Testing whether per-row handles feel better than full-row drag")
2. **Sidebar mock** with `.item` rows. Each row: drag handle (CSS dots), label, optional metadata chip
3. **Drop indicator** — `<div id="indicator">` absolutely positioned, follows the cursor between items
4. **"What you're feeling"** prose H2 — describes which design choices are being tested
5. **"Open questions"** prose H2 — outstanding decisions before committing to implementation

## Interactive elements

- **Native HTML5 drag-and-drop** (`draggable="true"` + `dragstart` / `dragover` / `drop` / `dragend`)
- **Drop indicator line** snaps to the half-line between items based on cursor Y position
- **`.dragging` state** on the source row (opacity + slight transform)

## JS patterns to copy

- **HTML5 DnD with one shared `dragging` ref + drop indicator** (`shared-patterns.md` §4) — ~60 lines of vanilla JS, no library

## Distinctive styling

- **Drop indicator is one element** — `<div class="indicator">` toggled `.on` and positioned by `style.top`
- **`.item.dragging`** lifts the row (`opacity: 0.5; transform: scale(0.98);`)
- **No icon font** — drag handle is a 2×3 dot grid in CSS pseudo-elements

## Anti-patterns

- **Don't pull in `react-dnd` or Sortable.js.** Native DnD with `dragover` + `preventDefault` is ~40 lines.
- **Don't try to make this "real."** No backend, no persistence. Throwaway — the test is the feel.
- **Don't use the index card's "four screens" framing.** This pattern is reorder-within-one-screen, not navigation between screens. (For multi-screen flows, write a slide deck — recipe 09 — or a click-through prototype as a custom artefact.)

## Variations

- **DnD between columns** (Kanban) — same primitives, drop handler detects which column. See recipe `18-triage-board.md`.
- **For animation tuning** (not interaction prototyping), see recipe `07-animation-sandbox.md`.
