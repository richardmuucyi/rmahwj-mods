# 07 — Animation sandbox

**Category:** Prototyping
**Reference HTML:** `references/thariq-examples/07-prototype-animation.html`
**JS:** Light — easing preset button group

## Intent

The exact micro-interaction (e.g. "task completed" with check mark + line-through + confetti pop) running in isolation, with three easing presets to swap between. Below the stage, the production-ready CSS keyframes printed so you can copy them straight into the codebase.

## Example prompt

> I want to nail the "task completed" micro-interaction. Build me a sandbox: the real animation running on a fake task row, with three easing presets I can swap between (linear / smooth / springy), and the final CSS keyframes printed below so I can copy them out.

(Thariq's variant uses sliders for duration/easing; this demo uses preset buttons — easier to commit to a value and copy out.)

## Standard sections (in order)

1. Eyebrow + H1 + intro paragraph
2. **`.stage`** — large canvas with one fake task row that runs the full animation on click. Click to replay.
3. **Easing presets** — three `.ease-btn` buttons (linear / `cubic-bezier(0.16, 1, 0.3, 1)` / `cubic-bezier(0.34, 1.56, 0.64, 1)`). One active at a time, marked with `.on` class.
4. **Keyframes panel** — `.timeline` visualisation of the animation steps (which property does what at which percentage)
5. **Copy-paste CSS** — `<pre>` block with the production-ready CSS keyframes + transition

## Interactive elements

- **Click stage** to replay animation
- **Click easing preset** to swap the easing curve — JS reads `data-ease` attribute and sets `--ease` on `:root`
- **Click "copy CSS" button** (if added) — clipboard with flash pattern

## JS patterns to copy

- **CSS-variable-as-state-channel** (`shared-patterns.md` §1) — `--ease` variable is threaded through every transition; one click re-times the whole composition

## Distinctive styling

- **One CSS variable controls all easing** — `transition: transform 240ms var(--ease), opacity 240ms var(--ease)` everywhere
- **Multi-property staggered transition** with per-property delays — produces a layered "settle" effect (height collapses while opacity fades while border softens)
- **Inline SVG checkmark with `stroke-dashoffset` reveal** — no GIF, no Lottie

## Anti-patterns

- **Don't reach for a JS animation library.** Every effect here is CSS keyframes / transitions + one variable swap.
- **Don't use range sliders for easing.** Easing is discrete (linear / smooth / springy / overshoot). Buttons commit faster than sliders.
- **Don't hide the CSS.** The whole point is the user copies it out.

## Variations

- **For non-easing tuning** (padding, colour, shadow) see recipe `06-component-variant-matrix.md`.
- **For multi-screen interaction prototypes** (not just animation), see recipe `08-interaction-prototype.md`.
