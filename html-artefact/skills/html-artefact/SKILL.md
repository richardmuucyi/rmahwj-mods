---
name: html-artefact
description: >-
  User-invoked (type /html-artefact, or /html-artefact:html-artefact when installed as a plugin). Builds one HTML page as the output of a thinking job: compare options,
  review code, tune with knobs, drag tickets, edit flags or prompts, slide deck, annotated flowchart, or a
  one-concept explainer. Designed per subject, light and dark, phone width. NOT for production UI
  (`frontend-design`), flashcards, or a notes page that consolidates everything known on a topic.
disable-model-invocation: true
---

# HTML Artefact

**User-invoked** *(type `/html-artefact <what the page is for>`; the model does not call it by itself)*. Produce a single HTML file for a specific thinking job — comparing options, reviewing code, tuning an animation, dragging tickets, explaining a concept. **It is built the way the Artifact tool builds a page** *(rules taken from the Artifact design guidance; see Step 3)*: a design made for the subject, light and dark themes, phone width, a real title. The kraft-and-clay look of Thariq's reference pages is an optional "kraft look". Save the page in the current folder, or in a folder the user names; it is opened locally or uploaded to static hosting (e.g. S3) to share.

Script paths in this file (`scripts/...`, `evals/...`, `references/...`) are relative to this skill's folder.

The premise comes from Thariq's *"The Unreasonable Effectiveness of HTML"* (May 2026). Markdown caps out at ~100 lines of readability; HTML has tables, SVG, interactive controls, and shareable URLs. For artefacts a human will actually read, HTML wins. See `references/thariq-html-rationale.md` for the case in full.

This skill is one of two HTML producers; pick correctly:

| Skill | When |
|---|---|
| **`html-artefact`** | One-off artefact for a specific task — comparing, reviewing, tuning, editing. Recipes 14 and 15 are the one-concept explainers. For learning, make one page per concept and keep it short (the reference explainers run 370 to 550 words). |
| `frontend-design` | Production frontend code with high design-quality opinion |

## What this skill is not

- The artefact is going to live forever as documentation → markdown for spec docs that live with code.
- The output is real production UI → `frontend-design`.
- The user wants something they'll edit in plain text continually → markdown.
- The job is "explain X in chat" → just answer in chat.

## The workflow

### Step 1 — Identify intent, pick a recipe

The skill ships 24 recipes *(the first 20 are Thariq's; 21 is ours; 22–24 are ours, built on his "Know your unknowns" pages)* — one per common artefact shape. Read the user's ask and the `references/recipes/` index below; pick the recipe whose intent matches. If the ask doesn't match a recipe cleanly, improvise from the closest one and design the page by Step 3.

Reference HTML filenames follow the pattern `NN-<slug>.html` inside `references/thariq-examples/` — the slug is the artefact type, not the recipe title (e.g. recipe 01 "Side-by-side code approaches" → `01-exploration-code-approaches.html`). The full mapping is in the table below.

| # | Recipe | Intent | Reference HTML |
|---|---|---|---|
| 01 | [Side-by-side code approaches](references/recipes/01-side-by-side-code-approaches.md) | Three (or N) ways to solve one problem, with trade-offs | `01-exploration-code-approaches.html` |
| 02 | [Visual design directions](references/recipes/02-visual-design-directions.md) | N live mini-renders of one component, side by side | `02-exploration-visual-designs.html` |
| 03 | [Annotated pull request](references/recipes/03-annotated-pull-request.md) | Diff as web page — risk map, inline annotations | `03-code-review-pr.html` |
| 04 | [Module map](references/recipes/04-module-map.md) | SVG flow diagram + numbered callstack walkthrough | `04-code-understanding.html` |
| 05 | [Living design system](references/recipes/05-design-system.md) | All tokens + components on one page | `05-design-system.html` |
| 06 | [Component variant matrix](references/recipes/06-component-variant-matrix.md) | One component × every state × live knobs | `06-component-variants.html` |
| 07 | [Animation sandbox](references/recipes/07-animation-sandbox.md) | Motion in isolation with easing presets, copy CSS | `07-prototype-animation.html` |
| 08 | [Interaction prototype](references/recipes/08-interaction-prototype.md) | Working DnD / interaction at fidelity, not a wireframe | `08-prototype-interaction.html` |
| 09 | [Arrow-key slide deck](references/recipes/09-slide-deck.md) | Presentation as one HTML file, keyboard nav | `09-slide-deck.html` |
| 10 | [SVG figure sheet](references/recipes/10-svg-figure-sheet.md) | Inline SVG illustrations with download-each buttons | `10-svg-illustrations.html` |
| 11 | [Weekly status report](references/recipes/11-status-report.md) | Skimmable Monday-morning update with mini chart | `11-status-report.html` |
| 12 | [Incident timeline](references/recipes/12-incident-timeline.md) | Post-mortem with vertical timeline + sticky TOC | `12-incident-report.html` |
| 13 | [Annotated flowchart](references/recipes/13-annotated-flowchart.md) | Real flowchart, click-any-node for details | `13-flowchart-diagram.html` |
| 14 | [Feature explainer](references/recipes/14-feature-explainer.md) | One feature, TL;DR + collapsible request path + tabbed config | `14-research-feature-explainer.html` |
| 15 | [Concept explainer](references/recipes/15-concept-explainer.md) | Abstract concept with a live interactive figure | `15-research-concept-explainer.html` |
| 16 | [Implementation plan](references/recipes/16-implementation-plan.md) | Milestones + data flow + mockups + risks for handoff | `16-implementation-plan.html` |
| 17 | [PR writeup for reviewers](references/recipes/17-pr-writeup.md) | Author's side — motivation, file-by-file why, focus guidance | `17-pr-writeup.html` |
| 18 | [Triage / Kanban board](references/recipes/18-triage-board.md) | DnD between columns, export current state as markdown | `18-editor-triage-board.html` |
| 19 | [Feature flag editor](references/recipes/19-feature-flag-editor.md) | Toggles + dependency warnings + diff/full copy buttons | `19-editor-feature-flags.html` |
| 20 | [Prompt tuner](references/recipes/20-prompt-tuner.md) | Template editor + N live filled previews + copy template | `20-editor-prompt-tuner.html` |
| 21 | [One-sheet reference](references/recipes/21-one-sheet-reference.md) | Facts to look things up in, drawn as an engineering-drawing sheet: frame, lettered panels, one drawing per fact type, title block | `references/examples/21-one-sheet-reference.html` (not Thariq's) |
| 22 | [Blindspot pass](references/recipes/22-blindspot-pass.md) | Before changing code you have never touched: findings that state the surprise, with evidence; tick the ones you want and they fold into one better prompt | `thariq-examples/unknowns/01-blindspot-pass.html` |
| 23 | [Interview](references/recipes/23-interview.md) | One question at a time about an ambiguous feature, ordered by blast radius; ends in a decisions summary and a brief to paste back | `thariq-examples/unknowns/06-interview.html` |
| 24 | [Change quiz](references/recipes/24-change-quiz.md) | Before you merge: a short report, then a quiz you must pass; a pass and a miss both end in a reply to paste | `thariq-examples/unknowns/11-change-quiz.html` |

Each recipe file has: example prompt, standard section order, interactive bits, JS patterns to copy, anti-patterns, and a pointer to the canonical reference HTML at `references/thariq-examples/NN-...html`. Open the reference HTML in a browser before writing to see what the target looks like. **A recipe and its reference page give the job's shape — sections, interactions, JS — not its look.** The reference pages wear the kraft look; take their structure and design the skin in Step 3, unless the user asked for the kraft look.

**When the real need is to find out what the user hasn't thought of yet** *(recipes 22–24 cover pages 01, 06 and 11; the rest are pages only)* — before, during or after building — the match is one of Thariq's 11 "Know your unknowns" pages in `references/thariq-examples/unknowns/` (exact prompts, endings and notes in its `README.md`): **before** 01 blindspot pass · 02 teach me the vocabulary · 03 four design directions on the same data · 04 mock before wiring · 05 brainstorm ten interventions · 06 interview me · 07 reference port (prove you understood it) · 08 plan sorted by what I'd tweak; **during** 09 implementation notes; **after** 10 buy-in doc · 11 quiz before merge. Open the matching page, then author the new one in that shape: a prompt card on top (`shared-patterns.md` § Prompt card) and an ending the user can paste back to you (§ 7 Reply builder).

### Step 2 — Establish the artefact's outputs

Before writing, decide:

1. **What does the user do with this when they're done?** Copy a result out (clipboard), screenshot it, share the URL, print it, refer back? The artefact's last UI element should make that "done" action one click — a "Copy as markdown" button, a print stylesheet, a final "rationale" panel that's screenshottable.

2. **What's the throwaway-vs-keep verdict?** Throwaway = no persistence, no real backend pretence. Keep = could be served from S3 forever. Both are valid; the recipe will say which fits.

3. **Single-file or single-folder?** Default: one `.html` file with embedded CSS and JS. Remote loads are limited to what Step 3 allows (Google Fonts, pinned CDN libraries). If the user wants images, inline them as SVG or base64 — keep one file unless they explicitly ask for a folder.

### Step 3 — Design the page *(from the Artifact design guidance)*

You are the design lead of a small studio: give this subject its own identity, at the level of treatment the job calls for. **Precedence: the user's words, then the project's existing design system (CLAUDE.md, a tokens or theme file), then your choices.**

1. **Pick the treatment.** Most pages are *utilitarian* (a plan, a comparison, a review tool, a status page): polished, with real type hierarchy and spacing, but no giant hero. A page the user will keep or share (a landing page, a game, a tool) is *editorial*: take one real aesthetic risk and keep everything around it quiet. If unsure, a well-composed page beats an over-designed one.
2. **Write a token plan first, in the file.** The `:root` block at the top of `<style>` holds 4 to 6 named colour tokens, font tokens for 2 or more roles (a display face used with restraint, a body face, a utility face for data), and a one-line comment naming the layout concept. Build every rule from those tokens. Do not repeat the plan in chat; one plain sentence on the direction is the most to say.
3. **Ground it in the subject.** One concrete subject, its audience, the page's single job. Include at least one detail only this subject has: its real units, document conventions or terms of art. Use real content, never lorem ipsum. Before building, check the plan: if any part reads like the default you would use for any similar page, change it.
4. **Both themes, built from tokens.** Every colour is a token with its first definition on bare `:root`. Then:
   ```css
   @media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) { --bg: …; color-scheme: dark } }
   :root[data-theme="dark"] { --bg: …; color-scheme: dark }
   body { background: var(--bg); color: var(--fg) }
   ```
   `body` sets an explicit background from a token. No component rule uses a literal colour that reads in one theme only. The dark theme is designed, not inverted. A deliberate single look (a neon arcade, a letterpress card) may drop the dark blocks, but still sets the background and every colour explicitly.
5. **Phone width.** A 16px side gutter at every width (side padding on `body` or one wrapper; use `padding-block` for vertical). Rows wrap or stack at about 400px. Flex and grid children that hold text, code or a table get `min-width: 0`. Only tables, code and diagrams may be wider, each in its own `overflow-x: auto` box. Images get `max-width: 100%`. Use `gap` for spacing, not per-element margins.
6. **Type.** Pair faces deliberately; keep running text near 65 characters wide; set a type scale and keep to it; `text-wrap: balance` on headings; letter-spacing on uppercase labels; `font-variant-numeric: tabular-nums` where digits line up. Use `ui-monospace` for computed facts if it fits.
7. **Page complete at rest.** Everything meant to be read is visible on load. A section may animate in, but from a visible resting state, never left at `opacity: 0` waiting for an observer. Size a hero to its content, not to `100vh`. A tool opens in a realistic working state with marked example data, never an empty shell.
8. **Avoid the AI looks** unless the user asks for one: warm cream (`#F4F1EA`) with a serif and a terracotta accent; near-black with one acid-green or vermilion pop; broadsheet hairline rules; a purple-to-blue gradient hero; Inter or Space Grotesk as the "safe" face; emoji as section markers; everything centred; `rounded-lg` on everything; an accent bar on rounded cards. *(The kraft look below sits in this list on purpose: ask for it by name.)*
9. **Craft.**
   - Neutrals are chosen: tint the greys toward the accent.
   - Card styling (border, fill, radius, shadow) goes only where one element must stand apart.
   - Repeated elements share edges, baselines and padding; text that can outgrow its track wraps or scrolls.
   - Charts are drawn to scale with one scale, labels in theme tokens, room in the `viewBox` for the outer labels, an explicit fill on every shape.
   - Numbered markers and eyebrows only when the content really is a sequence.
   - A dashboard or tool puts the summary before the detail and shows state as a pill, chip or stripe, with semantic colours kept apart from the accent.
   - Visible keyboard focus, `prefers-reduced-motion` respected, stable `id` on every form control, every non-void element closed.
   - Watch selector specificity so two classes do not cancel each other's spacing.
10. **Copy.** Name things the way the reader does. Active voice. A control says what it does ("Publish"). Errors say what went wrong and how to fix it. Plain, specific, short sentences. Avoid em-dash asides, "not X but Y", colon-then-reveal sentences, scare quotes and stock phrases.
11. **Title.** `<title>` is a name, two to four words, specific to the subject (or the page's one question). Never "Name: explainer" and never a bare category word. When the user already has a name for the thing, use it.

**What may load from outside** *(same list as the Artifact tool, so the page can also be published there)*:
- Fonts: a Google Fonts `<link>` (`fonts.googleapis.com`, files from `fonts.gstatic.com`), always with a real fallback stack.
- Libraries: only when one does substantial work (React, a chart package). One `<script src>` per library, UMD build, from `cdnjs.cloudflare.com` (preferred), `cdn.jsdelivr.net/npm/`, `unpkg.com`, `cdn.tailwindcss.com` or `code.jquery.com`, **pinned to an exact version at least two weeks old** (`react/18.3.1`, never `react`, `react@18` or `@latest`), placed before the inline script that uses it.
- Everything else (CSS, images, data) is inline or a `data:` URI. A page that loads a font or library needs internet to look right; say so when you hand it over.
- If the page may later be published as an Artifact: no print button, no `alert`/`confirm`/`prompt`, no `mailto:` as the only way to reach someone, and no file download links.

**Local-file extras** (the Artifact tool wraps its pages; here you write the whole document): start with `<!doctype html>`, `<meta charset="utf-8">`, `<meta name="viewport" content="width=device-width, initial-scale=1">` and a `<title>`. Copy buttons use `navigator.clipboard.writeText` inside the click handler, with the `execCommand('copy')` fallback for `file://`.

**The kraft look (optional, on request: "kraft look", "kraft", "Thariq style")** — the house style of Thariq's reference pages, kept for pages that should match them: paste `references/thariq-palette.css` (ivory `#FAF9F5`, ink `#141413`, one clay accent `#D97757`, oat/olive/grey ramp), `ui-serif` headings, `system-ui` body, mono for computed facts, no webfonts, no CDN, one file that opens from disk, hand-drawn SVG, hand-rolled syntax highlighting, one-accent discipline. It has no dark theme by design, so it counts as a deliberate single look. Audit it with `--kraft-look`. Details: `references/shared-patterns.md`.

### Step 4 — Use the reusable JS micro-patterns

A handful of patterns recur across the demos. Reach for these instead of reinventing:

- **CSS-variable-as-state-channel** — JS writes to `document.documentElement.style.setProperty('--x', value)` and the whole cascade re-themes. Used in 02, 06, 07.
- **Clipboard with execCommand fallback + `flash()` success state** — wrap `navigator.clipboard.writeText` with an `execCommand('copy')` fallback for `file://`. Pop a "Copied ✓" flash on the button. Used in 10, 18, 19, 20.
- **Native `<details>` for collapsibles** — no JS unless the toggle event needs to trigger something. Used in 04, 14.
- **HTML5 drag-and-drop with one shared `dragging` ref** — no library, ~40 lines of vanilla. Used in 08, 18.
- **SVG download via `XMLSerializer` → `Blob` → object URL** — for "export this illustration." Used in 10; reusable for any "export this element" need.
- **Caret-preserving contenteditable re-highlight** — record caret offset before re-render, restore after. ~50 lines. Used in 20.
- **Reply builder** — the user's picks, chips and ticks compile into a paste-ready reply to you, so the page ends in "here is what I decided" rather than a screenshot. State in a JS object; either preselect so the reply is never empty, or start empty and disable Copy. Template: `references/reply-builder.html`. Used in the "unknowns" pages 03, 04, 05, 06, 07.

Code samples and exact line counts: `references/shared-patterns.md` §JS micro-patterns.

### Step 5 — Write the file

One `.html` file: `<!doctype html>`, `<head>` (charset, viewport, `<title>`, then `<style>` starting with the token plan from Step 3), body, optional `<script>`. No build step. Save it in the current folder, or in the folder the user names.

Naming: kebab-case slug describing the artefact's *job*, not its shape. `oauth-flow-options.html` beats `comparison.html`; `cycle-14-triage.html` beats `kanban.html`.

**Write, check once, publish.** Run the audit (Step 6). Then look at the page once, at desktop width and at 400 px, in light and in dark (a headless-browser screenshot, if a headless browser such as Playwright is available). Make one pass of edits for what the look shows, then hand it over. No second look unless the user reports something visibly broken. A page that charts real numbers is the exception: take the look, and spend it on the chart. A page whose point is logic (dates, money, scoring, parsing) gets one run of a pure function on a sample input.

### Step 6 — Quick self-audit

Run `scripts/audit.sh`. It checks, in one pass:

1. **[1] Loads — the one hard check.** Remote loads fail unless they are Google Fonts or a pinned script from the five CDNs in Step 3. Relative files fail unless the page is deliberately a folder (`--folder`). A page that needs a font or library from the network passes but says so.
2. **[2] Palette — only with `--kraft-look`.** Colours stay in the kraft-look families. A warning means "on purpose?", and blue or purple is fine when it is load-bearing (a status, a chart series, a design-direction mock).
3. **[3] `display:none`.** Each one should be a toggle target, not dead content.
4. **[4] Page contract — warnings only.** A name-style `<title>`, a viewport meta, a dark theme, colour tokens on `:root`, a `body` background, no `100vh` opener.

```bash
bash scripts/audit.sh "<slug>.html"
bash scripts/audit.sh "<slug>/index.html" --folder   # a deliberate folder page
bash scripts/audit.sh "<slug>.html" --kraft-look     # the optional kraft look
```

Exit 0 means no hard failure; exit 1 means a load that is not allowed. The script reads the page as HTML/CSS (`scripts/audit_lib.py`), so a PR number such as `#4888` is not mistaken for a colour. Only hex colours are checked, not `rgb()` or named colours. `evals/test_audit.py` is its regression test.

Then check by hand what the script cannot see:
- **No hidden orphan content.**
- **The "done" action works.** If there is a copy button, does the buffer hold what the user expects? If there is an export, does it export?
- **Opens cleanly from `file://`.** No fetches to relative URLs; no assumed http origin.
- **Both themes are legible** and the accent works on both backgrounds.

### Step 7 — Offer to open

Open it for the user with the platform's open command, the path in quotes: `start "" "<slug>.html"` on Windows, `open "<slug>.html"` on macOS, `xdg-open "<slug>.html"` on Linux. `open` does not exist in the Windows shell. If the artefact has interactive controls, mention them. If it has a copy-out button, mention where it is.

## Ops hygiene

The rules:

- **Never hide content via CSS** when restyling — migrate or delete.
- **Verify renders over HTTP, not `file://`** when iterating — start `python -m http.server` (`python3` on macOS) and visit with a cache-bust query (`?v=$(date +%s)`). After it's done, opening the `file:///` URL (Step 7) is fine.
- **Optimise for someone reading / using it once.** These are throwaway artefacts most of the time. Front-load the punch, kill background sections that don't pay off.
- **HTML diffs are noisy.** Don't try to edit a generated artefact in place across many sessions — regenerate.

## Why this skill exists

Thariq's piece argues that HTML is underused as an agent output format. Once you stop thinking of artefacts as "documents to read" and start thinking of them as "throwaway interfaces to do a job in," a whole class of tasks gets easier: comparing options visually, tuning a value with a knob, dragging tickets, walking a reviewer through a PR. This skill is the operational playbook for that shift. It bundles Thariq's 20 reference HTMLs (and 11 more under `unknowns/`), carries the Artifact tool's design rules (Step 3), and indexes recipes by intent so the right pattern is one lookup away.

It deliberately stays separate from `frontend-design` (which produces production UI with stronger design opinion). When the artefact's job is "help a human do one specific thing once," this is the skill.

## Reference

- `references/thariq-html-rationale.md` — the case for HTML over markdown, distilled from Thariq's piece. Read this once.
- `references/shared-patterns.md` — the kraft look (palette, typography, single-file rules; optional), the 7 reusable JS micro-patterns (the 7th is the reply builder), the prompt card.
- `references/reply-builder.html` — paste-ready template for the prompt card and the reply builder; `evals/test_reply_builder.py` tests it.
- `references/thariq-examples/unknowns/` — 11 further Thariq pages ("Know your unknowns"), with a `README.md` of their exact prompts.
- `references/thariq-palette.css` — paste-ready CSS variables block for the optional kraft look (palette + fonts + base ramp).
- `references/recipes/NN-<slug>.md` — 24 recipe files indexed by intent. Each has example prompt, sections, JS patterns, anti-patterns, reference HTML path.
- `references/examples/NN-<slug>.html` — reference pages that are **ours**, not Thariq's (recipe 21 so far). Audited with `scripts/audit.sh` like any artefact.
- `references/thariq-examples/NN-<slug>.html` — 20 downloaded reference HTMLs from Thariq's gallery. Open in a browser when starting a new artefact to anchor on the target look. Plus `index.html` (Thariq's gallery page itself) and `README.md` (provenance + license).
- `evals/evals.json` — test cases for the skill.
