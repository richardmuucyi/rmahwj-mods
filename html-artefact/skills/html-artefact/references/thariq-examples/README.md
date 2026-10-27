# Thariq HTML Effectiveness — Local Mirror

20 reference HTML demos (plus 11 more in `unknowns/`) from Thariq's *"Using Claude Code: The Unreasonable Effectiveness of HTML"* gallery, plus the gallery index page.

**Source:** https://thariqs.github.io/html-effectiveness/, built from the repo [`thariqs/html-effectiveness`](https://github.com/thariqs/html-effectiveness). Every file here is byte-identical to that repo apart from line endings.
**Author and licence:** © 2026 Anthropic PBC, by Thariq. Each page carries `<!-- Copyright 2026 Anthropic PBC · SPDX-License-Identifier: Apache-2.0 -->`, and `thariqs/html-effectiveness` is licensed Apache-2.0. A second copy of the first 20, [`anthropics/html-effectiveness`](https://github.com/anthropics/html-effectiveness), has an MIT `LICENSE` file. Both licence texts are in the plugin's `THIRD-PARTY-NOTICES.md`. Keep the header line when you copy a page.
**Also here:** [`unknowns/`](unknowns/README.md), 11 further pages ("Know your unknowns"), from the same repo's `unknowns/` folder.

## Why these are here

Opening the reference HTML in a browser before authoring a new artefact is faster than reading the recipe alone. The reference shows the kraft-paper palette in context, the exact toolbar spacing, how the typography balances serif/sans/mono, and how interactivity actually feels.

When building an artefact:

1. Read `../recipes/NN-<slug>.md` for the standard structure
2. Open `NN-<slug>.html` in a browser — get the visual / interaction target in your head
3. Then author the new artefact

## Index

| # | File | Recipe | Category |
|---|---|---|---|
| 01 | `01-exploration-code-approaches.html` | [01-side-by-side-code-approaches.md](../recipes/01-side-by-side-code-approaches.md) | Exploration & Planning |
| 02 | `02-exploration-visual-designs.html` | [02-visual-design-directions.md](../recipes/02-visual-design-directions.md) | Exploration & Planning |
| 03 | `03-code-review-pr.html` | [03-annotated-pull-request.md](../recipes/03-annotated-pull-request.md) | Code Review |
| 04 | `04-code-understanding.html` | [04-module-map.md](../recipes/04-module-map.md) | Code Review |
| 05 | `05-design-system.html` | [05-design-system.md](../recipes/05-design-system.md) | Design & Prototypes |
| 06 | `06-component-variants.html` | [06-component-variant-matrix.md](../recipes/06-component-variant-matrix.md) | Design & Prototypes |
| 07 | `07-prototype-animation.html` | [07-animation-sandbox.md](../recipes/07-animation-sandbox.md) | Prototyping |
| 08 | `08-prototype-interaction.html` | [08-interaction-prototype.md](../recipes/08-interaction-prototype.md) | Prototyping |
| 09 | `09-slide-deck.html` | [09-slide-deck.md](../recipes/09-slide-deck.md) | Decks |
| 10 | `10-svg-illustrations.html` | [10-svg-figure-sheet.md](../recipes/10-svg-figure-sheet.md) | Illustrations |
| 11 | `11-status-report.html` | [11-status-report.md](../recipes/11-status-report.md) | Reports |
| 12 | `12-incident-report.html` | [12-incident-timeline.md](../recipes/12-incident-timeline.md) | Reports |
| 13 | `13-flowchart-diagram.html` | [13-annotated-flowchart.md](../recipes/13-annotated-flowchart.md) | Illustrations |
| 14 | `14-research-feature-explainer.html` | [14-feature-explainer.md](../recipes/14-feature-explainer.md) | Research & Learning |
| 15 | `15-research-concept-explainer.html` | [15-concept-explainer.md](../recipes/15-concept-explainer.md) | Research & Learning |
| 16 | `16-implementation-plan.html` | [16-implementation-plan.md](../recipes/16-implementation-plan.md) | Exploration & Planning |
| 17 | `17-pr-writeup.html` | [17-pr-writeup.md](../recipes/17-pr-writeup.md) | Code Review |
| 18 | `18-editor-triage-board.html` | [18-triage-board.md](../recipes/18-triage-board.md) | Editing Interfaces |
| 19 | `19-editor-feature-flags.html` | [19-feature-flag-editor.md](../recipes/19-feature-flag-editor.md) | Editing Interfaces |
| 20 | `20-editor-prompt-tuner.html` | [20-prompt-tuner.md](../recipes/20-prompt-tuner.md) | Editing Interfaces |

Plus `index.html` — Thariq's gallery page itself, useful as another reference for the "table of cards with screenshots + prompts" pattern.

## A note on two demos with mismatched descriptions

The gallery index card descriptions occasionally drift from the actual file:

- **07 Animation sandbox.** Index says "sliders for duration and easing." Actual demo uses three easing **preset buttons** (linear / smooth / springy), not sliders. The recipe documents the actual demo.
- **08 Clickable flow.** Index says "four screens linked together." Actual demo is **drag-to-reorder sidebar**. The recipe documents the actual demo.

Both files are still excellent references; the description is just promotional.

## How to refresh this mirror

If the upstream gallery updates (the site serves the same files as the repo; keep each page's licence header):

```bash
cd "$(dirname "$0")"
BASE="https://thariqs.github.io/html-effectiveness"
for f in 01-exploration-code-approaches 02-exploration-visual-designs \
         03-code-review-pr 04-code-understanding 05-design-system \
         06-component-variants 07-prototype-animation 08-prototype-interaction \
         09-slide-deck 10-svg-illustrations 11-status-report 12-incident-report \
         13-flowchart-diagram 14-research-feature-explainer 15-research-concept-explainer \
         16-implementation-plan 17-pr-writeup 18-editor-triage-board \
         19-editor-feature-flags 20-editor-prompt-tuner; do
  curl -sSfL "$BASE/$f.html" -o "$f.html"
done
curl -sSfL "$BASE/index.html" -o index.html
```

Diff against the recipes after refresh — if the upstream gained a new pattern (sliders, a new chip style, a new layout), update the recipes and `shared-patterns.md` to match.
