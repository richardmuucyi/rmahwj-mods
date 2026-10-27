# Shared Patterns — the kraft look and the JS patterns

> **The kraft-and-clay look in this file is optional.** The default is a design made for each subject, by `SKILL.md` Step 3 (the Artifact tool's rules: token plan, light and dark, phone width). Use the palette, type and single-file sections below only when the user asks for the "kraft look". The JS micro-patterns, the prompt card and the reply builder apply to every page.

## Contents
- [Palette](#palette)
- [Typography](#typography)
- [Single-file discipline](#single-file-discipline)
- [Eyebrow → H1 → optional prompt-box](#eyebrow--h1--optional-prompt-box)
- [Prompt card](#prompt-card)
- [Severity tri-colour](#severity-tri-colour)
- [Toolbar pattern](#toolbar-pattern)
- [JS micro-patterns](#js-micro-patterns)
- [Hand-rolled syntax highlighting](#hand-rolled-syntax-highlighting)
- [Inline SVG > icon fonts > `<img>`](#inline-svg--icon-fonts--img)
- [Anti-patterns the demos avoid](#anti-patterns-the-demos-avoid)
- [Where this style comes from](#where-this-style-comes-from)

The demos in `thariq-examples/` (20, plus 11 in `unknowns/`) look like a suite because they share a small set of CSS, typography, and JS patterns. Lift these wholesale into any new artefact built with this skill.

## Palette

Five named colours + a 5-stop neutral ramp. **Don't add a sixth family.** If two things both want the accent, one gives it up.

| Token | Hex | Use |
|---|---|---|
| `--ivory` | `#FAF9F5` | Page background |
| `--white` | `#FFFFFF` | Card / panel background |
| `--slate` | `#141413` | Ink — headings, hero text |
| `--clay` | `#D97757` | The ONE saturated accent. Use sparingly. |
| `--clay-d` | `#B85C3E` | Clay darker — hover, pressed |
| `--oat` | `#E3DACC` | Soft fill, secondary chip |
| `--olive` | `#788C5D` | "Good", "safe", "passing" |
| `--gray-150` | `#F0EEE6` | Hover row, very light surface |
| `--gray-300` | `#D1CFC5` | Borders, dividers |
| `--gray-500` | `#87867F` | Meta text, muted captions |
| `--gray-700` | `#3D3D3A` | Body text default |
| `--gray-800` | `#2A2A28` | Code text, secondary heading |

Severity uses the existing colours first. Safe = `--olive`, worth-a-look = `--oat` or `#C8A772`, attention/risky = `--clay`. **One muted red is allowed where a page needs deletions or "high risk" next to a clay accent:** `--rust: #B04A3F`, which is what Thariq's own pages use for deleted diff lines (03) and the high-risk dot (11); the token is declared in 6 of the 20 pages (03, 04, 11, 12, 13, 15), and 12 declares it without using it. *(The source ships one; a diff page needs it.)* Tinted neutrals (`#E6E3DA`, `#E8E6DE`) and tints of clay (`#F3D9CC`, `#FBF1EC`) are fine too. `scripts/audit.sh` warns on blue, purple, cyan and saturated colours instead of failing.

The paste-ready CSS block is `thariq-palette.css` in this folder.

## Typography

System-font stack, three weights of contrast:

```css
--serif: ui-serif, Georgia, 'Times New Roman', serif;
--sans:  system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
--mono:  ui-monospace, 'SF Mono', Menlo, Monaco, monospace;
```

**In the kraft look, never link Google Fonts or any other webfont.** The page must open identically online and offline, from disk and from S3. *(Other pages may use Google Fonts; see `SKILL.md` Step 3.)*

How each font is used:

| Font | Used for |
|---|---|
| **serif** | H1, decorative display numbers, headline-like text |
| **sans** | Body, descriptive prose, button text, table cells |
| **mono** | Eyebrows, dates, stat numbers, file paths, chip values, percentages, kbd hints, badge IDs, code |

**Mono is a tonal device, not just for code.** It's how the artefact says "this is a computed fact, not prose." Reach for mono more than you think — every demo does.

## Single-file discipline (the kraft look)

A kraft-look page is one `.html` file. No exceptions for "small" external assets. *(Other pages may load Google Fonts and pinned CDN libraries; see `SKILL.md` Step 3.)*

- ❌ No `<link rel="stylesheet" href="…">`
- ❌ No `<script src="…cdn…">`
- ❌ No `@import` in `<style>`
- ❌ No webfont `<link>` tags
- ❌ No background-image referencing a separate file
- ✅ Inline `<style>`, inline `<script>`, inline `<svg>`, inline data-URI images if absolutely needed (but prefer SVG)

The premise is: the user double-clicks the file, the browser opens it, everything works. Or they upload it to S3 and share the URL.

## Eyebrow → H1 → optional prompt-box

The canonical masthead pattern. *(Measured: `<h1>` in 20 of 20 demos, `.eyebrow` in 13, `.prompt-box` in 4: 01, 02, 16, 17.)* In the 11 "Know your unknowns" pages the prompt box is always present, has a **Copy prompt** button, and sits above a "What Claude produced" frame; see § Prompt card.

```html
<header>
  <div class="eyebrow">Exploration · Empty states</div>
  <h1>Three ways to render the empty inbox</h1>
  <div class="prompt-box">…verbatim user prompt that produced this artefact…</div>
</header>
```

- **`.eyebrow`** — mono, uppercase, letter-spaced. Categorises the artefact.
- **`<h1>`** — serif, weight 500, tight tracking. Names what the artefact is.
- **`.prompt-box`** — kraft-paper card. Shows the prompt verbatim. Optional but powerful: future-you (or whoever you shared it with) sees exactly what was asked.

CSS for all three: in `thariq-palette.css`.

## Prompt card

*(From Thariq's "Know your unknowns" pages; template: `references/reply-builder.html`.)*

When the artefact answers a prompt, put that prompt at the top, verbatim, with a **Copy prompt** button, and put the result in a frame below it. All 11 "unknowns" pages do this, so a page found next month still says what was asked and can be re-run.

```html
<div class="prompt-card">
  <div class="prompt-label"><span>The prompt</span><button class="btn" id="copy-prompt">Copy prompt</button></div>
  <div class="prompt" id="prompt-text">…the user's words, unedited…</div>
</div>
<div class="frame">
  <div class="frame-bar">blindspot-pass · services/auth · built from the 14 files listed below</div>
  <div class="frame-body">…the artefact…</div>
</div>
```

- **The frame bar says what the page was built from** (files read, commits scanned, sources). Take the numbers from what you actually read, never from a guess: the gallery's "47 files scanned" is fictional and shows the format, not that the count is true.
- Use it for artefacts the user will act on or re-run; skip it for a quick comparison page.

## Severity tri-colour

Three steps, recycled across PR risk (03), status carryover (11), incident severity (12), risk tables (16), triage column urgency (18):

| State | Token | Where it shows |
|---|---|---|
| Safe / passing | `--olive` | "Approved" chip, "no risk" dot, healthy bar |
| Worth a look | `--oat` or `#C8A772` | "Watch this" chip, medium-risk dot |
| Attention / critical | `--clay` | "Needs review" chip, high-risk dot |

Never a four-step scale. Red only as the single muted `--rust` above (deletions, "high"), not as a fourth severity step.

## Toolbar pattern

Sticky top, white card, mono title on the left, primary action button on the right. Used in 02, 06, 18, 19, 20.

```html
<div class="toolbar">
  <div class="title-strip">
    <span class="filename mono">flags.production.json</span>
    <span class="dirty-dot"></span>
  </div>
  <button class="primary">Copy diff</button>
</div>
```

- Knobs live in the toolbar (range inputs, segmented controls)
- The "done" / export button is the rightmost element
- Toolbar stays sticky at the top with `position: sticky; top: 0; z-index: 10;`

## JS micro-patterns

Seven reusable patterns. Reach for these instead of reinventing. Each lives standalone — copy and adapt.

### 1. CSS-variable-as-state-channel

JS writes to `document.documentElement.style.setProperty('--x', value)` and the whole cascade re-themes. Used in demos 02 (light/dark bg), 06 (card padding/border/shadow), 07 (animation easing).

```js
// Wire one range input to one CSS variable, no per-element JS.
const padInput = document.querySelector('#pad');
padInput.addEventListener('input', () => {
  document.documentElement.style.setProperty('--card-pad', padInput.value + 'px');
  document.querySelector('#padReadout').textContent = padInput.value + 'px';
});
```

Then in CSS: `.card { padding: var(--card-pad, 16px); }`. Every card on the page updates.

### 2. Clipboard with `execCommand` fallback + flash() success state

`navigator.clipboard.writeText` is the modern API but it's flaky on `file://`. Fall back to `document.execCommand('copy')`. Then flash a success state on the button so the user sees the click registered.

```js
async function copyText(text, btn) {
  let ok = false;
  try {
    await navigator.clipboard.writeText(text);
    ok = true;
  } catch (_) {
    // execCommand fallback for file:// and old browsers
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    ok = document.execCommand('copy');
    document.body.removeChild(ta);
  }
  flash(btn, ok ? 'Copied ✓' : 'Failed');
}

function flash(el, text) {
  const orig = el.textContent;
  el.textContent = text;
  el.classList.add('flash');
  setTimeout(() => {
    el.textContent = orig;
    el.classList.remove('flash');
  }, 1200);
}
```

Used in demos 10 (download SVG), 18 (copy as markdown), 19 (copy diff / full JSON), 20 (copy prompt).

### 3. Native `<details>` for collapsibles

No JS unless you need to react to the toggle. The browser handles open/close, accessibility, keyboard, all of it.

```html
<details class="step" open>
  <summary>
    <span class="step-num">1</span>
    <code>middleware/ratelimit.ts:21</code>
    <span>Read the IP and route key</span>
  </summary>
  <pre><code>// …code…</code></pre>
  <p>The middleware extracts the rate-limit key…</p>
</details>
```

Style `<summary>` with CSS to control the disclosure triangle and layout. Used in 04 (callstack walkthrough), 14 (feature explainer).

### 4. HTML5 drag-and-drop with one shared `dragging` ref

No library. Vanilla DnD is ~40-60 lines once you handle the drop-indicator and cleanup.

```js
let dragging = null;
const indicator = document.querySelector('#indicator');

document.querySelectorAll('.item').forEach(item => {
  item.draggable = true;
  item.addEventListener('dragstart', e => {
    dragging = item;
    item.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
  });
  item.addEventListener('dragend', cleanup);
});

document.querySelector('.list').addEventListener('dragover', e => {
  e.preventDefault();
  const after = getDropTarget(e.clientY);
  showIndicator(after);
});

document.querySelector('.list').addEventListener('drop', e => {
  e.preventDefault();
  const after = getDropTarget(e.clientY);
  if (after) after.before(dragging); else list.append(dragging);
  cleanup();
});

function getDropTarget(y) {
  const items = [...document.querySelectorAll('.item:not(.dragging)')];
  return items.find(it => {
    const r = it.getBoundingClientRect();
    return y < r.top + r.height / 2;
  });
}

function cleanup() {
  if (dragging) dragging.classList.remove('dragging');
  dragging = null;
  indicator.classList.remove('on');
}
```

Used in 08 (reorder list) and 18 (between columns — extend `drop` handler to detect which column).

### 5. SVG download via `XMLSerializer → Blob → object URL`

For "export this figure" buttons. Works for any inline SVG.

```js
function downloadSvg(svgEl, filename) {
  const serializer = new XMLSerializer();
  const source = serializer.serializeToString(svgEl);
  const blob = new Blob([source], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
```

Used in 10. Reusable for any "export this element" need — change MIME type and you can export HTML fragments, JSON, etc.

### 6. Caret-preserving contenteditable re-highlight

When the user types in a contenteditable that you're re-templating (e.g. to colour `{{variable}}` slots), the caret jumps to position zero unless you preserve it. Record the offset before the re-render, restore after.

```js
function getCaretOffset(root) {
  const sel = window.getSelection();
  if (!sel.rangeCount) return 0;
  const range = sel.getRangeAt(0).cloneRange();
  range.setStart(root, 0);
  return range.toString().length;
}

function setCaretOffset(root, offset) {
  let node, remaining = offset;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  while ((node = walker.nextNode())) {
    if (remaining <= node.textContent.length) {
      const sel = window.getSelection();
      const range = document.createRange();
      range.setStart(node, remaining);
      range.collapse(true);
      sel.removeAllRanges();
      sel.addRange(range);
      return;
    }
    remaining -= node.textContent.length;
  }
}

function refreshEditor() {
  const offset = getCaretOffset(editor);
  editor.innerHTML = highlightHtml(getPlainText(editor));
  setCaretOffset(editor, offset);
}

editor.addEventListener('input', refreshEditor);
editor.addEventListener('paste', e => {
  e.preventDefault();
  const text = (e.clipboardData || window.clipboardData).getData('text/plain');
  document.execCommand('insertText', false, text);
});
```

Used in 20 (prompt tuner). Most artefacts don't need this — but when a template editor must keep the caret in place while re-highlighting on every keystroke, this is the pattern.

### 7. Reply builder: choices write the message back to the agent

*(Template: `references/reply-builder.html`; regression test: `evals/test_reply_builder.py`.)*

Patterns 2 and 6 export **data** (markdown, a diff, a template). This one exports a **reply**: the user's picks, chips and ticks compile into a paste-ready message to the agent, so the page ends in "here is what I decided" instead of a screenshot and a re-explanation. Thariq's pages 03 (pick a direction, steal or skip details), 04 (A/B/C/D layout calls), 05 (tick what resonates), 06 (interview, ends in a decisions table and follow-up prompt) and 07 ("semantics confirmed" or a correction template) all end this way.

- **State lives in a JS object**, and `buildReply()` renders the reply from it on every change. Don't read the reply back out of the DOM.
- **Pick one empty-state policy:** *preselect* a sensible default so the reply is never empty (03), or *start empty*, disable Copy and say what to do (05).
- End the reply with the next instruction ("Then build the real page in …") so the paste is actionable on its own.
- Reuse pattern 2's `copyText()`; the test checks both the clipboard API and the `execCommand` path.

## Hand-rolled syntax highlighting

Five span classes max. No Prism, no highlight.js, no language detection.

```html
<pre><code><span class="kw">function</span> <span class="fn">render</span>() {
  <span class="kw">const</span> data = <span class="str">"foo"</span>;
  <span class="dim">// short comment</span>
}</code></pre>
```

Colours in `thariq-palette.css`. Used in demos 01, 04, 06, 14, 17. Authored by hand at write-time — the agent is the one classifying tokens. Side benefit: the colours stay on-palette without an external highlighter dragging in some unrelated theme.

## Inline SVG > icon fonts > `<img>`

Every diagram, illustration, mini-chart in the suite is hand-laid inline SVG.

- **Boxes and arrows** (demos 04, 13, 16) — explicit `<rect>` + `<text>` + arrowhead via `<defs><marker>`
- **Mini bar chart** (11) — five `<rect>` elements
- **Interactive figures** (15) — `<g>` groups + path-string math, no library
- **Decorative illustrations** (10) — simple shapes on the palette

Don't pull in D3, Chart.js, or Mermaid. The hand-laid versions are 30-100 lines, stay on-palette, and ship in one file. The cost of "auto-layout" is losing the deliberate placements that make the artefact readable.

## Anti-patterns the demos avoid

Worth a quick read before authoring. These are tempting and wrong:

- **Tailwind via CDN in the kraft look.** Breaks single-file discipline; pulls in an unrelated colour family; large download.
- **A JS framework.** No React, no Vue, no Svelte. The artefact is throwaway — render with `innerHTML` and event listeners.
- **DOM-as-state.** Hold state in a JS variable (array, object), re-template the DOM on change. Don't read state back out of the DOM with `querySelector(...).textContent`.
- **Persisting to backend.** These are throwaway. The export button (copy as markdown / copy JSON) closes the loop.
- **Animation libraries.** GSAP, Lottie, Framer Motion — all overkill. CSS transitions + a `--ease` variable cover 90% of needs.
- **Mermaid for flowcharts.** Auto-layout flattens the meaning. Hand-place the SVG.
- **Bright reds for danger.** Use `--clay`; where a diff or a "high" marker needs a red, use the one muted `--rust`. Saturated reds clash with the kraft palette and pull the eye too hard.
- **Sentence case on eyebrows.** Eyebrows are mono uppercase. The demos are consistent on this.

## Where this style comes from

Thariq's piece, *"Using Claude Code: The Unreasonable Effectiveness of HTML"* — May 2026. The 20 demos at `https://thariqs.github.io/html-effectiveness/` (and 11 more under `unknowns/`) are the canonical implementations. They were authored by Claude under Thariq's direction; the consistency across them is deliberate. See `thariq-html-rationale.md` for the case in full.
