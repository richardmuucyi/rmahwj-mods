# Scripts, errors and history

*Moved from SKILL.md to cut its always-loaded size.*

## Using the scripts

- **Render:** `bash <skill>/scripts/render.sh <input.mmd> <output.png> [theme.json|theme.css]`
  - Renders through the **pinned local toolchain**, not `npx`. If it reports the toolchain is missing, run `bash <skill>/scripts/toolchain/install.sh` once.
  - Emits **both** `<output>.png` (for the agent to inspect) and `<output>.svg` (the deliverable). Passing a `.svg` output path directly writes only that file.
  - **The ground comes from the theme's `kind`, in one place:** `merge_theme.ground_for()` (`--ground` on the command line) maps `light` → `#FFFFFF` and `dark` → `#27272A`, and `render.sh` passes it to both mmdc calls. Unthemed renders stay transparent, because the source may carry its own theme. **Do not reintroduce a global `-b white`** — it forced a white ground onto every render regardless of theme, dark ones included, and there were three separate sources of that ground before P1: this flag, a `background` key in the theme JSON, and a second hardcoded copy inside `evals/assertions/check_render_clean.py`. *(Superseded: this bullet said backgrounds are transparent, full stop. Transparent themed renders broke on pages of the other kind; keying the ground to the kind fixes that without bringing the old bug back.)*
  - **Theme colours hold contrast floors**, enforced by `scripts/tests/test_theme_contrast.py`: borders and lines 3:1 against the surface they sit on, text 4.5:1. A new theme needs a `kind` of `light` or `dark` and must pass that test.
  - With a `theme.json`, `merge_theme.py` deep-merges the theme's `themeVariables` into any existing init block (preserving Phase A flowchart/sequence directives) and emits a single init block. Two competing `%%{init: …}%%` blocks would silently lose Phase A fixes — the merger is what prevents that.
- **Compare layouts:** `python <skill>/scripts/compare_layouts.py <source.mmd> [--out-dir DIR] [--theme themes/<name>.json]` renders the default layout (dagre) and `layout: elk`, keeps both as `<stem>.dagre.png/.svg` and `<stem>.elk.png/.svg`, prints both canvas sizes and **recommends neither** — open both and choose by eye. No number picks the better layout: on the Bitly review elk had the better ratio and still sent an edge round the whole diagram. Each candidate renders through `render.sh`, so `--theme` gets the same merge and page ground. Reach for it when a Phase A layout reads badly (a long detour, crossings, a very wide canvas). When the two PNGs are byte-identical it says **"layout has no effect on <type>"** instead and keeps one render: elk moves only flowchart, class, state, er, requirement and mindmap diagrams (measured on 11.16.1 across all 22 types).
- **Gallery:** `python <skill>/scripts/gallery.py --out DIR` renders every sample in `lab/corpus/all-types/` (one per diagram type, 22 of them) in both zinc themes and writes contact sheets to `DIR/sheets/`. Run it after **any** theme change, then **open every sheet**: once the themes broke nine types while every flowchart looked fine, because flowcharts were the only type anyone looked at. Exit 0 says every type rendered, not that it reads well.
- **Compat check:** `python <skill>/scripts/compat_check.py <source.mmd>` → JSON verdict on stdout reporting whether the source renders on the baseline mermaid (`MERMAID_BASELINE`, pinned to Obsidian's bundled version, for Obsidian users), and whether the geometry matches. Keys: `target_renders`, `baseline_renders`, `geometry_matches`, `compatible`, `target_version`, `baseline_version`, `target_viewbox`, `baseline_viewbox`, `message`. Exit 0 when a verdict was produced, 2 on input error. Costs two Chromium launches (~1.3s). Versions live in `scripts/toolchain/VERSIONS`.
- **Install the toolchains:** `bash <skill>/scripts/toolchain/install.sh` — idempotent, safe to re-run. First run downloads Chromium via Puppeteer and takes several minutes; both toolchains share one cached browser.
- **Extract blocks:** `python <skill>/scripts/extract_blocks.py <path.md>` → JSON array on stdout. Exit 0 on blocks found, 1 on none, 2 on file error. Each block has `reference_basename` so you can read `references/diagram-types/<reference_basename>.md` directly.

## Error handling

- **Render toolchain not installed** — `render.sh` exits 3 with `Render toolchain not installed. Run: bash <skill>/scripts/toolchain/install.sh`. Run that once. It installs both the target and baseline toolchains and is safe to re-run.
- **First install downloads Chromium** — `toolchain/install.sh` fetches Chromium via Puppeteer on its first run and can take several minutes. Both toolchains share one cached browser (`~/.cache/puppeteer`), so the second installs quickly. If a first install appears to hang, give it time before assuming failure.
- **Extract finds no blocks** — `.md` had no fenced mermaid blocks; report and stop. Do not treat the whole file as mermaid.
- **Concurrent edit conflict in write-back** — `Edit` reports the original block content no longer matches what was extracted (user modified the file mid-run). Do not retry. Report the conflict, show the intended new mermaid source, ask how to proceed.

## Reference

- `references/common-issues.md` — severity taxonomy; catalogue of 17 common rendering issues with detection criteria
- `references/known-good-fixes.md` — stable-keyed fix recipes, one per fix_key (28 recipes, including radar, gantt, block and architecture layout)
- `references/iteration-loop.md` — Phase A / Phase B pseudocode and stop conditions
- `references/diagram-types/` — per-diagram-type catalogues (flowchart, sequence, state, etc.)

## History notes removed from SKILL.md

- *(Superseded: this said a
  transparent ground "adapts to whatever page it lands on — light or dark". It does not — zinc-light
  on a dark page lost its title and turned every edge label into a white patch.)*

- *(Superseded: this bullet said backgrounds are transparent, full stop. Transparent themed renders broke on pages of the other kind; keying the ground to the kind fixes that without bringing the old bug back.)*

- *(Superseded: this said "Does not check semantic correctness. Visual quality only". The Bitly review showed the cost: two false claims on one diagram that only a truth check could see.)*
