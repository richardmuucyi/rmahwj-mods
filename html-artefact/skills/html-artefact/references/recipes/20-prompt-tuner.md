# 20 — Prompt tuner

**Category:** Custom Editing Interfaces
**Reference HTML:** `references/thariq-examples/20-editor-prompt-tuner.html`
**JS:** Heavy — contenteditable with caret-preserving re-highlight + live template substitution

## Intent

A side-by-side editor for tuning a templated prompt: editable template on the left with `{{variable}}` slots highlighted, three sample inputs on the right showing the filled template live as you type. When the template reads well across all three samples, copy it out.

## Example prompt

> Editor for tuning a support-reply prompt. Big editable textarea on the left where I write the template, with `{{variable}}` slots syntax-highlighted. On the right, three sample tickets (angry / confused / happy) showing the filled prompt live as I type. Copy-prompt button at the top. Char counter.

(Thariq's variant: *"I'm tuning this system prompt. Make a side-by-side editor: editable prompt on the left with the variable slots highlighted, three sample inputs on the right that re-render the filled template live. Add a character/token counter and a copy button."*)

## Standard sections (in order)

1. **Sticky `.toolbar`** — title + char/token counter (mono) + **"Copy prompt"** primary button
2. **Two-column layout**:
   - **Left** — `contenteditable` editor with variable-slot highlighting + `.ed-toolbar` (insert variable, reset to default)
   - **Right** — three stacked `.preview-panel`s, one per sample input. Filled template renders live
3. **`.legend-chips`** at top of preview side — shows the variables ({{name}}, {{issue}}) and their sample values per panel
4. (Optional) collapsed sample-input data below the fold

## Interactive elements

- **`contenteditable` editor** with caret-preserving re-highlighting on every `input` / `paste`
- **Variable slot pills** — `{{name}}` matches get a clay pill background + mono font
- **Live preview** — three panels re-template on every keystroke
- **Copy-prompt button** with flash success
- (Optional) **Keyboard shortcut** to insert a variable

## JS patterns to copy

The big-ticket one: **caret-preserving contenteditable re-highlight** (`shared-patterns.md` §6). Function names from the demo:

```js
function escapeHtml(s)           { /* &, <, >, " */ }
function getPlainText(root)      { /* root.innerText or recurse */ }
function getCaretOffset(root)    { /* count chars to caret */ }
function setCaretOffset(root, n) { /* walk text nodes restoring caret */ }
function highlightHtml(plain)    { /* turn {{var}} into pill spans */ }
function renderEditor()          { /* save caret, replace innerHTML, restore caret */ }
function fillHtml(template, vars){ /* template substitution to HTML */ }
function buildSamples()          { /* render all 3 preview panels */ }
function buildLegend()           { /* render variable chips */ }
function updateCounter()         { /* char count update */ }
function refresh()               { /* renderEditor + buildSamples + buildLegend + updateCounter */ }
```

Plus **clipboard with `execCommand` fallback** (`shared-patterns.md` §2).

The whole script is ~400 lines but follows from these primitives.

## Distinctive styling

- **Variable slots** get a clay pill background + mono font, applied via DOM mutation after each input
- **Preview panels** render with the filled template visible — same typography as the editor but read-only
- **Char counter in mono** at the top — count rises in real time

## Anti-patterns

- **Don't reach for CodeMirror / Monaco.** Contenteditable + caret preservation is ~50 lines for this use case and stays standalone.
- **Don't re-render the editor without preserving the caret.** The user will lose their place mid-word — instant unusable.
- **Don't bind to `keydown`.** Bind to `input` and `paste` — covers typing, paste, IME composition.
- **Don't use a `<textarea>` thinking it'll be simpler.** You can't highlight variable slots inside a `<textarea>` — the whole point is the rich rendering.

## Variations

- **For tuning a config object** (not a string template), see recipe `19-feature-flag-editor.md`
- **For non-prompt text editing** (markdown notepad, etc.) — the contenteditable + caret pattern generalises; replace the variable-slot highlighter with whatever syntax you need to colour
