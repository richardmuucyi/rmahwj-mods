# Eval Assertion Scripts

Each script is a standalone checker for one (or a family of) assertions from `evals/evals.json`. The grader runs them against the skill's final output during the eval workflow.

## Script contract

- **Input:** one positional argument — a path to a mermaid source file (`.mmd`) or a markdown file containing a mermaid block (`.md`).
- **Output:** a human-readable line on stdout (`PASS: ...` or `FAIL: ...`) and an appropriate exit code.
- **Exit codes:**
  - `0` — assertion passes
  - `1` — assertion fails (check logic ran, answer is negative)
  - `2` — error (file missing, tool missing, etc.) — treated as neither pass nor fail, needs investigation

## Scripts

- `check_title_frontmatter.py` — the final mermaid source contains a `---\ntitle: ...\n---` block.
- `check_render_clean.py` — the final mermaid source renders cleanly via the pinned toolchain's mmdc (resolved through `resolve_mmdc("target")` in `scripts/toolchain/versions.py`), with the same flags as `scripts/render.sh` (`-w 1800 -b transparent`). It invokes mmdc directly rather than going through the bash wrapper to avoid cross-shell path-translation issues on Windows (MSYS vs WSL bash).
- `check_no_white_bg.py` — the rendered SVG's root `<svg>` element declares no opaque background (transparent, `none`, or `rgba(0,0,0,0)` all pass). Scoped to the root element's own `style` attribute specifically, so it isn't tripped up by mermaid's default `.edgeLabel`/`.labelBkg` chip-background CSS, which is unrelated page furniture present on every render.

## Not yet implemented (scored by grader subagent against transcripts)

The following assertions require transcript inspection rather than output file inspection and are graded inline by the grader subagent:
- `case-1-catches-text-clipping` — self-review round 1 mentions text clipping
- `case-2-no-fixes-applied` — final source semantically identical to input
- `case-3-loaded-sequence-reference` — transcript shows `references/diagram-types/sequence.md` was read AND contains non-trivial content
- `case-4-title-inserted` — input lacked title, output has one
- `iteration-count-within-cap` — iterations <= 5
- `produces-png-render` — a PNG file exists somewhere in the run artefacts

The grader examines the skill's transcript JSON from the eval workspace and checks these directly.
