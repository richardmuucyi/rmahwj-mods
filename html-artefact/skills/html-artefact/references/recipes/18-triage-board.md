# 18 — Triage / Kanban board

**Category:** Custom Editing Interfaces
**Reference HTML:** `references/thariq-examples/18-editor-triage-board.html`
**JS:** Moderate — DnD between columns + copy-as-markdown

## Intent

A throwaway Kanban: drag ~30 tickets across Now / Next / Later / Cut columns until the priority feels right, then click "Copy as markdown" to export the final ordering into the planning doc. Throwaway means: no backend, no persistence, no real product. The export button closes the loop.

## Example prompt

> Throwaway triage board for cycle 14. Load these 30 tickets into Now / Next / Later / Cut. Let me drag between columns. When I'm done, button to copy the final ordering out as markdown so I can paste it into the planning doc.

(Thariq's variant: *"I need to reprioritize these 30 Linear tickets. Make me an HTML file with each ticket as a draggable card across Now / Next / Later / Cut columns. Pre-sort them by your best guess. Add a 'copy as markdown' button that exports the final ordering with a one-line rationale per bucket."*)

## Standard sections (in order)

1. **Sticky `.toolbar`** with title + **"Copy as markdown"** primary button (right)
2. **Four `.board` columns** (Now / Next / Later / Cut), each a drop target with column header colour-tagged (`Now` = `--clay`, `Next` = `--olive`, `Later` = neutral, `Cut` = greyed out)
3. **Ticket cards** inside each column — id chip (mono), title, optional tag chip, estimate, owner avatar
4. (Optional) **Status footer** showing counts per column

## Interactive elements

- **Native HTML5 drag-and-drop between columns**
- **`.dragging` class** on source card (opacity)
- **`.over` class** on target column (faint tint)
- **"Copy as markdown" button** — serialises the current column state to markdown, copies to clipboard, flashes "Copied ✓"

## JS patterns to copy

- **HTML5 DnD with one shared `dragging` ref** (`shared-patterns.md` §4) — extend to detect target column, not just position
- **Clipboard with flash() success state** (`shared-patterns.md` §2) — wrap `navigator.clipboard.writeText` with `execCommand` fallback
- **DOM-as-render-target, state in JS array** — `state = { now: [...], next: [...], later: [...], cut: [...] }`. Drag-end mutates the array, then `render()` re-templates all four columns. NEVER read state out of the DOM.

```js
const state = { now: [...], next: [...], later: [...], cut: [...] };

function render() {
  for (const col of ['now', 'next', 'later', 'cut']) {
    document.querySelector(`#${col} .cards`).innerHTML =
      state[col].map(makeCard).join('');
  }
  wireDnD();
}

function buildMarkdown() {
  let md = `# Cycle 14 — triage (${new Date().toISOString().slice(0,10)})\n\n`;
  for (const col of ['now', 'next', 'later', 'cut']) {
    md += `## ${labelFor(col)}\n`;
    for (const t of state[col]) md += `- [${t.id}] ${t.title}\n`;
    md += `\n`;
  }
  return md;
}
```

## Distinctive styling

- **Each column** is a CSS grid cell with its own header colour-tag — gives the four-state hierarchy at a glance
- **Cards have minimal chrome** — one mono id chip + title + meta strip. Don't overdesign the card.
- **During drag** the source card lifts (opacity + shadow), the target column tints (faint `--gray-150` background)

## Anti-patterns

- **Don't store state in the DOM.** Hold a JS array; re-render on change.
- **Don't try to make this "real."** No backend, no save button. The copy-as-markdown closes the loop.
- **Don't add filtering / sorting.** This is a fast-pass triage tool; complexity defeats the throwaway premise.
- **Don't expose more than 4 columns.** Now / Next / Later / Cut is the sweet spot.

## Variations

- **For non-Kanban editing** (form-based, not drag-based), see recipe `19-feature-flag-editor.md`
- **For a text-editor with copy-out** (prompt tuner pattern), see recipe `20-prompt-tuner.md`
