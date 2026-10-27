# cloud-merge — regression fixture for the stage-5e reviewer

Run it after changing `agents/reviewer.md`.

1. `python -I fixture.py fill ../../../../agents/reviewer.md seeded > brief.txt` (and `clean`).
2. Dispatch each brief **3 times** with `subagent_type: "Explore"` — reviewer runs vary.
3. `python -I fixture.py grade seeded|clean <answer-file>` on each answer.

**Pass rule** (set before the first runs): every seeded error caught in ≥ 2 of 3 runs; the
clean control with no CRITICAL in 3 of 3. `expected.json` is stricter for clean (also no
`semantic_mismatches`) — report both.

**Results** (tokens = every request's full context + output, from the transcripts). They were
measured on an earlier wording of the same diagram that used shorthand command labels where it
now says `git pull` / `git commit + git push`; the three seeded errors are unchanged, so re-run
before trusting the numbers for the current wording:

| Brief | Seeded: E1 · E2 · E3 | Clean: no CRITICAL (strict) | Tokens per run, seeded / clean |
|---|---|---|---|
| old, general-purpose (1 run) | E1 as POLISH only · E2 · missed | clean | 917k / 296k |
| new, Explore | 3/3 · 3/3 · **0/3** | 3/3 (0/3) | 141k / 155k |
| new + claim-by-claim pass (current) | 3/3 · 3/3 · **0/3** | 3/3 (2/3) | 121k / 143k |

**Open:** E3 — the conflict note reads as a complete list but omits the PR-conflict case the docs
describe — is missed by every d2 run, old and new; the mermaid truth reviewer catches it 2/3 on
the same facts. An omission of this kind is the hardest class for this reviewer; fix it without
naming the case in the brief, or the fixture stops testing anything.
