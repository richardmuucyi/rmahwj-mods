# 15 — Concept explainer with a live figure

**Category:** Research & Learning
**Reference HTML:** `references/thariq-examples/15-research-concept-explainer.html`
**JS:** Heavy — hash + render pipeline for the interactive figure

## Intent

Teach an abstract concept (here: consistent hashing) with a live interactive figure as the centrepiece. The reader can add/remove nodes, watch keys reassign in real time, hover for labels — then a comparison table, then a "where you'll meet it" closer. The interaction is the explanation.

## Example prompt

> Teach me consistent hashing. Draw the ring, plot a few nodes and keys, and let me add or remove a node and see which keys move. Compare it to mod-N hashing in a table. Tell me where I'll actually run into it.

## Standard sections (in order)

1. Eyebrow + H1 ("Consistent hashing, in one ring")
2. Intro paragraph — the motivation problem in plain language
3. **"The trick"** — section H2 with the core insight, then the live figure:
   - Large inline `<svg class="ring">` — nodes around the circumference, keys plotted, arcs showing ownership
   - `.controls` row with `"add a node"` / `"remove a node"` / `"reset"` buttons
   - Hover any element for a floating label
4. **Versus mod N** — comparison table (what breaks when you add a node)
5. **Where you'll meet it** — closing prose (DynamoDB partitioning, Cassandra, CDN edge routing)

## Interactive elements

- **Add / remove / reset buttons** — re-render the SVG with transition
- **Hover** on a key or node — show a floating label with its hash + owner
- **Optional: drag a key around the ring** to see which node owns it

## JS patterns to copy

A small hash + render pipeline. Reference function names from the demo:

```js
function h(str) { /* simple deterministic hash → angle on the ring */ }
function pt(angle, r) { return { x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) }; }
function ownerOf(keyAngle, nodes) { /* walk the ring clockwise */ }
function arcPath(startAngle, endAngle, r) { /* SVG path d= string */ }
function buildNodes(count) { /* deterministic placement */ }
function buildKeys(count)  { /* deterministic placement */ }
function render() { /* re-template the SVG */ }
function diffAndRender() { /* animate between states */ }
```

~100 lines, no library. SVG transitions on `cx` / `cy` / `d` attributes provide the motion.

## Distinctive styling

- **All-SVG ring** drawn with `arcPath()` for ownership slices — keys are dots on the circumference, nodes are larger labelled dots
- **Mouse-enter** shows a small floating label positioned in JS
- **Colour-coded ownership arcs** — one colour per node from the kraft palette (rotate through `--clay`, `--olive`, `--oat`, etc.)

## Anti-patterns

- **Don't reach for D3.** The ring is ~100 lines of vanilla. D3 imports a colour scale you'd then have to override.
- **Don't animate by mutating DOM nodes.** Re-template the SVG and let CSS transitions on `<circle>` / `<path>` attributes handle motion.
- **Don't teach without the figure.** If the figure isn't load-bearing, this is a `14-feature-explainer.md` instead.

## Variations

- **For a single-codebase feature** (no abstract concept), see recipe `14-feature-explainer.md`
- **For a multi-part topic**, make one page per concept and link them — do not grow this page
