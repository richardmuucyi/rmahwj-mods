# Figurative marks in a roundel

A figure reserved in white from a filled disc — the Starbucks siren, the CHAGEE opera face,
a crest. This is the hardest thing in Lane B, and it fails in ways that are invisible in the
geometry and obvious the instant you render it.

These notes come from a mark that took **five drafts**. Every failure below was rendered and
thrown away during that work. Read this before drawing; it is worth two or three of those
drafts.

## Get the proportions right before you get the shapes right

Draft after draft went into refining curves when the *ratios* were wrong. Ratios are cheap to
check and they decide whether the thing reads at all.

**A hair ornament is about half the head's width.** A sumo topknot drawn at 72% of head width
(236 units against a 330-unit head) stops reading as a topknot and becomes a **cap**. At ~50%
it reads correctly. The same trap applies to any crown, hat, helmet or headdress: too wide and
it merges with the skull into headwear.

**A face in a badge is broader than a face in life.** Heads drawn at natural proportions read
as thin and generic at badge scale. Widen the jaw and cheeks; a bust that should read as heavy
wants roughly 1.3 : 1 width to height.

**Mass lives in the shoulders, not the face.** If a figure should read as powerful, the
shoulders do that work. A slim neck with a wide face reads as a large head, not a large person.

## The figure must fill the roundel

The single biggest structural error: a small figure floating in a sea of disc colour. Look at
what the references actually do — the siren's hair reaches the disc edges, the CHAGEE headdress
fills its frame. Both figures are *cropped by* the circle, not contained politely inside it.

If your figure has visible disc colour all the way around it, that is the problem to fix, and
no amount of feature-tweaking will substitute. Scale the figure up until it is clipped by the
disc on at least two sides.

## Same fill on same fill needs structure, not an outline

White hair sitting on a white face, separated by a thin line of disc colour, reads as **a hat
brim**. Every time. The eye interprets a closed line across a head as an edge of an object,
not as a hairline.

What actually works is what the siren does: let the hair read through *structure* — swept
strands, a parting, a silhouette that could only be hair. Or commit to a real tonal split and
accept the consequence: hair in disc colour merges with the disc, so the crown silhouette
disappears and you need a white rim to hold it.

## Any line near a face becomes a facial feature

Two separate drafts died on this:

- A collar arc below the mouth was read instantly as a **frown**. It was anatomically a
  garment edge and visually a sad expression.
- Hair strands sweeping across the temples were read as **a second pair of eyebrows**.

The rule: within the face's bounding box, and for some distance around it, every mark you add
gets recruited into the expression. Before adding a line near a face, ask what feature it will
be mistaken for. If you cannot answer, render it and find out.

## Compute the symmetry, then verify it

Mirror-symmetric figures should be *generated* by mirroring, not by typing coordinates for
both halves. Hand-typed mirrors drift, and drift in a face is the most visible defect there is —
far more visible than in an abstract mark.

Then check it, because a computed mirror can still be broken by an odd transform:

```bash
python scripts/svg_check.py mark.svg --mirror
```

MATCH means symmetric. Note this is a strong *positive* check only — dense asymmetric artwork
overlaps its own mirror by chance and can score deceptively low, so a middling result does not
prove asymmetry.

## Know what will not survive the shrink

A bust does not read as a *specific* character at favicon scale. At 16–24px you keep three
masses at most: the head, one distinguishing silhouette element, and the shoulders. Facial
features become mud and should be removed entirely from the small drawing.

Be honest with the client about this rather than shipping a smudge. If small-size recognition
matters more than the badge look, a **whole-figure silhouette in a distinctive pose** survives
shrinking far better than any bust — a stance is recognisable as a shape, a face is not.

## Know when to stop hand-drawing

Everything above helps, and it will not make hand-authored Bezier work match a professionally
illustrated mark. Track your drafts honestly: if two or three passes have not converged — each
fixing one thing and breaking another — the method is wrong, not the effort.

The measurable version of "it looks cheap" is silhouette structure. Run it:

```bash
python scripts/svg_quality.py mark.svg --against starbucks.svg chagee.svg
```

If transitions/row is far below the references, no amount of curve-tuning closes the gap; the
mark needs a repeating element or more of the figure showing. In one real case eight hand-drawn
drafts peaked at **3.9** against references at **5.4** and **7.4**. The route that cleared both,
at **7.5**, was to generate flat two-colour art and vectorise it — see SKILL.md § B4.

## Register is a design decision, and getting it wrong is worse than getting it ugly

Drawing a person from a culture or a body type carries an obvious failure mode — the caricature.
For a sumo mark it is the fat joke; for others it is the ethnic stereotype. These are both
offensive and *bad design*: caricature reads as cheap, and cheap is the opposite of what a badge
mark is for. Draw the dignified, heavy, composed version. That is also what the real iconographic
tradition does.

## What the generator actually returns, versus what you asked for

The B4 route states hard constraints — flat colour, exactly two colours, no gradients, no
shading, no drop shadow, hard edges — and the model **partially ignores them**. Measured on one
run that asked for `#12343B` and pure white: it returned a lighter teal, added a soft drop shadow
and a darker outline around both the disc and the figure, and used an off-white ground.

None of that sank the trace. The flatness gate read **0.42% mid-tone** and passed, the blob gate
came back 5 -> 5 with the thin legs intact, and the worst-tile gate fired on the wing feathers,
where the soft anti-aliased edges got correctly hardened — a real regional difference that was
not a defect.

Two things follow. State the constraints anyway: they get you close enough that the gates pass,
and the recolour step fixes the palette for free. And do not read a violated instruction as a
failed generation — check the gates, then look. The place to be strict is the flatness number,
because a genuinely gradient-y source is the one that produces a 300-path banded file.

## The vectorise route produces a KNOCKOUT

`svg_vectorise.py` traces ink, so the figure reserved out of a filled disc is a *hole*, not a
white shape. The ground shows through it: the same file reads as a white bird on teal over a
light page and inverts to a dark bird over black. `svg_probe.py` now warns about this.

The fix is a plate — but cut it from the traced disc's **own outer subpath**, keeping vtracer's
`transform`. Three attempts failed first: duplicating the whole ink path reproduced the hole,
an inscribed circle did not match the traced contour and left a white crescent, and extracting
the outer subpath while dropping the transform put the plate hundreds of units away.
