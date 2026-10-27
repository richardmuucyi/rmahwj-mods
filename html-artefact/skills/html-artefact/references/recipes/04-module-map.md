# 04 — Module map

**Category:** Code Review & Understanding
**Reference HTML:** `references/thariq-examples/04-code-understanding.html`
**JS:** Light — `<details>` toggle listener

## Intent

Show how data flows through an unfamiliar codebase: an SVG flow diagram up top with the hot path highlighted, then a numbered callstack walkthrough where each step has a file path + line range, an expandable code snippet, and a paragraph explaining what runs.

## Example prompt

> I'm new to this auth code. Draw me the request path through the codebase as boxes and arrows with the hot path highlighted, then walk me through the callstack step by step — file path, line range, expandable snippet, and what each step actually does.

## Standard sections (in order)

1. Repo line + H1 + `.summary` paragraph framing the trust boundary or invariant
2. **Request path** — `.diagram-panel` with a single hand-laid `<svg>` of boxes + arrows. One box has `.hot` class (clay fill). Arrowheads via `<defs><marker id="arrowHead">`
3. **Callstack walkthrough** — vertical stack of `.step` blocks. Each:
   - Numbered `.badge` (clay circle, white digit) on the left
   - File path + line range in mono (`src/auth/check.ts :22-48`)
   - `<details class="snippet">` containing the code excerpt
   - Annotation paragraph below explaining what this step does

## Interactive elements

- **`<details>` collapse on each snippet** — native HTML, no JS unless something else needs to react

## JS patterns to copy

- **Native `<details>` for collapsibles** (`shared-patterns.md` §3) — author each step as `<details open>` (or closed by default); the disclosure triangle is CSS-styled

## Distinctive styling

- **Hand-laid SVG flow** — `.box`, `.box.hot`, `.arrow` classes; single viewBox; `marker-end` references arrowhead def
- **Numbered step badges** on the left rail, content right — same `.step + .badge` pattern reused in PR writeup (17)
- **File location uses mono** with the `.range` part (`:22-48`) in a dimmer colour to distinguish path from line range

## Anti-patterns

- **Don't auto-layout the flow with Mermaid or Graphviz.** Hand-place the SVG — the "hot path" highlight needs deliberate positioning to be readable.
- **Don't pre-expand every snippet.** Some closed, some open — let the reader drill in where they want.
- **Don't paste raw stack traces.** This is a curated walkthrough; pick the 5-10 frames that matter, skip the noise.

## Variations

- **For a fuller "PR writeup" pattern** (author's view of changes, not orientation to existing code), see recipe `17-pr-writeup.md`.
- **For a diagrammatic flow with click-to-reveal details** (deploy pipeline style), see recipe `13-annotated-flowchart.md`.
