# Adaptive Quiz Protocol (Mode 1 — "quiz until I break")

## Contents
- [The cadence](#the-cadence)
- [The difficulty staircase](#the-difficulty-staircase)
- [Grading + misconception diagnosis](#grading--misconception-diagnosis)
- [Layered hints](#layered-hints)
- [The break point + remediation](#the-break-point--remediation)
- [Per-concept mastery (feeds the gate)](#per-concept-mastery-feeds-the-gate)
- [Anti-cue rules](#anti-cue-rules)

This is the per-turn body that plugs into THE LOOP (SKILL.md steps 4–5). The loop owns state + the completion gate; this file owns *how each question is asked and graded*.

## The cadence

- **One question per turn. Always.** Never batch. Never ask the next before grading this one.
- **Never give the answer in the first response.** Ask, let them try, then hint — reveal only after two tries (Study-Mode rule).
- Vary the question *type* across turns (recall / apply / compare / predict / "what breaks if…") so you test understanding, not memorised phrasing.

## The difficulty staircase

Track an integer `diff` (1–10) **per concept** in the Ledger. It is a transformed up-down staircase that converges on the learner's edge (IRT's max-information point, reduced to arithmetic):

| Outcome this turn | Move |
|---|---|
| Correct on 1st try | `diff += 1` |
| Correct after hint(s) | hold `diff` |
| Wrong after 2 tries | `diff -= 2` (or 3); **log the break point** |

- Seed at medium (5–6).
- **Keep `diff` in the ~70–85% success window.** Desirable difficulty only helps *while retrieval still succeeds* (Bjork). If the learner is failing repeatedly, you've left the window — drop down and remediate, don't keep climbing.

## Grading + misconception diagnosis

On a **correct** answer: confirm briefly, note *why* it's right if non-obvious, advance.

On a **miss**, diagnose — don't just mark wrong:
1. **Select** the misconception from the section bank (`misconception-banks.md`) — never invent one. Name it specifically ("you're applying the rule left-to-right, ignoring precedence").
2. State the gap in one sentence, then drop to a **layered hint** (below).
3. After the fix, **re-ask differently** (a fresh `asked-id`) to confirm the correction held — a corrected misconception that survives a re-ask is the strongest sign the gap is closed.

## Layered hints

Progressively stronger, each stopping short of the answer:
1. **Nudge** — point at the relevant area ("think about what the watchlist flag does first").
2. **Narrow** — eliminate a wrong path or surface the key constraint.
3. **Scaffold** — walk up to the doorstep of the answer, leave the last step to them.

If they're still stuck after the 2nd try, reveal the answer **with its reasoning** (not bare), mark it wrong, drop `diff`, and queue remediation.

## The break point + remediation

"Break" = fails at-or-below the established level, OR K consecutive fails, OR has climbed N levels. That failure *is* the diagnosis — it locates the edge.

- Mark the concept `in-progress`, record the break-point `diff`.
- **Remediate at break-point difficulty:** re-teach the specific gap (briefly), then re-test at that level until passed, then resume climbing toward Target.
- Don't abandon a concept on first break — remediate. Do pause the session (not abandon) if the learner is fatiguing across many concepts.

## Per-concept mastery (feeds the gate)

A concept reaches `mastered` (the SKILL.md gate criterion) when it is **cleared at `diff` ≥ Target on ≥2 separate questions** (different `asked-ids`), most-recent correct, no miss in its last 2 asks. Recognition (a single MCQ hit) is the weakest evidence — require the two-retrieval bar before calling it mastered.

## Anti-cue rules

- **No repetition** — never reuse an `asked-id`; vary phrasing even when re-testing the same concept (Khanmigo's documented failure was self-repetition).
- **Equal-length options** — MCQ distractors roughly the same length/shape as the correct answer; no formatting tells (`teach`'s rule).
- **Plausible distractors** — each wrong option should map to a real misconception from the bank, so a wrong click is diagnostic.
