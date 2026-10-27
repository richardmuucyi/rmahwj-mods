# 16 — Implementation plan

**Category:** Exploration & Planning
**Reference HTML:** `references/thariq-examples/16-implementation-plan.html`
**JS:** None — pure handoff document

## Intent

A complete handoff document for one feature you're about to build (or hand off): milestones on a timeline, data-flow diagram, inline mockups, the key code snippets, a risk-and-mitigations table, and open questions. Designed to be skimmed on a phone and handed to the implementer as-is.

## Example prompt

> Create a thorough implementation plan for adding threaded comments to task cards. Include mockups, the data flow from client to persistence, the key code I'll need to write, and a risk table. Make it easy to skim on a phone — I'm going to pass this to the implementer as-is.

(From Thariq's piece, lightly adapted.)

## Standard sections (in order)

1. Eyebrow + H1 + `.prompt-box`
2. **Milestones** — horizontal `.milestones` rail with numbered `.milestone` circles connected by a line, each with a date
3. **Data flow** — inline-SVG diagram (boxes + arrows) tracing client → API → DB → notifications
4. **Mockups** — `.card-mock` HTML renders of the UI in 2-3 key states (NOT `<img>` — let the implementer copy the structure)
5. **Key code** — `.code-grid` with 2 side-by-side `.code-block`s (client + server) tagged with chips ("client", "server", "migration")
6. **Risks & mitigations** — `.risks` table: severity dot column + risk description + mitigation paragraph
7. **Open questions** — bulleted list. The implementer reads these before starting.

## Interactive elements

None.

## JS patterns to copy

None.

## Distinctive styling

- **Horizontal milestone timeline** — numbered circles in `var(--clay)`, connector line in `var(--gray-300)`, dates in mono below each circle
- **Two-column code grid** — `display: grid; grid-template-columns: 1fr 1fr; gap: 16px;` collapsing to single column under 720px
- **Risk severity uses the suite's tri-colour** — `var(--olive)` low, `#C8A772` medium, `var(--clay)` high

## Anti-patterns

- **Don't put mockups in `<img>` tags.** The implementer copies the HTML directly — show structure.
- **Don't include every line of code.** Pick the 3-5 functions that matter; the rest is implementation detail.
- **Don't bury open questions in the middle.** They go at the bottom where the implementer ends up before starting.

## Variations

- **For a multi-author plan**, add an "Owners" section above Risks listing who owns which milestone.
- **For a phased rollout**, the Milestones rail becomes vertical, with each milestone a stack of sub-tasks.
- **For pre-decision exploration** (multiple plans being compared), see recipe `01-side-by-side-code-approaches.md`.
