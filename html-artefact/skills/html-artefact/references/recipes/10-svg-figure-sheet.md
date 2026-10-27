# 10 — SVG figure sheet

**Category:** Illustrations & Diagrams
**Reference HTML:** `references/thariq-examples/10-svg-illustrations.html`
**JS:** Light — download-as-file via XMLSerializer

## Intent

A page of inline SVG illustrations (e.g. header art for a blog post on background jobs) with a "Download SVG" button next to each. Vector art the user can tweak by hand in the page or download individually and paste into the final document.

## Example prompt

> Draw me three header illustrations for the background-jobs blog post — queue, retry, and fan-out. Inline SVG so I can tweak them by hand. Each one downloadable as a separate file.

## Standard sections (in order)

1. Eyebrow + H1
2. **Three (or N) illustration panels** — each panel: title (mono), figured `<svg>`, "Download SVG" button
3. **Palette & rules** — `.swatches` strip showing the five colours used (with hex codes); a rules paragraph (line weight, corner radius, stroke vs fill conventions)

## Interactive elements

- **"Download SVG" button per illustration** — serialises the inline `<svg>` to a Blob, triggers download

## JS patterns to copy

- **SVG download via `XMLSerializer → Blob → object URL`** (`shared-patterns.md` §5) — ~15 lines, one `forEach` on download buttons. Reusable for any "export this element" need

## Distinctive styling

- **Every illustration uses the same five-colour palette** as CSS variables — visual consistency without effort
- **Swatch chips** show colour-name + hex + usage note (mono font)
- **Illustrations are hand-laid `<svg>`** — simple shapes, no gradients, no filters, on-palette colours only

## Anti-patterns

- **Don't generate the SVG as a base64 data URL.** Inline `<svg>` keeps it editable in the page and downloadable on demand.
- **Don't apply gradients or drop shadows.** They photocopy badly, scale unpredictably, and clash with the kraft palette.
- **Don't reach for icon fonts** for the illustrations — author them as SVG paths.

## Variations

- **For one big diagram with click-to-explore** (deploy pipeline) see recipe `13-annotated-flowchart.md`
- **For data-driven charts** (bar / line) — author inline `<rect>` / `<polyline>` directly. See `11-status-report.md` for an example mini bar chart.
