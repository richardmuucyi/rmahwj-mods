---
name: mermaid-visual-review
description: Use when the user wants to review, polish, improve, clean up, or fix a mermaid diagram (flowchart / sequence / state diagram, in a `.md` block, `.mmd` file, or inline) — including a themed render for stakeholders.
---

# Mermaid Visual Review

## When this skill applies

The user has a mermaid diagram (flowchart, sequence, state, class, er, gantt, pie, journey, c4, mindmap, timeline, quadrant, sankey, xyChart, block) and wants it polished. The diagram lives in one of:
1. A fenced ```mermaid block inside a `.md` file
2. A standalone `.mmd` file
3. Inline mermaid text in the conversation

The user's request may be explicit ("review this mermaid") or implicit ("clean this up before I paste it into the spec").

## Workflow guardrails

These rules exist because the skill has been bypassed before in ways that produced broken or unreviewed output. Treat them as load-bearing — each one has a concrete failure mode behind it.

- **Prompt discipline.** Steps 0, 5, and 6 each contain a user-facing prompt. Surface every prompt and wait for an explicit answer. Do not auto-pick a theme, auto-answer, or skip a prompt because a downstream action ("upload to Drive") seems to imply the choice. The user — not the agent — decides what artifacts land where.
- **Quick-mode exception.** If the user's invocation contains a quick-mode signal — *"quick review"*, *"just iterate"*, *"polish only"*, *"no stakeholder render"*, *"skip theme prompt"* — set `stakeholder_render = false` and skip the Step 0 prompt only. Steps 5 and 6 still prompt normally. Quick mode means "no stakeholder render at all", **not** "auto-pick a theme and render anyway".
- **Phase B non-skip rule.** See the Pre-completion verification gate in Step 4 for the canonical statement and the rationale. Summary: if `stakeholder_render` resolved to a theme, Phase B must run — use a quick-mode signal at invocation to opt out, not a mid-flow judgement call.
- **Batch mode runs the full workflow per diagram.** If the user asks to process N diagrams, Step 0 can be answered once for the batch (e.g. "use zinc-light for all"), but Steps 2 (pre-flight), 3 (iteration loop, including Phase B), and 4 (write-back) must run independently for each diagram. A bulk-render script that skips per-diagram Phase B review defeats the purpose of this skill.

### Step 0 — Capture user preferences upfront

Front-loading this prevents mid-workflow interruptions and keeps the user in control of whether a stakeholder render runs.

**Bypass:** if the invocation carried a quick-mode signal (see Workflow guardrails), set `stakeholder_render = false` and proceed straight to Step 1. Next invocation without the signal runs this step in full.

1. **Verify the render toolchain.** The skill renders via the pinned local toolchain at `scripts/toolchain/target/`. If it is missing, `render.sh` exits 3 with an install hint — run `bash <skill>/scripts/toolchain/install.sh` once (idempotent). Do not prompt the user.
2. **List available themes.** Each `themes/*.json` file is a usable theme name (filename minus `.json`).
3. **Ask the user:**

   ```
   → Stakeholder render at the end?
       After review is clean, the source can be re-rendered with a theme — better
       typography, cleaner palette, suitable for spec docs and decks.

       Available themes: zinc-light (light, slate-grey edges, beautiful-mermaid lineage), zinc-dark

   Reply with one of:
     "skip"            — no stakeholder render; Phase A baseline is the deliverable
     "decide later"    — re-prompt after review finishes
     "<theme>"         — render with this theme (e.g. "zinc-light")
   ```

4. **Parse and store as `stakeholder_render`:**
   - `skip` / `no` / `none` → `false`
   - `decide later` / empty → `defer` (re-prompt after Step 5)
   - `<theme>` → `{theme: "<name>"}` if `themes/<name>.json` exists; otherwise re-ask.

**Never silently default to a theme.** If the user did not commit, stakeholder render either runs with their deferred choice or does not run at all.

### Step 1 — Ingest

Detect the input shape:
- Path ends in `.md` → markdown file with embedded mermaid block(s)
- Path ends in `.mmd` → standalone mermaid file
- Text starts with a mermaid keyword and no path is given → inline

For `.md` files, run `scripts/extract_blocks.py <path>`. Each block carries `index`, `start_line`, `end_line`, `diagram_type` (raw mermaid keyword), `reference_basename` (the file under `references/diagram-types/` to read, or `null` if no per-type catalogue exists), `title`, and `source`.

If the caller passed a `block_index`, use it directly. Otherwise: one block → use it; two or more → list them with `index`, `diagram_type`, `title`, `start_line` and ask which to review. Wait for the answer.

Remember the origin (file path + line range, or `.mmd` path, or `inline`). Every later step writes back to this origin.

### Step 2 — Pre-flight

Before the iteration loop:

1. **Title rule.** If the mermaid source lacks a `---\ntitle: …\n---` frontmatter at the very top (before any init block), insert one. Title inference order:
   - `.md` block → nearest markdown heading above the block; fall back to `Untitled <type> diagram`.
   - `.mmd` file → filename stem, humanised (replace `-`/`_` with space, title case).
   - inline → `Untitled <type> diagram`.
2. **Sanity render.** Call `scripts/render.sh <tmp.mmd> <tmp.png>` once to verify the source is valid. If render fails, report the error and the source — do not enter the iteration loop on broken input.

> **Note on flowchart curve.** Curve choice (`basis` / `step` / `linear`) is a design call evaluated in Phase A — see `Edge curve doesn't match diagram intent` in `common-issues.md`. If the source already sets a curve, the author's choice is preserved.

### Step 3 — Iteration loop

**Total budget: 5 iterations** = up to 4 Phase A passes + 1 Phase B pass.

- **Phase A (structural audit, ≤ 4 iterations).** Render naked (no theme). On the first pass read `references/common-issues.md` and, if it exists and is not a stub, `references/diagram-types/<reference_basename>.md` — once per run, not once per pass. Walk the catalogue against the rendered PNG. Apply fix recipes from `references/known-good-fixes.md` by `fix_key` (grep the key; do not read the whole file). Re-render. Stop when the CRITICAL list is empty.
- **Phase B (aesthetic refinement, exactly 1 pass when a theme was chosen).** Re-render with the theme injected via `merge_theme.py`. Dispatch the fresh-eyes reviewer (see *Using the reviewer subagent*). Apply any CRITICAL fixes once. Re-render; do not re-dispatch. (Non-skip rule: see the Pre-completion verification gate below.)

**Stop conditions:** success when Phase A is clean and Phase B is satisfied or unrequested. A fix that breaks the render: revert to the last version that rendered and do not repeat that fix; two consecutive render failures in Phase A abort the loop (revert, report the failing excerpt). At 5 rounds, write the last-known-good version and flag unresolved CRITICAL items prominently. `references/iteration-loop.md` holds the same rules as pseudocode; read it only for a case not covered here.

### Step 3b — Truth review (only when the source declares its facts)

The visual passes cannot see a wrong claim — a picture can be perfectly drawn and say something
false. When the author has declared the diagram's facts with `%% SOURCE:` lines (the mermaid
form of d2-diagram's `# SOURCE:` block), check the picture against them:

```
%% SOURCE: <claim> = <where it comes from: a quote, file:line or URL>
%% SOURCE-EXEMPT: <deliberate generics, not checked>
%% NOT CLAIMED: <left out on purpose, and why>
```

1. Run `python <skill>/scripts/truth_inputs.py <final.mmd> <final.svg>` on the final source and
   its final render (themed if Phase B ran). If `run_truth_review` is false, record
   **"skipped — no %% SOURCE lines"** and go to Step 4. No SOURCE line, no pass: a review
   against the author's own model checks nothing.
2. Fill `agents/truth-reviewer.md` from that JSON and dispatch it via the `Agent` tool
   (`subagent_type: "Explore"`). Give it the PNG and the labels — **not** the source.
   Build `{SYSTEM_DESCRIPTION}` from what the SOURCE lines quote or cite, never free-written;
   with nothing checkable, write `NO TRUSTED SOURCE`.
3. **Report, do not apply.** Truth findings change what the diagram *claims*, which the author
   owns — list them in the completion message and ask before touching any label or edge. Visual
   fixes stay this skill's job.

It runs once, after the visual passes, so its findings describe the picture that ships. Only the
user can skip it.

### Step 4 — Write-back

Based on the origin from Step 1:

- **`.md` block** — use `Edit` to replace only the content inside the ```mermaid fences, preserving the fences. Do not touch surrounding prose.
- **`.mmd` file** — overwrite the whole file.
- **inline** — do not write any file. Return the final mermaid as a fenced code block in the completion message.

> [!IMPORTANT] Pre-completion verification gate
> Before printing the completion message, the agent **must self-verify**:
>
> 1. **Phase A actually ran.** At least one self-review pass — render + catalogue walk — happened on the final source. Not skipped.
> 2. **Phase B ran iff `stakeholder_render` was a theme.** Fresh-eyes subagent dispatched, JSON verdict parsed. Rationales like "the diagram is mature", "this was reviewed previously", or "the user just wants the PNG" are **not valid skip reasons** — Phase B exists precisely to catch issues that look fine in source but fail at render time. The only legitimate opt-out is a quick-mode signal at invocation. If `stakeholder_render` holds a theme name and Phase B did not run, go back and run it.
> 3. **Final PNG was actually inspected** — Read the file, do not just render it sight-unseen.
> 3b. **The SVG deliverable exists.** `render.sh` writes it beside the PNG. If only a PNG is on disk,
>     the render did not complete and the artefact a reader would actually receive is missing — do not
>     report completion.
> 4. **`stakeholder_render` decision from Step 0 is reflected** in the completion message — either "skip" or the theme name.
> 5. **Truth review ran iff the source has `%% SOURCE:` lines** (Step 3b), and its findings — or
>    "skipped — no %% SOURCE lines" — are in the completion message.
>
> If any check fails, do not print the completion message — go back and run the missing step. Evidence before assertions.

Print the completion message in this exact format:

```
✓ Mermaid review complete — <diagram title>

Source:    <file:line-range or "inline">
Iterations: <N> (stopped: <reason>)
Deliverable: <absolute path to final SVG>
Inspected:   <absolute path to final PNG>

Changes applied:
  • <one-line summary per applied fix>

Remaining POLISH items (non-blocking):
  • <one line per POLISH item from the final verdict>

Truth review: <"skipped — no %% SOURCE lines" | "<N> critical, <M> polish">
  • <one line per truth finding — the author decides; none applied>

→ Save rendered diagram? [y/N]
```

### Step 5 — Artefact disposition

`render.sh` produces **two** files from one source: an SVG and a PNG. They are not interchangeable.

- **The SVG is the deliverable.** It scales and keeps text selectable. A themed render carries
  its theme's ground (white for a `light` theme, `#27272A` for a `dark` one), so it reads the same
  on any page; an unthemed Phase A render stays transparent.
- **The PNG is the instrument.** It exists so the agent could actually look at the diagram during
  Phases A and B. It is not what a reader should end up with.

Wait for the user's answer to the save prompt.

- **User says yes** — save **both**, SVG first:
  - `.md` origin → sibling folder `<source-stem>-assets/` next to the source file (or
    `MERMAID_REVIEW_ATTACHMENTS_DIR` if set), as `<diagram-title-slug>.svg` and `.png`.
  - `.mmd` origin → save next to the `.mmd` with the same stem plus `-<diagram-title-slug>`, both
    extensions.
  - `inline` → not saved (no origin).

  After saving, offer to insert a fallback image reference immediately above the mermaid block in the
  `.md` source — **pointing at the SVG**, not the PNG:

  ```markdown
  ![](<source-stem>-assets/<diagram-title-slug>.svg)
  ```

  > **Why the SVG and not the fence alone.** The app that finally draws the fence may bundle an older
  > Mermaid than this skill renders with, so a fence using newer syntax can render blank there while
  > looking perfect here. The image renders regardless, including where Mermaid is turned off. For
  > Obsidian users, `python <skill>/scripts/compat_check.py <source.mmd>` checks the source against
  > Obsidian's bundled mermaid (the version pinned as `MERMAID_BASELINE`); `compatible: false` means
  > the fallback image is doing real work rather than being redundant.

- **User says no:** delete **both** temp files — the SVG and the PNG. End.

### Step 6 — Stakeholder render

Act on the `stakeholder_render` preference from Step 0:

- **`false`** — skip; the skill ends after Step 5.
- **`defer`** — re-prompt with the theme list. If still defer / skip / no answer, end without rendering.
- **`{theme: "<name>"}`** — render directly:

  ```bash
  bash <skill>/scripts/render.sh <reviewed-source.mmd> <output.png> <skill>/themes/<name>.json
  ```

  This writes **both** `<output>.png` and `<output>.svg`. Pass the `.png` path — the SVG is derived
  from it automatically.

  Output path (the `.png` you pass; the `.svg` lands beside it):
  - `.md` origin → sibling `<source-stem>-assets/<diagram-title-slug>-<theme>.png` (or `MERMAID_REVIEW_ATTACHMENTS_DIR`)
  - `.mmd` origin → next to the `.mmd` as `<mmd-stem>-<theme>.png`
  - inline → the session scratchpad directory, as `mermaid-<theme>-<diagram-title-slug>.png`. **Not
    `/tmp`** — on Windows that resolves through Git Bash to somewhere the user will not find, and this
    environment specifies a scratchpad for exactly this purpose.

Report **both** absolute output paths, labelling which is the deliverable:

```
Deliverable: <absolute path to themed SVG>
Inspected:   <absolute path to themed PNG>
```

For `.md` origins that already embedded a `![](...)` reference from Step 5, offer to repoint it at the
themed **SVG** — but do not force the swap.

**No source mutation.** The themed render is produced by `merge_theme.py` writing to a temp file inside `render.sh`; the reviewed source itself is not touched.

## Using the scripts

`<skill>` is this skill's folder; every script path in this file is relative to it.

- **Render:** `bash <skill>/scripts/render.sh <input.mmd> <output.png> [theme.json]` — writes the PNG (to inspect) and the SVG (the deliverable). The ground comes from the theme's `kind`; unthemed renders stay transparent.
- **Compare layouts:** `python <skill>/scripts/compare_layouts.py <source.mmd> [--theme themes/<name>.json]` — dagre and elk side by side; recommends neither, so open both.
- **Compat check:** `python <skill>/scripts/compat_check.py <source.mmd>` — does it render the same on an older pinned mermaid (`MERMAID_BASELINE`; set to Obsidian's bundled version, for Obsidian users).
- **Extract blocks:** `python <skill>/scripts/extract_blocks.py <path.md>` — one JSON object per block.
- **Gallery:** `python <skill>/scripts/gallery.py --out DIR` — after any theme change; open every sheet.
- **Install:** `bash <skill>/scripts/toolchain/install.sh` — idempotent.

Flags, the theme-merge and ground rules, the contrast floors and why each script exists: `references/scripts.md`.

## Using the references

- `references/common-issues.md` — severity taxonomy and the issue catalogue with detection criteria. Read once per run, at the first Phase A pass.
- `references/diagram-types/<reference_basename>.md` — the per-type catalogue, read with it when one exists and is not a stub (`reference_basename` is `null` for `gitGraph`, `requirementDiagram`, `packet-beta`, `kanban` and `treemap-beta`).
- `references/known-good-fixes.md` — stable-keyed fix recipes; look one up by `fix_key`.
- `references/iteration-loop.md` — Phase A / B pseudocode; only for a case Step 3 does not cover.
- `references/scripts.md` — every script's flags and behaviour, toolchain errors, and dated history notes.

## Using the reviewer subagent

Fill `agents/reviewer.md` — `{TITLE}`, `{TYPE}`, `{USE_CONTEXT}` (default "internal note"), `{PNG_PATH}` (the themed PNG) and `{TYPE_CHECKS}` (the type catalogue's `Detection:` lines as bullets; empty if none) — and dispatch it with the `Agent` tool, `subagent_type: "Explore"`. Explore is read-only and starts at ~24k tokens of context against ~85k for `general-purpose` (measured); every tool call pays that again, which is why the brief carries its checklist inline and caps its calls. Parse the returned JSON block and map each issue to a `fix_key` yourself.

The **truth reviewer** (`agents/truth-reviewer.md`, Step 3b) is a second, different eye: it gets the PNG, the rendered labels and the declared facts, not the source, and reports what the picture claims wrongly. Also `subagent_type: "Explore"`; its placeholders and their rules are in that file.

**Regression fixture** for both briefs: `evals/fixtures/cloud-merge/` — `fixture.py fill` builds a truth brief, `fixture.py grade <case> <output>` checks a reviewer's answer (three seeded truth errors, a clean control, and a render where a lifeline splits `--cloud`). Run it after changing either brief.

## Error handling

- **Toolchain missing** — `render.sh` exits 3; run `bash <skill>/scripts/toolchain/install.sh` once (the first run downloads Chromium and takes minutes). More in `references/scripts.md`.
- **Extract finds no blocks** — report and stop; do not treat the whole file as mermaid.
- **Write-back conflict** — `Edit` says the block changed mid-run: do not retry; report the conflict, show the intended source, ask how to proceed.

## What this skill is not

- Does not author diagrams from scratch. Input must already be valid (or nearly valid) mermaid.
- Does not judge semantics on its own. When the source declares its facts with `%% SOURCE:` lines, Step 3b checks the picture against them and **reports**; the author still owns whether the diagram correctly models the domain, and decides every content change. Without SOURCE lines the skill is visual quality only.
- Does not run git operations.
- Does not support non-mermaid formats (graphviz, plantuml, d2). Fail fast with a "wrong skill" message.
