# 11 — Weekly status report

**Category:** Reports
**Reference HTML:** `references/thariq-examples/11-status-report.html`
**JS:** None

## Intent

A weekly engineering status update with a small chart, coloured tags, and one-line beats — formatted for a Monday-morning skim instead of a wall of bullet points. The receiver reads it in 30 seconds.

## Example prompt

> Weekly status for Platform Eng — week of Mar 10. Highlights, shipped items, a small velocity chart, carryover with tags showing why each one slipped. Quick to skim on Monday.

## Standard sections (in order)

1. **Header** — project name + week + `.date-range`
2. **Highlights** — TL;DR callout (one paragraph, the punchline)
3. **Shipped** — bulleted list with `.stat-card` mini-tiles (e.g. "3 features", "12 PRs merged")
4. **Velocity** — `.chart-panel` with inline-SVG bar chart (3-4 weeks of bars in `<rect>`)
5. **Carryover** — list with coloured `.carry-tag`s (`risk`, `blocked`, `pushed`) and `.risk-dot`s

## Interactive elements

None.

## JS patterns to copy

None.

## Distinctive styling

- **Inline-SVG bar chart** drawn with three to five `<rect>` elements — no Chart.js
- **Carryover tags use the suite's tri-colour** — `var(--olive)` (back on track), `#C8A772` (worth a look), `var(--clay)` (blocked / urgent)
- **Stat cards** align numbers in serif, labels in mono — same typographic tension as the masthead

## Anti-patterns

- **Don't drop in Chart.js for three bars.** Five `<rect>` elements with class-driven fills cost nothing and stay on-palette.
- **Don't fold "shipped" and "carryover" into one list.** The split is what makes the artefact scannable.
- **Don't write paragraphs.** Bullets, one line each. Reader has 30 seconds.

## Variations

- **For a meeting-format version** of the same content, see recipe `09-slide-deck.md`
- **For a project post-mortem** instead of a weekly cadence, see recipe `12-incident-timeline.md`
