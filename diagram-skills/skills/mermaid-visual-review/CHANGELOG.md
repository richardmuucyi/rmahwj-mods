# mermaid-visual-review — CHANGELOG

## Why the workflow guardrails exist

Past sessions bypassed Phase B ("the diagram is mature / already reviewed") and delivered themed PNGs that had not been inspected by the fresh-eyes subagent. The result was unreviewed output shipped as if it had passed QA. The Phase B non-skip rule was added to make that bypass a named, detectable violation rather than a silent shortcut.

The mmdc major-version pin (`@mermaid-js/mermaid-cli@<pinned>`) was introduced after a patch-level `npx` auto-upgrade changed layout behavior mid-session, producing renders that didn't match the source the agent had inspected. Pinning the major trades occasional manual upgrade effort for render reproducibility.

## Why the render toolchain is pinned locally (2026-08-10)

The old `@mermaid-js/mermaid-cli@<pinned major>` pin looked like a version pin and wasn't one. The CLI reaches mermaid through a `mermaid: ^11.14.0` dependency — a caret range — so every fresh `npx` cache re-resolved to newest on install: 11.16.1 measured, while Obsidian draws with 11.13.0. Pinning the CLI's major version was the right instinct applied one level too high; QA had silently drifted three minor versions ahead of the surface that actually displays the diagrams, and could inspect, approve, and ship a render that comes up blank in Obsidian. The fix is an npm `overrides` block plus a committed lockfile, which pins mermaid itself rather than the package that merely depends on it.

A second toolchain, pinned to whatever version Obsidian bundles, turns "does this render on Obsidian" into a measurement (`compat_check.py`) instead of a maintained lookup table. That was deliberate: an earlier research pass tried to build a syntax-to-version compatibility table, and every enumeration claim it produced was refuted on inspection. A table like that would have been confidently and silently wrong. Rendering the same source through both pinned engines re-derives the answer for free, and it stays correct automatically whenever either pin moves — nothing to re-audit by hand.

Two consequences follow from carrying two pins instead of one. `MERMAID_BASELINE` is not evergreen — it expires the moment Obsidian bumps its bundled mermaid, so re-check obsidian.md's changelog on every Obsidian update and re-pin when it moves. `MERMAID_TARGET`, by contrast, should only ever be bumped deliberately and recorded here — never left to track latest, or we're back to the original bug with extra steps.

`compat_check.py` compares page **geometry** — the root `<svg>`'s `viewBox` — not pixels. Its "renders identically" message is deliberately hedged, and should stay that way: resist the urge to strengthen it into a claim that the diagram is "safe" to ship, because a geometry match doesn't establish that.

## Two Windows traps worth not re-learning (2026-08-10)

`resolve_mmdc()` exists because npm installs mmdc as two separate entry points: an extensionless POSIX shim carrying a shebang line, and a `.cmd` wrapper for Windows. The shim always exists, so a naive "check the bare path, fall back to `.cmd`" approach never actually falls back — it always finds the shim first and stops looking. bash parses shebang lines and can launch the shim directly, which is why `render.sh` never hit this. Python's `subprocess` goes through Windows' `CreateProcess`, which does not parse shebangs and fails on the shim with `WinError 2` — which is why every Python caller did hit it, until routed through `resolve_mmdc()` instead of hand-rolling the path.

Never call bare `"bash"` from Python `subprocess` on Windows. It resolves to `C:\Windows\System32\bash.exe` — the WSL launcher — because `CreateProcess`'s search order checks System32 before `PATH`. `shutil.which("bash")` alone correctly reports Git Bash, so the two disagree, and the trap is invisible to a code read that only checks `shutil.which`. WSL then mounts the C: drive at `/mnt/c` and reads the Windows-style path we handed it as nonexistent, exiting 127 with a "no such file" message naming a file that plainly exists. See the `_bash()` helper in `scripts/tests/test_render_outputs.py` for the fix.

On `render.sh`'s `[[ ! -x "$MMDC" ]]` guard: it works, but not for the reason it might look like. npm's `chmod` does not survive on NTFS — there is no POSIX execute bit to persist there. What actually makes the guard fire correctly is Git Bash's MSYS2 runtime, which synthesises the executable bit at check-time by sniffing the target file's shebang line rather than reading a stored permission. `core.filemode=false` is irrelevant either way, since `node_modules/` is gitignored and git never touches those files.

## Themed renders get a ground; themes hold contrast floors; neutral dashed recipe (2026-10-18)

A Bitly architecture review run against the d2-diagram skill's improvements found three faults, each measured rather than assumed.

**A transparent themed render does not adapt to the page.** SKILL.md claimed it did. Composited onto a dark page, the zinc-light render lost its title (dark ink, `#27272A`, on dark) and every edge label outside a group turned into a white patch, because `edgeLabelBackground` is white. The fix keys the ground to the theme's `kind` — `light` → `#FFFFFF`, `dark` → `#27272A` — through one function, `merge_theme.ground_for()`, which `render.sh` calls for both mmdc runs. Unthemed renders stay transparent: the source may carry its own theme, and a global white ground is the P1 bug this skill already removed once. Keying by kind is what keeps a dark theme from ever getting white. mmdc writes the value into the SVG as `rgb(...)`, not hex.

**Both zinc themes drew borders under 3:1.** zinc-light's node and group borders (`#d3d3d5`) measured 1.41 and 1.38 against their fills, its muted text (`#76767a`) 4.19 against the 4.5 text floor, and zinc-dark's borders (`#52525B`) 1.93 and 2.03. The Phase B reviewer flagged the faint group borders unprompted. The borders moved to the lightest passing greys on the same zinc hue — `#8a8a93` (light) and `#78787f` (dark) — and the muted text to `#6e6e72`. This trades the barely-there outlines of the beautiful-mermaid look for thin visible ones. `scripts/tests/test_theme_contrast.py` now checks every theme against 3:1 for borders and lines and 4.5:1 for text, each against the surface it is drawn on, with a negative control built from the old zinc-light values.

**`distinct-dashed-linkstyle` hard-coded amber `#d97706`.** On a diagram already using an orange accent it added a second orange with a different meaning. It now defaults to neutral grey `#7b8794` (3.39-4.28 across both zinc themes' surfaces); the dash carries the meaning.

## compare_layouts.py: both layouts, side by side, no verdict (2026-10-18)

`flowchart.md` offered elk as a last-resort init directive to apply blind. The Bitly review showed why blind is wrong in both directions: elk gave the better canvas (2.2:1 against dagre's 4.6:1) and still sent the redirect edge on a detour round the whole diagram, while dagre drew the request as a clean round trip. The d2-diagram skill had already learnt the same lesson — its aspect-ratio recommendation chose the worse layout on both diagrams it was tried on — so this helper reports both sizes and picks neither.

`scripts/compare_layouts.py` sets `config: layout:` in the frontmatter of a temporary copy (replacing any existing layout, joining an existing `config:` block at its indent), renders each copy through `render.sh` so `--theme` gets the normal merge and page ground, keeps `<stem>.dagre.png/.svg` and `<stem>.elk.png/.svg`, and deletes the copies. Calling bash from Python needed the Git-Bash-not-WSL rule, so it moved into `toolchain/versions.py` as `resolve_bash()` beside `resolve_mmdc()`. Tests: `scripts/tests/test_compare_layouts.py` — four frontmatter cases, and an integration run that requires both candidates, requires them to differ, requires "open both", and fails on any recommending phrase.

## Optional truth-review pass, only when the source declares its facts (2026-10-18)

The skill was "visual quality only" by design, and the Bitly review showed the cost: the d2-diagram truth reviewer found two false claims on the same diagram — a 2014 service drawn reading a 2023 store, and a step order no source states — that no visual check, this skill's included, could see.

Step 3b now runs a truth review after the visual passes, **only when the source declares its facts** with `%% SOURCE:` lines (mermaid's comment form of d2-diagram's `# SOURCE:` block; `%% SOURCE-EXEMPT:` and `%% NOT CLAIMED:` ride along). No SOURCE line, no pass — a review against the author's own model checks nothing. `scripts/truth_inputs.py` decides and gathers the inputs: the declared lines, and the labels read from the render, with each `<br/>` turned into a space so lines are not glued into one word (the bug d2-diagram's label reader had until the same day). `agents/truth-reviewer.md`, modelled on d2-diagram's `agents/reviewer.md`, gets the PNG and the labels but not the source, checks era boundaries and unstated step orders as well as plain mismatches, and returns a `verified_claims` list naming the quote that decided each one. Findings are **reported, not applied**: they change what the diagram claims, which the author owns. Tests: `scripts/tests/test_truth_inputs.py`.

## Themes cover the other diagram types (2026-10-18)

Rendering all 22 types showed the zinc themes coloured only the flowchart family. Read from the pinned mermaid source and proved in the render (`scripts/tests/test_render_outputs.py::test_type_theme_variables_reach_the_render`): `background` set to the theme's ground (it fed xychart's `#f4f4f4` chart and kanban's `#f4f4f4` cards), `darkMode: true` in zinc-dark (without it mermaid derived dark colours with light-mode rules — black git lines, white ER rows), `rowOdd`/`rowEven` for ER rows, `archGroupBorderColor`, a full `radar` object with a theme-grey graticule, and a `packet` object holding only the keys mermaid honours (block fill, block stroke and byte colours are ignored, so labels stay dark in both themes). `test_theme_contrast.py` gains type-surface checks with negative controls. Not theme-fixable, left for later: C4 relationship text (hard-coded), radar margins and sankey link colour (diagram config). *(Superseded later the same day: C4 relationship text and sankey links were theme-fixable after all, through themeCSS; radar margins became a source recipe.)* Categorical colours (pie, cScale, git, xyChart palette) wait for the palette pick.

## Tableau 10 palette, and themeCSS for what no variable reaches (2026-10-18)

Palette B (Tableau 10) was picked from a swatch sheet and four charts in both themes; Okabe–Ito was rejected because its blue and sky blue sat dE2000 3.5 apart in light. The palette fills `cScale0-11`, `pie1-12`, `git0-7` and `xyChart.plotColorPalette`, tuned in lightness so the label colour holds 4.5:1 on every fill (white in zinc-light, `#18181B` in zinc-dark). Pie slices are opaque with a ground-coloured stroke. `xyChart` is a full object, because a partial one replaced the derived background and drew a white chart in zinc-dark.

Some colours no themeVariable reaches, so each theme carries a `themeCSS` string and `merge_theme.with_theme_css()` puts it in the init block, theme CSS first and an author's CSS after it, never twice. It fixes the timeline axis (mermaid strokes it in the section label colour: white, so invisible, in zinc-light), packet blocks and byte numbers (the directive sanitizer drops their keys), treemap leaves (0.3 over 0.6 opacity gave labels 2.3–2.8:1), kanban headers (mermaid lightens or darkens them 10%, so section colours are pinned, and header text gets the label colour), and zinc-light's timeline events (`brightness(120%)` dropped white labels to 3.49:1). The light radar rings moved to `#d4d4d8`. `test_theme_contrast.py` gains categorical checks (3:1 on the ground, 4.5:1 labels, DISTINCT = 15 dE2000 between the first six hues) with negative controls from each failure seen that day.

## Genre gallery (2026-10-18)

`lab/corpus/all-types/` holds one sample per diagram type (22), and `scripts/gallery.py` renders them all in both themes and writes contact sheets. The point is the sheets: the themes had broken nine types while every flowchart looked fine. `scripts/tests/test_gallery.py` checks every type renders in both themes on its theme's ground.

## compare_layouts.py says when the layout has no effect; five types were undetected (2026-10-18)

Across the 22 samples elk changed six types (flowchart, class, state, er, requirement, mindmap); for the other sixteen the two PNGs were byte-identical and the helper still said "open both". It now prints "layout has no effect on <type>" and keeps one render. Identical bytes is a fact, so this does not break the no-verdict rule. Printing the type showed `extract_blocks.py` missed five keywords (radar-beta, architecture-beta, packet-beta, kanban, treemap-beta), which read as "unknown"; they are added, and a test walks the whole corpus.

## Hard-coded colours repainted; layout defects fixed or documented (2026-10-18)

Read from the dark sheets and the pinned source:

- **C4** draws relationships and boundaries in `#444444` attributes (1.92:1 on zinc-dark), so zinc-dark repaints them with attribute selectors. Every C4 box draws white text, and five default fills hold it at 2.0–3.6:1, so both themes give those boxes `#18181B` text through `:has()`.
- **Sankey** links carry an inline multiply blend that turns them near-black on a dark ground; zinc-dark sets `mix-blend-mode:normal !important`.
- **Gantt** grid lines are d3 `currentColor` (black) in both themes; both repaint `.grid .tick line`.
- **Layout**, fixed in the source and recorded as recipes: radar side labels clipped (`radar-label-margins`), gantt dates overprinting and a 6.8:1 strip (`gantt-ticks-and-width`), a block arrow landing on a corner (`block-align-and-pad`), an architecture edge through its own label (`architecture-sideways-edges`). The corpus samples carry the fixes.
- New catalogues `radar.md` and `architecture.md` (the latter collects the architecture-beta layout rules); the gantt, block, C4 and sankey stubs are filled.
- Known limits, documented: the radar title sits flush with the top edge; C4 relationship labels sit on their lines and lines can cross boxes; architecture service tiles stay mermaid blue.

`test_theme_contrast.py::hardcoded_failures` holds the repaints, with a negative control: the themes without them fail on exactly the surfaces seen broken (zinc-dark all, zinc-light only the grid and the five light C4 boxes).
