# Feynman Teach-Back Protocol (Mode 2)

## Contents
- [The inversion](#the-inversion)
- [The hidden rubric](#the-hidden-rubric)
- [The teach-back round](#the-teach-back-round)
- [Surfacing gaps](#surfacing-gaps)
- [Seed a catchable error](#seed-a-catchable-error)
- [The incrementalist checklist](#the-incrementalist-checklist)
- [Exit (the transfer check)](#exit-the-transfer-check)

"The Feynman technique" is a folk label; the studied mechanisms underneath are the **self-explanation effect** (g≈0.55), the **generation effect**, and **learning-by-teaching** (the protégé effect). This protocol builds those mechanisms. It plugs into THE LOOP (SKILL.md) as the per-turn body for `--feynman` mode.

## The inversion

In quiz mode the agent asks and the learner answers. **Here it flips: the LEARNER teaches; the agent is the novice.** This is what unlocks the protégé effect — and it requires three design levers:

1. **Ego-protective buffer** — frame every gap as *the agent's* failure to understand, never the learner being wrong: "I didn't quite follow that — can you teach me again?"
2. **A named persona with stakes** — "I'm prepping for a test on this tomorrow." Stakes make the learner take the teaching seriously.
3. **Responsibility** — the learner owns getting the agent to understand.

## The hidden rubric

Before the round, build a **hidden** rubric per concept from the source: **3–7 must-mention atomic items** + **1–2 misconception traps** (from `misconception-banks.md`). Keep it hidden — revealing it hands over the answer. It's the scoring key, not a checklist for the learner.

## The teach-back round

1. Ask the learner to explain the concept **simply — "as if to a 12-year-old."** Plain language is the test; jargon is where understanding hides.
2. Score their free-text **per rubric item**: `{present | absent | incorrect}` with a one-line justification each (per-item beats a holistic score and yields *nameable* gaps).
3. Watch for the three tells of a real gap: **jargon used without grounding**, **a skipped causal link**, **hand-waving** ("it just works", "somehow").

## Surfacing gaps

- **Surface only the top 1–2 gaps per round** — dumping the full list overwhelms and effectively gives away the rubric.
- Frame each as **the agent's confusion + a retrieval-forcing question**, never the missing fact: "I lost you at why the token has to be signed — what would break if it weren't?"
- **Never state the missing fact.** Stating it converts active recall into passive restudy and kills the mechanism. Ask; don't tell.

## Seed a catchable error

An agent that's *too competent* removes the learner's chance to catch and correct mistakes. So once in a while, restate something **subtly wrong** and ask for confirmation: "So I think the watchlist check runs *before* the doc-code check — right?" Let them catch it. A correction the learner makes is high-value evidence of real understanding.

## The incrementalist checklist

Show a visible "**what I understand so far**" list that fills in each round as rubric items get covered. It signals progress (growth-mindset lever) without revealing the *un*covered items' content — show covered items only.

## Exit (the transfer check)

- **Cap 2–3 refinement cycles per concept.** More than that and you're grinding, not teaching — remediate from the source or pause.
- A concept exits (counts toward the SKILL.md gate) when: **all rubric items present**, **jargon-free**, **no live misconception**, AND a **transfer check passes** — "where would this break?" or "apply it to [a new scenario it wasn't taught on]." Transfer, not recall, is the bar for Feynman mode.
