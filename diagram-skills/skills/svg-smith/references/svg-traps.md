# SVG traps

Failures that cost real debugging time. Each one is invisible in the XML and obvious in a
render, which is the whole argument for rendering.

## Splitting one path into several breaks the second subpath

A logo is often one `<path>` holding several subpaths — an apple body plus its leaf, a letter
plus its counter. Splitting them so each can be styled separately is reasonable, but the
second subpath usually begins with a **relative** `m`, and that offset is measured from the
**start point of the previous subpath**, not from the origin and not from wherever the drawing
left off. Copy-paste it into a new `<path>` and the piece lands somewhere wrong.

Resolve it against the real geometry rather than by arithmetic:

```js
const p = document.createElementNS('http://www.w3.org/2000/svg','path');
p.setAttribute('d', firstSubpath); svg.appendChild(p);
const s0 = p.getPointAtLength(0);          // true start of subpath 1
// absolute start of subpath 2 = s0 + the relative m delta
```

Then confirm the split changed nothing: render the split version against the unsplit original
and diff. It should come back at 0 differing pixels.

## `currentColor` means the file has no colour of its own

Marks distributed for UI use are often `fill="currentColor"` so they inherit text colour.
Standalone, with nothing to inherit, that resolves to **black**. If you pin a hex, pin one you
verified from the vendor's own file — a widely-repeated "brand black" may not be what the
vendor actually ships. One major vendor's official file simply says `fill="black"`.

## The background shape may be the artwork

A red badge with a white figure is frequently built as a **white disc** with a red field
knocked out over it. The white disc is not a backing plate you can delete — it *is* the figure,
showing through. Delete it and the figure goes transparent.

Test rather than assume: hide the suspect element, render on a saturated colour, and see what
disappears. It also tells you the mark is built for light grounds, which belongs in the
delivery notes.

## Reversed variants are invisible on the wrong ground

A lockup with a white wordmark vanishes on a white page — including inside your own diff
harness, which will then compare two blank canvases and report a perfect match. `svg_check.py`
refuses to run on a blank render for exactly this reason. Use `--bg dark` for reversed art.

## `prefers-color-scheme` answers the wrong question for a logo

Self-theming an SVG with `@media (prefers-color-scheme: dark)` is tempting and is usually wrong
for a mark. That query reports **the viewer's OS setting, not the background the artwork is
actually sitting on**. Drop the logo onto a dark panel inside a light page — a hero band, a
footer, a card — and it happily serves its light-mode artwork and disappears.

It is the right mechanism for a favicon, where the tab bar really does follow the OS. For
anything that can be placed, ship explicit **reverse variants** and let whoever places it choose,
optionally with a `data-theme` hook for inlined use. That is also why `svg_render --scheme`
exists only to *test* self-theming files, not to bless the technique.

## Every exporter names its gradient `paint0_linear`

Inline two SVGs from the same tool on one page and whichever `id` loses the collision corrupts
the other's fills. Namespace ids per file before they can meet. Remember to rewrite the
*references* too — `url(#id)`, `href="#id"`, `clip-path`, `mask`, and `fill`.

## A neighbouring SVG's `<style>` block can repaint yours

This is the *other* cause of "the colours go haywire when I put two SVGs on a page", and it is
the more likely one. Inline `<style>` inside an SVG is **document-scoped, not SVG-scoped**. So a
neighbouring file carrying an Illustrator-style rule like `path{fill:#e00}` repaints every path
in your logo too. And because a **presentation attribute** (`fill="#141B4D"`) loses to any CSS
rule, artwork whose fills are attributes is defenceless against it.

Two consequences worth internalising:

- Diagnosing "colours go haywire" as id collision alone is an incomplete answer. Check both.
  Reproduce it: put the file next to a hostile neighbour carrying an element-selector rule.
- **This skill's own output convention is exposed to it.** Files written with a `<style>` block
  of generic classes (`.brand-red`, `.gh-ink`) will cross-apply if two are inlined together.
  Namespace the class names alongside the ids, or move fills to `style="fill:…"` inline, which
  outranks a foreign stylesheet.

**Demonstrated, not theoretical.** Two delivered files — SAP and Postman — both shipped with
Illustrator's default `.cls-1`/`.cls-2`. Inlined in one document, SAP lost its blue gradient
entirely and its letters turned Postman orange; Postman survived only because its `<style>`
parsed second. `svg_place.py --namespace` now renames class tokens as well as ids (rewriting the
selector text inside `<style>`, since renaming ids alone leaves the rule pointing nowhere), and
`svg_probe.py` flags exporter-default class names. Before that fix the probe reported
"no obvious id hazards" on a file with a live collision — a checker's false all-clear is worse
than no checker, because it converts an unexamined file into an examined one.

Inline `style` is the hardening move for a fixed-palette emblem. The trade is real: it also makes
the artwork un-recolourable from CSS, which is wrong for an icon meant to inherit theme colour.
Choose per artefact and say which you chose.

## Stock optimisers will happily break the file

Running a vendor SVG through default SVGO does two damaging things: it **minifies ids to `a`,
`b`, `c`**, which manufactures exactly the collisions above, and it **strips `viewBox`**, which
kills CSS scaling. If a file must survive an optimiser downstream, namespace ids to something
an optimiser will not shorten, and verify the `viewBox` survived.

## Gradients and masks travel with the geometry, if you let them

`gradientUnits="userSpaceOnUse"` coordinates live in the same user space as the element that
references them. Wrap the element in a `<g transform>` and the gradient transforms with it —
correct, and the reason placement should wrap rather than rewrite path data. But if you move a
gradient's *coordinates* between files of different scales, map them through the same
transform as the geometry or the fill lands in the wrong place.

## Pruning defs needs more than one pass

Gradients chain to other gradients via `href`. Removing an unreferenced entry can orphan
another, so sweep repeatedly until a pass removes nothing. `svg_place.py --prune` does this.

## Vendors ship duplicated artwork

One official lockup contained the emblem **twice**, identical paths stacked. Harmless visually,
double the bytes, confusing to edit. Compare per-element bounding boxes; exact duplicates stand
out immediately.

## Do not hand-plot complex-script glyphs

A CJK character can run past twenty strokes. Hand-authoring one at any reasonable size produces
an illegible blob — worse than not shipping it. Options, in order: find the vendor's outlined
vector; use `<text>` with a font stack and say clearly in a comment that it must be converted
to outlines for portability; or omit it and say why. Do not guess at the strokes.

## viewBox is not the artwork box

Artwork can sit anywhere inside the viewBox, or extend past it and rely on clipping. Placement,
canvas sizing and comparison all key off the measured artwork bbox. `svg_probe.py` reports both
and flags when they disagree.

## A canvas you assumed is a canvas that overflows

Two variants of one logo often have different aspect ratios — dropping a tagline makes a lockup
wider. Give both the same assumed canvas width at matched height and the wider one silently
overflows and clips. Derive the canvas from the measured artwork instead; `svg_place.py` does,
and warns when a forced `--square` cannot fit.

## A CSS variable in a fill makes a well-formed file render nothing

Site chrome often binds fills to theme tokens: `fill="var(--grey-100)"` on a root that also
carries `fill="none"`. Lift that markup out of the page and the variable resolves to nothing,
the declaration is invalid at computed-value time, and the path falls back through the root's
`none`. The result is a blank file whose XML looks perfectly healthy — no error, no warning,
nothing to grep for.

Pin the fills to real values before shipping, and read the *computed* value rather than guessing
what the token means: `getComputedStyle` on the live page turns a recollection of the brand
colour into a measurement. On one mark the guess happened to be right and the check still
mattered, because a plausible-but-wrong navy renders beautifully and nothing downstream objects.

## The file you downloaded may not be the format you named it

An extension is a claim, not a fact. Apple's app-artwork endpoint serves **JPEG** whatever
filename you save it under; a reconstruction was measured against a lossy source for an entire
session because the bytes had been written to `…-1024.png`. A true PNG was available from the
same endpoint by asking for `1024x1024bb.png`.

Read the magic bytes (`89 50 4E 47` for PNG, `FF D8 FF` for JPEG) before treating anything as a
reference, and prefer a lossless original when one exists. In that case the artefacts turned out
negligible — mean delta 0.27, identical measured bbox — but that was luck, and it was only
knowable by checking.

## vtracer normalises every contour to the origin

Its output carries placement in `transform="translate(…)"` on each `<path>`. Extract the `d`
alone and every shape comes out the correct *size* in the wrong *place* — which renders as a
confident, well-formed, plausible drawing rather than an error, so nothing alerts you. On one
mark this cost a fidelity of 25.35x the noise floor; keeping the transform took it to 0.58x.
The tell was that measured widths matched expectation to within 2 units while positions were
hundreds of units out. See `references/reconstruction.md`.
