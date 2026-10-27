# Radar diagram-specific failure modes

This file supplements `references/common-issues.md` for mermaid `radar-beta` diagrams.

## Type-specific issues

### Side axis labels clipped at the canvas edge

mermaid places each axis label at `radius × axisLabelFactor + 4px` from the centre (319px on the default 600px chart) and gives the chart 50px side margins. A label on the left or right axis is anchored at that point and runs outwards, so anything longer than about four characters runs off the canvas. The SVG sets `overflow: visible`, so a browser showing the SVG inline may draw the whole word, while the PNG and any `<img>` embed cut it.

**Detection:** a left or right axis label is missing its first or last letters ("atency" for "Latency", "Ops eff" for "Ops effort").
**Fix:** `radar-label-margins`.

## Radar-specific notes

- The curve colours come from the theme's `cScale` palette and the rings from `radar.graticuleColor`. The zinc themes set both (`scripts/tests/test_theme_contrast.py` holds them).
- Margins, `axisLabelFactor` and `curveTension` are config keys under `radar:`, not theme variables. A theme cannot change them.
- The title always sits flush with the top edge: mermaid draws it at `-height/2 - marginTop` from a centre that is itself `marginTop + height/2` down, so it lands at y = 0 with a hanging baseline whatever the margin. Known limit; it is not clipped.
