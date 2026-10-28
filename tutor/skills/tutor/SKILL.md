---
name: tutor
description: >-
  Use when the user wants to be actively quizzed, drilled, or tested on material they have already studied,
  or wants to practise explaining it back (Feynman teach-back). A live, multi-turn adaptive recall loop —
  asks one question at a time, grades each answer, names the specific misconception on a miss, and escalates
  difficulty until the learner reaches their edge, then remediates. Triggers: "quiz me on X", "test me",
  "drill me", "until I break", "let me explain X back to you", "check my understanding". Operates against a
  note, a spec or a generated page. NOT for teaching from scratch (suggest /learn),
  flashcards (anki), or one-shot Q&A.
disable-model-invocation: true
argument-hint: "What to drill, and from where? (+ --feynman for teach-back)"
---

# Tutor — live adaptive recall

Run a live, multi-turn recall loop over material the learner has **already studied**. The point is *retrieval* (the testing effect — the most robust effect in learning science), not exposition. This skill grades, diagnoses, and escalates; it does not teach from scratch (`/learn` does that) or make flashcards (`anki` does that).

## When not to invoke

- **Don't** invoke to *teach from scratch* (→ `/learn`), to make a spaced-repetition deck (→ `anki`), or to answer a one-off question (just answer it). If the user hasn't studied the material yet, suggest `/learn` first.

## Modes (routed from `$ARGUMENTS`)

| Mode | Trigger | What it does | Protocol |
|---|---|---|---|
| **Adaptive quiz** *(default)* | no flag, "quiz me", "until I break" | one question/turn, difficulty staircase, misconception diagnosis | `references/adaptive-quiz-protocol.md` |
| **Feynman teach-back** | `--feynman`, "let me explain it back" | the learner teaches; the agent is a novice who finds gaps | `references/feynman-protocol.md` |

State your read of the mode, then start. If the user just says "quiz me," default to adaptive quiz.

## Step 1 — Bind the source and scope

1. **Bind the source.** Identify what to drill: a note, a spec or a generated page (an HTML file). Read it. Extract the **concept set** under test (the glossary terms, the named flows, the load-bearing claims). If the page has `.quiz` options tagged `data-misconception`, harvest them as the starting **misconception bank** (`references/misconception-banks.md`).
2. **Confirm scope** in one line ("I'll drill the 6 reclassification concepts, starting at medium difficulty — say stop any time").

## Step 2 — Create the session state file (the loop's source of truth)

Write a session ledger beside the source: `_tutor-session-<date>.md` in the source file's folder, or in the current folder when the source is not a file (a pasted text, a topic you name). The **conversation may be compacted; this file is not** — it, not memory, decides where the loop stands.

```markdown
# Tutor session — <topic> · mode:<quiz|feynman> · <date>
Status: in-progress        # in-progress | complete | paused
Entry difficulty: 3  ·  Target: 6

## Ledger
| concept | diff | attempts | last result | status | asked-ids |
|---------|------|----------|-------------|--------|-----------|
| ...     | 6    | 3        | correct     | mastered    | q1,q4,q9 |
| ...     | 5    | 2        | wrong       | in-progress | q2,q7    |
| ...     | —    | 0        | —           | untested    |          |

## Gate (the completion predicate — checkable, not a feeling)
A concept is `mastered` when: cleared at difficulty ≥ Target on ≥2 separate retrievals,
most-recent attempt correct, no miss in its last 2 asks.
The SESSION is `complete` only when: every concept is `mastered` AND a final
verification set (one FRESH question per concept, none in asked-ids) passes in full.

## Verification log
- (final check not yet run)
```

## THE LOOP — run every user turn until the gate passes

Treat the steps below as **standing instructions executed on EVERY turn** — not a one-time script (the skill stays in context; it is not re-read per turn).

1. **READ** the session state file. It is the source of truth — trust it over memory.
2. **EVALUATE** the completion gate against the Ledger. If it provisionally passes → go to VERIFY (do **not** announce completion yet). Otherwise continue.
3. **SELECT** the next concept: lowest-status / lowest-difficulty unmet one. Never reuse an id in `asked-ids`.
4. **EXECUTE** exactly ONE step — one quiz question, or one teach-back prompt (per the mode protocol).
5. **GRADE** the reply. On a miss, **diagnose the specific gap** (name the misconception — don't just say "wrong").
6. **WRITE** the updated Ledger back to the file **immediately** — every turn, never batched.
7. **CONTINUE**, unless the learner asks to stop → set `Status: paused`, write a one-line "resume here" note, exit cleanly.

### VERIFY — the completion gate (never skipped, never shortcut)

- **a.** Re-read the Ledger and **confirm in writing**, concept by concept, that each meets the mastery criteria. If any does not, the gate has NOT passed → reopen it, return to THE LOOP.
- **b.** Run the **FINAL VERIFICATION SET**: one fresh question per concept, at Target difficulty, none appearing in `asked-ids`. This is independent evidence — re-using an already-passed question does not count.
- **c.** Any miss → mark that concept `in-progress` again, log it, return to THE LOOP.
- **d.** Only when the ENTIRE fresh set passes in one sweep: set `Status: complete` and emit a summary that **quotes the cleared Ledger** as proof. Offer to bake the day's gaps into an `anki` deck (suggest `/anki`).

## Exporting the session to HTML (on request)

The markdown session ledger (`_tutor-session-<date>.md`) stays the loop's source of truth — **never replace it.** But when the learner asks for an HTML version of the output (a study sheet, the Q&A, the closing/synthesis material, a shareable summary), **tell the learner to type `/html-artefact`** (it is user-invoked, so you cannot call it) and give them the brief below to paste. `/html-artefact` saves the page as a single file, in the current folder or one the learner names.

- **Trigger on:** "make/generate an HTML", "give me a study sheet", "export this", "html version".
- **The brief for `/html-artefact`:** the concept set, each concept's prompt + the learner's *cleared* answer (cleaned up), and any closing/synthesis material. The natural shape is a **reveal-the-answer card per concept** (native `<details>` — read the prompt, attempt it, then reveal) plus a **copy button** for any script — i.e. a quiz-yourself study sheet, not a passive transcript.
- **Keep the ledger markdown** as-is; the HTML is a *derived export*, not a replacement. HTML diffs are noisy — regenerate it, don't hand-edit. Filename names the topic's job (e.g. `tr15-tr12-argument-study-sheet.html`).

## Anti-patterns (the guards that make the loop trustworthy)

- **Never declare completion** from a single correct answer, from momentum, or from "this feels done." Completion is whatever the Ledger + fresh verification set say.
- **Never give the answer** to escape a stuck point — give a stronger hint and re-ask. Stating the fact converts active recall into passive re-reading and kills the mechanism.
- **Never escalate difficulty past the success window** (~70–85% correct). Difficulty past constant failure is just failure, not "desirable difficulty."
- **Never invent a misconception** — select from the section bank (`references/misconception-banks.md`). LLMs select misconceptions reliably but invent them poorly.
- **Never repeat a question** (track `asked-ids`); keep MCQ options roughly equal-length (no formatting tells).
- **Never run the loop on un-studied material** — suggest `/learn` first.
- If you can't run the verification set (the learner is leaving), set `paused`, not `complete`.

## Reference

- `references/adaptive-quiz-protocol.md` — Mode 1: one-question-per-turn, the difficulty staircase, layered hints, break-point remediation.
- `references/feynman-protocol.md` — Mode 2: the protégé framing, the hidden rubric, top-1–2-gap surfacing, the transfer-check exit.
- `references/misconception-banks.md` — how to build/seed a per-section misconception bank and *select* (not invent) from it.
- `evals/evals.json` — test cases.
