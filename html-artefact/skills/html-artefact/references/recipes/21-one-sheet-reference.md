# 21 — One-sheet reference

**Category:** Reference & Explainers
**Reference HTML:** `references/examples/21-one-sheet-reference.html` *(made for this skill from public facts; Thariq's gallery has no page like it)*
**JS:** None. A sheet is read, screenshotted or printed; it has no controls.

## Intent

One page that carries a set of **facts** the reader will look things up in: limits, allowed and not allowed, a history, a structure. It is drawn like an engineering drawing: a frame with zone marks, lettered panels, and a title block. Each panel uses the drawing that fits its facts, so the eye finds a limit in a bar, a rule in a table, a date in a timeline.

Use it when the facts are the point and the reader will come back to the page. For one concept with a live figure see recipe `15-concept-explainer.md`; for a decision with options see `01-side-by-side-code-approaches.md`.

## Example prompt

> Make me a one-sheet reference on ASD-STE100 from these facts: <the fact list, one line each, with its source>. Use only these facts. Draw it as an engineering-drawing sheet in the kraft look, 1600×1000.

The reference page was made from 12 facts, each checked against Wikipedia's text (`references/examples/21-one-sheet-reference.html`, source line "Wikipedia, Simplified Technical English").

## The sheet rules (paste into the prompt after the look you chose)

```
LAYOUT: draw the page as a one-sheet reference in the style of an engineering drawing.
- A thin frame around the whole sheet, with zone letters (A, B, C, D) down the left and right edges and zone numbers (1 to 8) along the top and bottom edges.
- Divide the content into lettered panels (A, B, C, ...). Each panel has a header bar with the letter in a dark square followed by a short title.
- Give each panel the encoding that fits its facts: a tree for a hierarchy or structure; an annotated example with brackets for how something is built; a table with check and cross marks for allowed and not allowed; bars on a scale for limits or measurements; a timeline for dated events. Use what fits; do not force all five.
- A title block in the bottom-right corner: Title, Source (write the source line given with the facts), and Sheet 1 of 1. Add no other fields.
- Monospace for words, numbers and identifiers; sans-serif for labels.
Keep the chosen palette and typography; in the kraft look use olive and clay, not red and blue, for allowed and not allowed.

HARD RULES:
- Every piece of text must fit inside its own box. The title must fit on at most two lines inside the title area without touching or being covered by any panel.
- Bars and scales are drawn to scale: a bar's length is proportional to its value on the stated axis, and the axis starts at zero.
- Nothing may overlap anything else; check each panel and the title block for collisions.
- Every number, date or name on the page comes from the fact sheet. Scale tick labels and panel letters are the only exceptions.
```

## Standard sections (in order)

1. **Frame** with zone letters down both sides and zone numbers along the top and bottom
2. **Masthead:** eyebrow, a serif title of at most two lines, a short summary callout
3. **Lettered panels** (4 to 6) in a grid. Each has a header bar: dark square with the letter, then a short title
4. **Title block**, bottom right: Title, Source, Sheet 1 of 1

## Which drawing for which fact

| The facts are about | Draw |
|---|---|
| a hierarchy or how a thing is divided | tree |
| limits, sizes, measurements | horizontal bars on one stated axis from zero, value printed at the end |
| allowed and not allowed | table with ✓ (olive) and ✗ (clay) |
| dated events | timeline, with a note saying whether spacing is to scale |
| one or two headline numbers | large numerals with a label |
| how something is built | the sample, with brackets naming its parts |

## Interactive elements

None. If the reader must change a value, use recipe `07-animation-sandbox.md` or `15-concept-explainer.md` instead.

## Distinctive styling

- **Kraft palette only.** Olive means allowed, clay means not allowed or the one thing to look at. No blue, no red.
- **Monospace for the data** (words, numbers, identifiers), sans for labels, serif for the title.
- **A fixed 1600×1000 canvas** (`overflow: hidden`), so the sheet is the same on every screen and prints as one page.

## Anti-patterns

Each of these was seen in a generated sheet, not guessed.
- **A title that wraps behind a panel.** In one sheet the title's second line was clipped by panel A. State "at most two lines, fits its own area" in the prompt and check the screenshot.
- **Bars that do not carry their numbers.** Two bars of near-equal length beside "12/12" and "6/12". The text was right and the drawing said otherwise. Bars are proportional or they are not bars.
- **A source line copied from the prompt's own example.** A sheet about Wikipedia facts said "Source: CLAUDE.md" because the rule block named it. The rule now says "the source line given with the facts".
- **A label sitting on a bar** (a "minimum" note printed over the tallest bar). Put axis and threshold labels outside the plot.
- **Using all five drawings to show off.** Pick the ones the facts need; "do not force all five" is in the rules.

## Check before you hand it over

1. **Screenshot at 1600×1000** and read it: nothing clipped, nothing overlapping, the title inside its area.
2. **Trace the facts.** List every number, date and name on the page and tie each to a line of the fact sheet. Counts, inversions and "not allowed" rows derived from a listed rule are fine; a new number is not. (A second model call given the sheet and the page text, validated with one planted false claim, did this well.)
3. **Check each bar:** its length divided by its value is the same across the axis.

## Evidence, and its limits

On three topics drawn from the same fact sheets, one reviewer preferred this layout to the plain kraft look overall; no page in either arm had an unsupported claim; the sheet arm had one visible defect (the clipped title), the plain arm one (a label over a bar). **One person, overall picks, one generation each, single-shot.** Nothing here measures whether readers understand faster. A separate benchmark by a community skill preferred its sheet in only 1 of 4 blind AI judgements, so this is a layout that carries facts honestly, not a proven gain.

## Variations

- **When the facts are one story with a figure**, recipe `15-concept-explainer.md`.
- **When a flow matters more than limits**, recipe `13-annotated-flowchart.md`.
- **When the content is a pile of numbers over time**, recipe `11-status-report.md` for the mini chart.
