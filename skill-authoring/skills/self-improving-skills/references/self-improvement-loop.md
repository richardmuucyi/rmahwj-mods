# Governed Self-Improvement Loop

A reusable contract for letting a skill **learn and update itself over time** — when the agent invents or harvests something useful mid-run, it can feed that back into the skill so future runs inherit it — **without** the three failure modes that make naive self-editing dangerous: hallucination drift, privacy leakage, and trigger corruption.

The rule in one line: **capture is free; promotion is gated.** An agent may always *append* a discovery to an append-only journal. Moving that discovery into the skill's canonical body is a *promotion* that must clear a fixed bar.

Provenance: this generalises a pattern from an earlier walkthrough skill: append-only addenda, a durable page amended in place, and a supersede-not-delete state file.

---

## Why naive self-editing is unsafe (the failures each gate prevents)

| Failure | What goes wrong if ungated |
|---|---|
| **Hallucination drift** | One wrong "new best practice" written into canon corrupts *every* future run. (The same schema drift that LLM-invented conventions cause in an LLM-maintained wiki.) |
| **Privacy leakage** | Self-update is the #1 vector for leaking project/company info: the agent harvests "something new" *from your live work* and writes it into a reusable skill. A pre-publish leak scan and this gate are the same check from opposite ends. |
| **Trigger corruption** | Auto-editing the `description` silently breaks when the skill fires. Triggering must be tuned *empirically*, with a trigger-eval loop such as `skill-creator`'s description optimisation, never by freehand guess. |
| **Silent loss** | An in-place overwrite drops content nobody notices is gone (content migrates or is deleted deliberately, never lost). |
| **Scope creep** | An agent editing files outside the skill's own directory mutates things it shouldn't. |

---

## The two layers

| Layer | Files | Who may write | Lifecycle |
|---|---|---|---|
| **Append-only journal** | `learnings/NNNN-<slug>.md` (or a `## Candidates` section in the state log) | the agent, **always**, freely | never overwritten — pure capture |
| **Canonical body** | `SKILL.md`, `references/*` | only via a **gated promotion** | amended-in-place; supersede-not-delete |
| **State log** | `_self-improve-log.md` | appended on every promotion | append-only audit trail; reversible |

---

## 1. Capture — always allowed

At any point the agent may append one discovery to the journal. Zero-risk: it changes no behaviour, overwrites nothing. Each entry records:

```md
## NNNN — <one-line discovery>  (YYYY-MM-DD)
- **What:** the thing learned / harvested.
- **Why it might help:** how it would extend or improve the skill.
- **Provenance:** where it came from (a run, a source, an inference) — needed for the privacy + verification gates.
- **Confidence:** hunch | corroborated | mechanical-fact.
```

Capture is the inbox. Nothing here is "in" the skill yet.

## 2. Promotion — gated

A journal entry may move into the canonical `SKILL.md`/`references` **only if it clears ALL six gates:**

1. **Verified.** Corroborated by a real source or repeated evidence — *or* it's provably mechanical (a dead link, a checked example, a typo). A one-off hunch does not promote; it stays in the journal until it earns it.
2. **Privacy-clean.** Passes the leak scan: no person name, employer/client/vendor, internal project/system codename, credential/secret, internal URL/host, or absolute path harvested in. *(If the skill that owns the leak-scan exists, run it on the candidate text; otherwise grep the project's sensitive-token list.)*
3. **Non-destructive.** Supersede, don't overwrite: mark a replaced claim `*(Superseded YYYY-MM-DD)*` and state the new one beside it. Never silent-delete — a bad promotion must be reversible.
4. **Trigger-safe.** Does **not** hand-edit the `description`/trigger. If a promotion implies a description change, route it to an empirical trigger-eval loop (for example `skill-creator`'s description optimisation), never freehand.
5. **Scope-confined.** Edits land only inside this skill's own directory. Never reach outside it.
6. **Regression-checked.** If the skill has an eval harness, the promotion passes it. If it doesn't, flag that the promotion is unverified-by-eval.

## 3. Auto-apply vs propose

- **Auto-apply is allowed only** for a change that is *all of*: provably-mechanical **and** privacy-clean **and** non-destructive (e.g. fix a broken cross-reference, add a source-verified example to `references/`).
- **Everything substantive is propose → approve.** When unsure which bucket a change is in, it's substantive — propose it.

This mirrors the deliberate stance of `skill-uplift` and `ebook-to-skill` (audit): *propose, never auto-apply* for anything that carries judgment.

## 3.5 Promotion cadence — the gate that was missing *(added 2026-07-26)*

Gates 1–6 stop a *bad* promotion. Nothing stopped a **good** promotion from never happening —
and that turned out to be the loop's real failure mode. Capture worked (more than a hundred learnings across
a dozen skills); promotion only fired when something broke.

> **Worked example.** One skill's `learnings/0003` item 2 recorded a template
> drift on **2026-06-10**, graded `corroborated`, naming the exact contradiction. It sat
> unpromoted for **six weeks** until it caused a real incident on 2026-07-25 (notes hand-built
> from the stale template, carry-forward skipped, the open-task pool stranded and invisible for
> three days). The finding was correct, verified, and sitting in the inbox the whole time.

**The sweep:** on a schedule you already keep (a monthly review, say), list the entries graded
`corroborated` / `mechanical-fact` that have been unpromoted for ≥30 days. Age and grade are
mechanical, so a script does it: `scripts/ripe_learnings.py` in this skill (`--days N`, `--root`,
`--json`; test: `evals/test_ripe_learnings.py`). It reports four things worth acting on:

| Bucket | Meaning |
|---|---|
| **ripe** | graded, aged past the threshold, no promotion logged — the queue |
| **partial-risk** | logged as promoted *but* enumerates several findings — see below |
| **untriageable** | no `**Confidence:**` line, so it can't be aged or graded — invisible to the sweep |
| **untraceable** | log says bare `promoted:` with no learning id — the audit trail has a hole |

**The partial-promotion trap.** Promotion is logged per **file** (`promoted 0003: …`) but
findings are captured per **item**. 0003 held three numbered findings; the log line made the
whole file look handled and masked item 2. Any promoted file with ≥2 enumerated findings is
therefore reported as `partial-risk`, not as done — the one exception being files promoted in
the last 7 days, which were just reviewed.

**Clearing a partial-risk entry: the `audited` line** *(added 2026-09-21)*. Nothing
could ever leave this bucket. Promotion is logged per **file** and findings are
captured per **item**, so re-logging a promotion only snoozes the entry for the
freshness window — the ambiguity that put it there survives. The missing vocabulary
is a per-item audit:

```md
- **YYYY-MM-DD** — audited 0003: items 1-3 all landed (<where each one is>).
- **YYYY-MM-DD** — audited 0013: items 1-2 landed. **item 3 open:** <what remains>.
```

An audited learning leaves the bucket; one whose audit records an open item stays,
which is the state worth surfacing. The open-item phrasing is matched generously
(`items open`, `still captured-only`, `partially promoted`, `not verified`) —
deliberately, because a narrow pattern fails in the one direction that matters:
it would clear an entry whose own audit says it is unfinished.

**This is a queue, not a mandate.** The sweep computes age + confidence; it never decides that
something *should* be promoted. A ripe entry may still be wrong, superseded, or no longer worth
the change — that judgment stays with the reviewer, and gates 1–6 still apply to anything pulled
off the queue.

## 4. Log every promotion

Append to `_self-improve-log.md`:

```md
- **YYYY-MM-DD** — promoted NNNN: <what changed>. Source: <provenance>. Gates: verified✓ privacy✓ non-destructive✓ trigger-safe✓ scope✓ eval(✓|n/a). Superseded: <old claim → new> | none.
```

Append-only. This is what makes the loop reversible and auditable — you can always see *what* the skill taught itself, *when*, and *on what evidence*.

---

## Scriptability sentinel *(added 2026-06-11)*

A specialisation of capture, born from a measured finding: model-driven *mechanical* work (parse / filter / count / group / collect across files) is ~10–17× more token-expensive than a script doing the same — **and silently wrong at a few-percent rate per run** (resurrected tasks, fabricated badges, arithmetic that contradicts its own table; evidence: a 2026-06-10 benchmark of 5 flows, verified against ground truth).

**Fire condition** — during or after any run of an adopting skill, if the agent notices it just performed:
- **≥5 sequential Reads/Greps** of project files in one intent execution, or **≳50k tokens** of collection work,
- where the work was **mechanical** (no judgment: parsing fields, filtering by rule, counting, grouping, resolving links),
- and **no script** in the skill's `scripts/` already owns that work,

…it MUST append a learning (`learnings/NNNN-scriptability-<intent>.md`). Capture is free, as always. The entry records: the intent, observed Reads/tokens, the proposed mechanical/judgment split, and what the script's manifest should surface.

**The split rubric** (what goes where):
- **Script:** parse, filter, count, group, dedup, link resolution, age math — anything falsifiable.
- **Model:** relevance, phrasing, what-to-propagate, expired-vs-live judgment — anything contested.
- Scripts hand the model **raw lines, not conclusions** — so the model can still notice anomalies.

**Write-path contract** (non-negotiable when the scripted flow WRITES to the user's files):
- Script's default mode is a **preview** (proposed output + manifest); writing is gated behind an explicit flag that refuses to overwrite.
- The manifest lists every dropped item with its reason; **semantic drops are never the script's call** — they go to a review list the model adjudicates.

**Quality bar for the promoted script:** stdlib-only, self-contained — no imports across PEER skills — UTF-8-forced output, a root-folder override, and a frozen-fixture regression test with pinned dates. Shared code is allowed only via a designated shared-library folder, if your setup has one; that is the exception, not a precedent for skill-to-skill imports. The fixture is a drift alarm, not a proof of spec — pair it with a live smoke test against real data before promoting.

Introducing a script is **always substantive** → propose → approve. Never auto-apply.

---

## Adoption block

Paste this into a skill's `SKILL.md` to opt in, and create the two directory entries it names.

```md
## Self-improvement (governed)

**Capture is free** — append any reusable discovery from this run to `learnings/NNNN-<slug>.md`, including "this run needed a script" when it did heavy unscripted mechanical work. **Promotion is gated** — run the `self-improving-skills` skill before changing anything canonical here.
```

**This block is deliberately a pointer, not a summary.** It carries only the two behaviours an adopting
skill needs *without* reading anything: capture now, gate promotion. The six gates, the rationale, and
the scriptability rubric stay here — reached by invoking `self-improving-skills`, never by restating.
An earlier version of this block inlined all six gates; thirteen skills ended up carrying byte-identical
copies of it, which is the duplication this file's own single-source-of-truth rule exists to prevent.
*(collapsed 2026-07-31)*

Directory additions per adopting skill:

```
<skill>/
├── learnings/            # append-only capture inbox (NNNN-<slug>.md)
└── _self-improve-log.md  # append-only promotion audit trail
```

---

## Fix the class, not the instance — audit sibling paths *(added 2026-09-21)*

**Recorded because it has now caused defects in three films across two sessions.**
The shape is always identical: a fix lands on the one code path that reported the
bug, the sibling paths with the same bug are never looked at, and the defect
resurfaces somewhere else looking like a new problem.

Observed instances:

- A sub-pixel motion floor was raised on the pan path; the **zoom** path had the same
  floor and sawtoothed. Found only when a later gate failed 6 of 34 shots.
- Quarantine-before-overwrite was implemented for **gate failures**; the
  **voluntary re-render** path — which is where most re-renders actually come from —
  still overwrote silently, and destroyed the best take of a shot.
- A round counter was bounded for the **budget** case but compared against the
  **absolute** round number, so a project that had run six rounds could never run a
  seventh and reported it as a quality failure rather than a counter one.

**The rule.** When you fix a defect, before you close it:

1. Name the *class* of the bug in one sentence, without reference to where you found
   it — "a destructive operation with no backup", "a threshold compared against the
   wrong variable", "an aggregate blind to intra-item events".
2. Grep for every other site in that class. The question is not "did I fix the
   reported case" but "how many places does this class exist, and did I fix all of
   them".
3. If you fix only one, say so explicitly and say why — a known unfixed sibling is a
   decision; an unexamined one is the same bug waiting.

This costs a few minutes and it is cheaper than every instance above. It applies to
skill scripts, gates and harness code alike, and it is worth stating in the promotion
note: *"audited siblings: N sites, all fixed"* or *"1 of 3 fixed, others deliberately
left because …"*.

## Keep it honest

This is a *governance* contract, not a licence for a skill to rewrite itself freely. If you find yourself wanting an agent to silently mutate its own canonical instructions on a hunch, stop — that's the drift this contract exists to prevent. The loop's whole value is that the skill compounds *trustworthily*: every change is captured, gated, logged, and reversible.
