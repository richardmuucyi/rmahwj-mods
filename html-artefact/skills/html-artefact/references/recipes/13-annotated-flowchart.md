# 13 — Annotated flowchart

**Category:** Illustrations & Diagrams
**Reference HTML:** `references/thariq-examples/13-flowchart-diagram.html`
**JS:** Moderate — node click handler + detail-panel re-template

## Intent

A real flowchart of a process (here: a deploy pipeline) rendered as inline SVG. Click any node and a detail panel reveals what runs at that step, the timing, the failure paths, the code excerpt. Replaces a wall of bullet-point documentation with something a reviewer actually explores.

## Example prompt

> Draw the deploy pipeline (`git push` → CI → tests → image build → deploy → smoke) as a real flowchart. Make every node clickable — when I click, show me what runs at that step, how long it takes, and what happens on failure.

## Standard sections (in order)

1. Eyebrow + H1 ("What happens when you `git push`")
2. **Main canvas** — single large inline `<svg class="flow">` with `.node` rectangles, diamond decision shapes (`<path>`), labelled arrows
3. **Detail panel** (right side or below the canvas) — updates on click. Shows: title, mono meta line (e.g. `~6 min · 3 shards`), prose body, code excerpt, "on failure" sub-panel
4. **Caption strip** — `.chip` legend (success path / failure path colours)

## Interactive elements

- **Click any `.node`** → JS reads its `id`, looks up the `DETAIL` object, re-templates the panel innerHTML. One node selected at any time (clay stroke + thickened outline)
- **Hover any `.node`** → cursor changes to pointer, subtle highlight

## JS patterns to copy

```js
const DETAIL = {
  push:  { title: 'git push', meta: '~5 sec', body: '…', code: '…', onFail: '…' },
  ci:    { title: 'CI lint', meta: '~30 sec', body: '…', code: '…', onFail: '…' },
  // ... one entry per node
};

document.querySelectorAll('.flow .node').forEach(n => {
  n.addEventListener('click', () => {
    document.querySelectorAll('.flow .node').forEach(x => x.classList.remove('selected'));
    n.classList.add('selected');
    render(DETAIL[n.id]);
  });
});

function render(d) {
  panel.innerHTML = `<h2>${esc(d.title)}</h2>
    <div class="meta">${esc(d.meta)}</div>
    <p>${esc(d.body)}</p>
    <pre><code>${esc(d.code)}</code></pre>
    <div class="on-fail">${esc(d.onFail)}</div>`;
}
```

Object literal as the database. No state framework, no router.

## Distinctive styling

- **Hand-laid SVG nodes** — `<rect>` + `<text>` for rectangles, `<path>` polygon for diamond decisions
- **Selected node** gets `var(--clay)` stroke + thickened outline; unselected stay neutral
- **Detail panel** has the same kraft-paper frame as `.prompt-box` elsewhere — visual consistency

## Anti-patterns

- **Don't auto-layout via Mermaid or Graphviz.** Hand-place the SVG so the happy-path / failure-path visual hierarchy is deliberate.
- **Don't put node details inline.** The click-to-reveal pattern is what makes the diagram itself scannable.
- **Don't show all branches with equal weight.** Happy path gets `var(--olive)`-tinted arrows; failure paths get `var(--clay)` and dashed strokes.

## Variations

- **For a one-shot diagram with no per-node detail** (just illustration), see recipe `10-svg-figure-sheet.md`
- **For a module/callstack walkthrough** (linear, not branching), see recipe `04-module-map.md`
