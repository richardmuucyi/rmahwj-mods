# 09 — Arrow-key slide deck

**Category:** Decks
**Reference HTML:** `references/thariq-examples/09-slide-deck.html`
**JS:** Light — one `keydown` handler + `go(index)` function

## Intent

A whole presentation as one HTML file. Left/right/space to navigate, no Keynote, no build step. Drop in a Slack thread or design doc and someone arrow-keys through it in the meeting.

## Example prompt

> Turn this status update into a deck. One slide per beat — title, three things shipped, what's carrying over, the numbers, the one decision we need to make, what's on deck. Arrow keys to navigate, no Keynote.

## Standard sections (in order)

Each slide is `<section class="slide">`. One slide active at a time. Typical sequence:

1. **Title slide** — centred serif H1 + date in mono
2. **Three things shipped** — `.ship-dot` bulleted list with project tiles
3. **Carrying into next week** — progress bars (`.prog-track` / `.prog-fill` / `.prog-pct`)
4. **Numbers we watch** — large stat callouts in serif with mono labels
5. **One decision to make** — single `.decision-card` framing the open question
6. **On deck** — closing slide naming what comes next

## Interactive elements

- **`ArrowRight` / `ArrowDown` / `Space`** advance
- **`ArrowLeft` / `ArrowUp`** reverse
- **Dot pagination** at the bottom indicates current slide (clickable optional)
- Optional: `f` for fullscreen

## JS patterns to copy

```js
let i = 0;
const slides = document.querySelectorAll('.slide');
function go(next) {
  i = Math.max(0, Math.min(slides.length - 1, next));
  slides.forEach((s, idx) => s.classList.toggle('active', idx === i));
  document.querySelectorAll('.pagination-dot').forEach((d, idx) =>
    d.classList.toggle('on', idx === i));
}
document.addEventListener('keydown', e => {
  if (['ArrowRight','ArrowDown',' '].includes(e.key)) { e.preventDefault(); go(i + 1); }
  if (['ArrowLeft','ArrowUp'].includes(e.key))       { e.preventDefault(); go(i - 1); }
});
```

~30 lines total. No router, no state framework.

## Distinctive styling

- **Each `<section class="slide">` is full-viewport** (`min-height: 100vh`), centred content
- **Progress bars are flat clay fills** on a kraft-paper track — no gradients
- **Pagination dots in mono**, current slide marked with `var(--clay)`

## Anti-patterns

- **Don't pull in reveal.js or impress.js.** Twenty lines of JS replaces them and stays on-palette.
- **Don't put speaker notes on the slide.** This isn't Keynote with a presenter view. If notes are needed, put them after the slides as a printable appendix.
- **Don't add slide transitions.** Snap between slides — animation gets in the way of skim-and-skip.

## Variations

- **Slideshow of a status report** — content is the same as recipe `11-status-report.md`, but each section becomes a slide
- **Slideshow of a post-mortem** — pair with recipe `12-incident-timeline.md` for the deep-read version, deck for the meeting
