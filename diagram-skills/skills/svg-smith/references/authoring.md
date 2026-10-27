# Authoring original SVG

For work with no reference to fetch: icons, badges, marks, simple illustration.

## What to ask, and what to just decide

Ask once, batched, and only where a wrong guess wastes real work.

**Worth asking** — these change the artwork, not merely its finish:

- **Smallest size it must survive.** A 16px favicon and a hero mark are different drawings.
  Detail that reads at 512px becomes mud at 24px, and the fix is fewer, bolder shapes — not
  the same shape scaled.
- **Mono or fixed colour.** A mono icon should be one path family filled `currentColor` so the
  consumer recolours it from CSS. A fixed-colour mark hard-codes its palette. That is a
  structural decision, not a fill.
- **Style register, when the brief is open.** "An icon of a fox" could be geometric flat,
  single-weight line, or filled silhouette; they share no geometry, so guessing wastes the
  whole drawing.
- **Where it sits.** On a dark UI, on print, as an app icon with a platform mask — each
  constrains contrast and safe area.

**Just decide, and state the assumption in one line:** canvas size, exact padding, id naming,
number of paths, whether to include `<title>`/`<desc>`, filename. If the user supplied a
reference image or named a style, infer from it rather than asking.

## Construction

**Canvas.** Square viewBox, 800×800 is a good default. Inset the artwork 10–12% so the mark
has clear space and does not collide with whatever frames it.

**Fewer, better paths.** Someone will open this file. A shape assembled from forty fragments
is unmaintainable and usually means the geometry was never really designed. Group with ids
that name what a thing *is* — `#body`, `#leaf`, `#ring` — never `#path12`.

**Symmetry belongs to a transform, not to duplicated coordinates.** Draw one half, mirror it:

```xml
<g id="wing-right"> … </g>
<use href="#wing-right" transform="matrix(-1 0 0 1 800 0)"/>   <!-- mirrors about x=400 -->
```

Hand-computing the mirrored coordinates guarantees drift, and drift in a symmetric mark is
the most visible possible defect. Include both `href` and `xlink:href` if the file must
survive older consumers.

**Strokes vs fills.** A `stroke` scales with the artwork, which is usually what you want for a
line icon — but `vector-effect="non-scaling-stroke"` changes that, and stroked geometry cannot
be reliably boolean-combined later. For a mark that will be recoloured, resized hard, or
converted to a font, outlined fills are safer.

**Do not hand-plot complex-script glyphs.** See `svg-traps.md`.

## Parametric authoring: how to hand-build figurative work that converges

Hand-authoring fails when you type path coordinates, because you cannot see what you are drawing
until you render it, and every fix breaks something else. It succeeds when you write a small
script that *generates* the geometry and you render every iteration. The difference is loop speed,
not talent.

A run that took this route on a figurative badge went through five bad versions — it read as a
goat, then the ears fused with the head, then it read as tusks, then wings — and still converged,
because each correction cost a script edit and a render rather than a rewrite of a path string.

What that looks like in practice:

- **Build a tiny toolkit first**, not the artwork. A spline helper, a tapered-stroke helper, a
  function that walks a point list. Twenty minutes of scaffolding buys you dozens of cheap
  iterations.
- **Compute anything periodic.** Ring segments, gear teeth, a fringe of cords, tines on a rack —
  emit them from an angle or offset formula. Hand-placed repeats read as subtly wrong in a way
  people notice and cannot name, and they are miserable to adjust.
- **Mirror, never re-type.** Draw one half, emit the other with `matrix(-1 0 0 1 W 0)` or a
  `<use>`. Then prove it with `svg_check.py --mirror`.
- **Render every iteration and actually look.** This is the whole mechanism. A version you did
  not look at is a version you did not test.
- **Outline any lettering** you generate, so the file carries no font dependency — and check the
  licence permits it before you do.

The trade against generating (SKILL.md § B4): parametric costs roughly 30% more time and tokens,
and buys native compact geometry, complete control, easy coordinated variants, and no
machine-generated provenance to disclose. For a commercial brand that last point can decide it.

## Icon sets are a system, not five drawings

What reads as "cheap" in a nav bar is almost never one bad icon — it is inconsistency:
mixed stroke weights, some filled and some outlined, different padding, different optical
size. So fix the system first and draw second.

Decide once, then obey it: box size (24 is a good default), an inner **keyline** the artwork
must fill (18 inside 24), one stroke weight, one cap/join style, `currentColor`, fills or
strokes but not a mix.

**Declare the paint on the root `<svg>` and leave the children as bare geometry.** No child
carries `stroke-width` or a colour of its own. Two things follow: no icon can silently drift
from the family, and a sixth icon inherits the whole system by copying the root element.

**Check clear space in device pixels, not design units.** This is the rule that bites. A
2-unit gutter on a 24-unit grid sounds generous, but with a 1.5 stroke it leaves 0.5 units of
air — which at a 16px render is **0.33 of a pixel**, so the shapes merge into a blob. Compute
it: `clear_units × (target_px / box_units)`. Keep at least ~1 device pixel of daylight at your
smallest size, which usually means gutters measured between stroke *centrelines*, not edges.

**Generate regular geometry rather than eyeballing it.** A gear with teeth at hand-placed
angles reads as slightly wrong in a way people notice without being able to name; compute the
periods. Near-perfect symmetry is itself part of looking professional.

**Calibrate a subjective metric against a respected set rather than inventing a threshold.**
You can measure consistency — ink-coverage spread across the family, ink-box sizes, optical
centres — but there is no absolute number that means "consistent enough". One run measured its
own spread at 14.30 points, then fetched the five nearest icons from an established open set
and ran the *identical* measurement: 14.52 points, with their ink boxes varying more than its
own. That turns an unanchored number into evidence. It also surfaced an honest caveat: a 1.5
stroke carries less ink than a 2 stroke, so the two sets are not perfectly comparable, which is
worth stating rather than glossing.

**`currentColor` cannot be tested through `<img>`.** An SVG loaded in an `<img>` is an isolated
document and inherits nothing, so a `currentColor` mark always previews black no matter what the
page colour is. If your icons claim to be recolourable, that claim is unproven until you render
them inline:

```bash
python scripts/svg_render.py icon.svg --sizes 64,24 --inline --color "#c8102e" --out sheet.png
```

Better still, build a small preview that inlines the whole set into a realistic context — a
sidebar at the real nav size, light and dark. That is the only view that tests the actual
complaint behind an icon-set request, which is never one icon but whether they read as one
family in a column.

**Optical weight is not geometric weight.** An icon built from small dots can be technically
correct and still look faint beside its siblings. Render the set together and adjust by eye —
that is a judgement the measurements will not make for you.

## Verify

Without a reference there is no diff, so the render is the verification:

```bash
python scripts/svg_render.py icon.svg --sizes 512,128,48,24 --bg light,dark,mid --out sheet.png
```

Read it in this order:

1. **Smallest size first.** That is where designs fail. If the 24px tile is a smudge, the
   drawing is too detailed — go back and simplify rather than shipping and hoping.
2. **Every ground you intend to claim.** A mark that only works on white is a mark that works
   on white; say so, or fix it.
3. **Symmetry and alignment.** Mirrored halves should be indistinguishable; optical centres
   often sit slightly off geometric centres, and the render is where you notice.

If you built the thing from a reference image the user supplied, you *do* have something to
compare against — render both side by side with `svg_render.py` and look, even though a pixel
diff against a raster of different proportions will not be meaningful.
