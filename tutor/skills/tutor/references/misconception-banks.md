# Misconception Banks (select, don't invent)

## Why a bank

On a wrong answer the tutor must name the *specific* misconception, not just say "wrong." The catch: **LLMs are good at *selecting* the misconception behind a wrong answer (~92% among 4 options) but poor at *inventing* one from scratch.** So the tutor maintains a per-section bank of known misconceptions and **selects/ranks** from it — never free-generates.

## Building the bank (at Step 1, per concept)

Seed from two sources, in priority order:

1. **`data-misconception` tags.** If the source page's `.quiz` wrong-options carry `data-misconception="<name>"`, harvest them directly — they were authored against the source.
2. **The source's own gotchas.** `callout-warn` blocks, "Misconceptions" / "you might think X → actually Y" asides, and Troubleshooting "likely cause" entries are misconceptions in disguise.

## Bank format

A lightweight list per concept (kept in working context or appended to the session file):

```
concept: token bootstrap
  - id: m-flatrate     label: "treats every call as needing a fresh token"   → correct: tokens are cached until TTL
  - id: m-bearer-loc   label: "puts the token in the body, not the header"    → correct: Authorization: Bearer
```

Each entry: a short `id`, a 5–12 word `label` (the wrong mental model), and the one-line correction.

## Selecting at grade time

1. Read the learner's wrong answer.
2. **Match** it to the closest bank entry (semantic match, not exact). For a large bank, generate→retrieve→rerank: emit a short descriptor, embed/match to bank labels, pick the best.
3. Name it and remediate (`adaptive-quiz-protocol.md` → grading).
4. **If nothing in the bank matches**, say so honestly and describe the gap plainly — then **add the new misconception to the bank** (it'll recur). This is the one time you "invent": capturing a genuinely novel miss, not fabricating a plausible-sounding one.

## Distractor authoring (when you write MCQs)

Every wrong option should *be* a bank entry — so a wrong click is diagnostic. Plausible, equal-length, one-misconception-per-distractor. Tag it (`data-misconception`) so the loop can reuse it.
