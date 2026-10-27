# 01 — Side-by-side code approaches

**Category:** Exploration & Planning
**Reference HTML:** `references/thariq-examples/01-exploration-code-approaches.html` (open before authoring)
**JS:** None — pure document

## Intent

Three (or N) ways to solve one problem, rendered side-by-side with code, pros/cons, and metric chips. The reader points at one approach instead of reading three sequential walls of prose. End with an explicit recommendation paragraph so the user knows which way you'd go.

## Example prompt

> Show me three different ways to implement debounced search for the task filter input in our React codebase, with trade-offs for each.

A variant from Thariq's piece for *design* exploration: *"I'm not sure what direction to take the onboarding screen. Generate 6 distinctly different approaches — vary layout, tone, and density — and lay them out as a single HTML file in a grid so I can compare them side by side. Label each with the trade-off it's making."*

## Standard sections (in order)

1. Eyebrow + H1
2. `.prompt-box` quoting the user prompt verbatim
3. Three (or N) `<article class="approach">` blocks, each containing:
   - Numbered `<h2>` — large mono `<span class="num">01</span>` + serif title ("Inline useEffect + setTimeout")
   - Syntax-highlighted code block (`<pre><code>` with hand-classed `<span class="kw|fn|str|dim">`)
   - Two-column Pro/Con table (`.tradeoffs .row .cell.pro / .cell.con`)
   - Stat strip — four `.chip`s for metrics: Bundle impact, Test surface, Reuse, SSR safety
4. "Recommendation" H2 — one short paragraph picking one approach with reasoning

## Interactive elements

None. Pure document. The user reads, points at one, and prompts the next step.

## JS patterns to copy

None.

## Distinctive styling

- **Numbered approach headers** — mono numeral `01 / 02 / 03` in `var(--clay)`, serif title beside it
- **Hand-rolled syntax highlighting** via five `<span>` classes (no Prism). See `shared-patterns.md` §"Hand-rolled syntax highlighting"
- **Metric chips** arranged as a flex strip under each approach — mono font, `var(--gray-150)` background, one chip turns `var(--olive)` for the winning metric

## Anti-patterns

- **Don't pull in highlight.js.** Five span classes give you on-palette colours for free.
- **Don't omit the recommendation.** A three-way comparison without a verdict puts the cognitive load on the reader. Pick one and say why.

## Variations

- **N = 4-6** is the upper end. More than 6 and the artefact stops being scannable.
- **For design exploration** (visual mocks instead of code), see recipe `02-visual-design-directions.md` — same skeleton, different inner content.
- **For full implementation handoff** (one approach picked, fully fleshed out), see recipe `16-implementation-plan.md`.
