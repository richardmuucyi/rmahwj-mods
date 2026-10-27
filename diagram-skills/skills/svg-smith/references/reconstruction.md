# Reconstructing a mark that was never published as vector

For the case where Lane A's hunt genuinely comes up empty: a product icon a vendor ships only
as raster. Microsoft Authenticator is the worked example — Microsoft publishes it in no icon
pack, no product page, and every "SVG" result on the web is a third-party redraw.

**Say plainly on delivery that this is a reconstruction.** The curves approximate the
vendor's béziers; they are not the vendor's béziers. That distinction changes what the file
may be used for.

## Do not simply trace it

Tracing the whole image fails badly on anything with gradients. Measured on the Authenticator
icon: **1 path, 459 bytes, mean delta 54.84 — "POOR"**. The tracer's colour clustering sees a
smooth ramp and collapses the artwork into one blob. `svg_vectorise.py`'s flatness gate exists
to refuse exactly this.

The route that works is per-region: split the artwork into flat masks, trace each mask
separately (flat black on white traces beautifully), then reapply real gradients.

## The pipeline

1. **Get the best available raster.** Check what you actually downloaded — Apple's app-artwork
   URL serves JPEG regardless of the filename you save it under, and the whole Authenticator
   reconstruction was measured against a lossy source before anyone noticed. A true PNG was
   available at the same endpoint (`.../1024x1024bb.png`, 207 KB vs 46 KB). Read the magic
   bytes; do not trust the extension, including your own.

2. **Segment by connected component, never by a row threshold.** The obvious split ("the
   shackle is everything above y=N") assumes a straight boundary. Real occlusion boundaries
   are curves: the threshold landed 33 px too low and painted a strip of body as shackle.
   The topmost navy blob is unambiguous and needs no magic number.

3. **Set the ink threshold at the antialiasing midpoint.** `ink = not almost-pure-white`
   swallows the whole soft halo and inflates the silhouette ~2 px per side — measured
   590×722 against a true 586×719. Every artwork colour here had R ≤ 64 against white's 255,
   so `R < 160` is the 50% point and the result is stable anywhere in 128–175.

4. **Derive each shared boundary exactly once.** Where two shapes meet, one curve serves both.
   Smoothing them from separate masks lets them drift a pixel or two apart, and the darker one
   shows: first as a navy rim under the light glyph, later as a hook at the bottom corners.
   `smooth(A ∪ B) ≠ smooth(A) ∪ smooth(B)`.

5. **Clip tapering tips; do not smooth them.** The dark wedge between the light glyph and the
   silhouette edge tapers to a point, and blurring a tapering tip rounds and drags it. Compute
   the light glyph and intersect it with the silhouette instead — then the tip is the meeting
   of two smooth curves and stays sharp.

6. **Extend occluded geometry before smoothing — but only the parts that are occluded.** A
   shackle's legs continue behind the body; the cut end is an artefact of segmentation, and
   blurring rounds it into a visible flared foot at the joint. Extending downward fixes it,
   but extending *every* column also drags the arch's ceiling down and fills the opening
   (measured: fidelity 0.49x → 1.24x, the opening reduced to a slit). Define the legs by the
   opening's own extent, not by a row.

7. **Smooth each mask, then trace.** `svg_trace.py --smooth-mask 6` at ~2k px. See its help
   for why this makes the file smaller *and* more faithful at once.

8. **Keep vtracer's `transform`.** It normalises every contour to the origin and carries the
   placement in `transform="translate(...)"`. Extracting only `d` yields shapes of exactly the
   right size in entirely the wrong place — which renders as a confident, well-formed, plausible
   drawing rather than an error. Costliest single bug in the worked example: 25.35x → 0.58x.

9. **Measure gradients from eroded region cores.** Sampling near an edge reads antialiased
   blend, not the fill. Erode ~5 px, take the median colour per row, and read the endpoints.
   Two findings that changed the construction and would not have been guessed: the shackle is
   a *flat* colour, not a gradient; and the head and shoulders are two shapes each carrying
   its **own** gradient — one gradient stretched across both renders the head visibly wrong.
   `gradientUnits="objectBoundingBox"` reproduces that with a single definition.

10. **Clean a boundary that borders another dark region as a 1-D profile.** Where the body's
    top edge meets navy, the two colours are separated by a soft ramp and threshold noise runs
    *along* the edge — which a 2-D blur cannot fix, because it is not roughness across the
    boundary. The edge fitted a quadratic to 0.78 px RMS, so the ±2.7 px wander was noise;
    smoothing the profile with `savgol_filter` kept the real curvature, corners included.

## Verify with `svg_verify.py`, not just `svg_check.py`

Across this reconstruction the fidelity number read 0.58x → 0.52x → 0.49x → 0.27x — inside
MATCH throughout — while the file successively contained a staircased edge, a navy rim, a
rounded joint, and a 135° kink. Every one was found by measuring something else: tangent
continuity, per-feature boxes, per-row widths, magnified crops.
