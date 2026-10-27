# 19 — Feature flag editor

**Category:** Custom Editing Interfaces
**Reference HTML:** `references/thariq-examples/19-editor-feature-flags.html`
**JS:** Heavy — diff computation + dependency warnings + dual copy buttons

## Intent

Toggle production flags grouped by area, see dependency warnings when a prerequisite is off, then copy out just the changed keys (a "diff") or the full JSON for the PR. The diff preview lives at the bottom so the consequences of each toggle are visible immediately.

## Example prompt

> Editor for `flags.production.json`. Group flags by area, real toggle switches, show me a warning when I flip one whose prerequisite is off. Two copy buttons at the top: "Copy diff" (just changed keys) and "Copy full JSON".

(Thariq's variant: *"Here's our feature flag config. Build a form-based editor for it, group flags by area, show dependencies between them, warn me if I enable a flag whose prerequisite is off. Add a 'copy diff' button that gives me just the changed keys."*)

## Standard sections (in order)

1. **Sticky `.toolbar`** with: file title (mono), **"Copy diff"** (disabled until dirty), **"Copy full JSON"**, **"Reset to initial"**
2. **`.sidebar` left rail** listing the areas (auth / billing / experiments / …) — anchor links to scroll the right pane
3. **Main panel** — stacked flag rows. Each row:
   - `.flag-key` (mono) + `.flag-desc` (sans, muted)
   - **Rollout badge** (mono, percent — colour-coded by ramp)
   - **Toggle switch** on the right (pure CSS, no library)
   - `.req-chip` warning if a prerequisite flag is off
4. **`.diff` live preview** at the bottom — JSON delta updates on every change

## Interactive elements

- **Custom toggle switches** (styled `<input type="checkbox">`)
- **Reset button** — restores `INITIAL` snapshot
- **Copy diff / copy full JSON** buttons with flash success
- **Dependency warnings** appear/disappear reactively as toggles change
- **Live `.diff` panel** updates on every change

## JS patterns to copy

State pattern — frozen INITIAL + mutable state + diff function:

```js
const INITIAL = Object.freeze({ auth_v2: true, billing_promo: false, ... });
let state = { ...INITIAL };

function computeDiff() {
  const added = {}, removed = {}, changed = {};
  for (const k of Object.keys(state)) {
    if (state[k] !== INITIAL[k]) changed[k] = { from: INITIAL[k], to: state[k] };
  }
  return { changed };
}

function diffText() { /* format as JSON diff string */ }
function fullJson() { return JSON.stringify(state, null, 2); }
function update(key, value) {
  state[key] = value;
  refreshDeps();
  refreshDiff();
  updateButtons();
}
```

Plus:
- **Clipboard with execCommand fallback + flash()** (`shared-patterns.md` §2)
- **Wrapped `navigator.clipboard.writeText`** — call it `writeClipboard(text)` and use everywhere

## Distinctive styling

- **Toggle switches are pure CSS** — rounded rect background + `::before` pseudo-element circle, `transform: translateX(...)` on `:checked`
- **Rollout badge colour-codes the percentage** — 0% grey, 50% olive, 100% clay
- **`.diff` block** uses red/green-tinted backgrounds for `−`/`+` lines, mono font — same diff styling as recipe 03 but tighter

## Anti-patterns

- **Don't make the diff a separate "view this in another tab" thing.** Live at the bottom — the user must see consequences as they toggle.
- **Don't store state in the DOM.** Same rule as recipe 18 — JS object, re-render.
- **Don't add a save button.** Throwaway editor; the copy buttons are the export.

## Variations

- **For a Kanban-style ordering** (not boolean toggles), see recipe `18-triage-board.md`
- **For a text-template tuner**, see recipe `20-prompt-tuner.md`
- **For an editor with constraints + validation** beyond simple dependency warnings, extend this pattern with a `validate(state)` function returning an array of violations
