# cloud-merge — regression fixture for both reviewer briefs

Run it after changing `agents/reviewer.md` or `agents/truth-reviewer.md`.

1. `python -I fixture.py fill ../../../agents/truth-reviewer.md seeded > brief.txt` (or `clean`;
   for the visual brief use `../../../agents/reviewer.md` with `visual-flag-crossed` / `visual-clean`).
2. Dispatch each brief **3 times** with `subagent_type: "Explore"` — reviewer runs vary, so one pass
   proves little either way.
3. `python -I fixture.py grade <case> <answer-file>` on each answer.

**Pass rule** (set before the first runs): every seeded error caught in ≥ 2 of 3 runs; the
clean control with no CRITICAL in 3 of 3; the visual draft's crossed flag caught in ≥ 2 of 3.
`expected.json` is stricter for clean (also no `semantic_mismatches`) — report both.

**Results** (tokens = every request's full context + output, from the transcripts):

| Case | Before (general-purpose, 1 run) | After (Explore, 3 runs) |
|---|---|---|
| truth seeded | 3/3 caught · 1.06M | E1 3/3 · E2 3/3 · E3 2/3 · 135k mean |
| truth clean | clean · 1.36M | no CRITICAL 3/3 (strict 2/3) · 134k |
| visual draft | caught · 517k | caught 3/3 · 119k |
| visual clean | ship-ready · 799k | ship-ready 3/3 · 126k |

Caveat: the visual brief's "line through a literal" rule was written from this very defect, so
the visual draft case shows the rule works, not that it generalises. `baseline/` holds the four
"before" answers.

The diagram is about Claude Code cloud sessions (public docs). The repository side is an example
(`example-org/garden-journal`, kept in step with plain `git pull`, or `git pull --rebase` + `git push`
when you have local commits; either stops on a conflict) and its facts are quoted in full in
`inputs.json`, because a reviewer cannot open it. The diagram has the three seeded errors (E1–E3)
and the crossed flag (V1) that `expected.json` checks for; `fixture.py grade` passes each baseline
answer on its own case and fails a clean answer graded as `seeded`.

The PNGs and SVGs are rendered with the zinc-light theme, for example
`bash ../../../scripts/render.sh seeded.mmd render-1.png ../../../themes/zinc-light.json` (rename
the SVG to `seeded.svg`). `draft.png` is `seeded.mmd` with step 2 written as the message
`2 · claude --cloud "your task"` (no note) and B1/B2 drawn as dashed arrows.
