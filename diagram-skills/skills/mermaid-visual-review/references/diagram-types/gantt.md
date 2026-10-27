# Gantt diagram-specific failure modes

This file supplements `references/common-issues.md` for mermaid `gantt` diagrams.

## Type-specific issues

### Axis dates overprint

d3 picks the ticks from the chart width and adds the first day of each month beside the regular ticks, and the default `%Y-%m-%d` format is ten characters wide. On a month boundary two dates print on top of each other.

**Detection:** two axis dates overlap, usually at a month boundary ("2023-01-31" over "2023-02-01").
**Fix:** `gantt-ticks-and-width` (`tickInterval` and `axisFormat`).

### A short schedule renders as a thin strip

The chart takes the page width whatever the task count. Four tasks rendered 1,784 × 264 px (6.8:1).

**Detection:** aspect ratio beyond about 4:1 on a schedule with few tasks.
**Fix:** `gantt-ticks-and-width` (`useWidth`, `barHeight`, `barGap`).

### Grid lines black in every theme

d3 strokes the grid lines with `stroke="currentColor"`, which beats mermaid's own `.grid .tick{stroke:lightgrey}`, so the lines are black: heavy on a light ground, lost on a dark one.

**Detection:** solid black vertical lines across the chart.
**Fix:** theme-level. The zinc themes repaint `.grid .tick line` in their themeCSS; a new theme needs the same rule (`scripts/tests/test_theme_contrast.py`, `hardcoded_failures`).
