# Annotated examples — production skills built from books

Two skills built with this tool. Neither runs as its own skill any more. `surrounded-by-idiots` was one until 2026-10-14, when it became one lens card in a combined mentoring skill; its layout below is still the reference for a book skill. `buy-back-your-time` was demoted to the [[Buy Back Your Time]] synthesis page on 2026-05-21 and survives only in git history — its walkthrough below is kept as a template of what "done well" looked like.

## Contents

- [Example 1: buy-back-your-time (Dan Martell)](#example-1-buy-back-your-time-dan-martell)
- [Example 2: surrounded-by-idiots (Thomas Erikson)](#example-2-surrounded-by-idiots-thomas-erikson)
- [What both share](#what-both-share)
- [Failure case study: buy-back-your-time v1](#failure-case-study-buy-back-your-time-v1)

## Example 1: buy-back-your-time (Dan Martell)

**Source:** Dan Martell, *Buy Back Your Time* (Portfolio/Penguin, 2023).

**Why it's a good example:** clean named-framework extraction. The book has 13 distinct constructs (Buyback Principle, Buyback Rate, DRIP Matrix, etc.). The skill's description names every single one, making it highly discoverable.

**Structure:**

```
buy-back-your-time/
├── SKILL.md                              (~65 lines)
├── references/
│   ├── index.md                          (chapter map + named-construct index)
│   └── book.md                           ← ANTI-PATTERN: this was a monolith
└── assets/                               (empty)
```

**What this skill does well:**

- Description starts: "Delegation, energy management, and founder-leverage frameworks from Dan Martell's Buy Back Your Time..." — exact pattern from the template.
- Description's WHEN clause is concrete: "deciding what to delegate, drop, or keep; computing a Buyback Rate; mapping tasks on the DRIP Matrix..." — practitioner phrasing, not "use when thinking about productivity".
- Has explicit negative trigger: "Do NOT use for generic productivity advice unconnected to delegation..."
- "Core frameworks (one-line each)" section front-loads all 13 named constructs in a scannable list — exactly the front-loading pattern.
- "How to use this skill in a conversation" gives Claude behavioural rules ("Ground the recommendation in a specific framework", "Push back on Time Assassin behaviour by name").

**What this skill could improve:**

- `references/book.md` is a single monolithic dump. Should be split into per-chapter files under `references/chapters/` — this is the highest-leverage fix.
- No `glossary.md` or `_evals.md` yet — would benefit from both.

## Example 2: surrounded-by-idiots (Thomas Erikson)

**Source:** Thomas Erikson, *Surrounded by Idiots* (St. Martin's, 2019).

**Why it's a good example:** demonstrates the **fully-evolved** layout — what `buy-back-your-time` should grow into.

**Structure:**

```
surrounded-by-idiots/
├── SKILL.md                              (131 lines — within budget)
├── references/
│   ├── index.md                          (94 lines — TOC + named-construct lookup)
│   ├── glossary.md                       (83 lines — A–Z terms with chapter refs)
│   ├── _evals.md                         (83 lines — 3 test scenarios)
│   └── chapters/                         (25 per-chapter files, on-demand)
│       ├── 00-foreword.md
│       ├── 01-introduction.md
│       ├── 02-ch01-listener-terms.md
│       ├── ...
│       └── 24-further-reading.md
```

**What this skill does well:**

- **Per-chapter file split.** Each chapter is its own file (`05-ch04-red-behavior.md`, `14-ch13-bad-news.md`). Claude loads only the chapter relevant to the query (~10–80KB) instead of the entire 460KB book.
- **Position-prefix slugs.** `05-ch04-red-behavior.md` keeps the file listing in book order while making the slug self-describing.
- **`index.md` opens with Contents.** A `head -100` preview reveals the full chapter map.
- **Named-construct index in `index.md`.** Table of "construct → chapter file" — the orchestrator SKILL.md points at this.
- **Glossary is alphabetical + cross-referenced.** Each entry has a chapter pointer (`→ 19-ch18-history.md`). Partial reads still surface usable structure.
- **Evals exercise three intents:** recall ("decoding a difficult colleague"), application ("adapting a sensitive message"), provenance ("where does DISC come from").
- **Description lists named constructs:** "DISA, the four colors, adaptation, energy thieves, body language tells".
- **Explicit anti-scope:** "Not a hiring or psychometric tool. Not a substitute for clinical advice."
- **Diagnostic anecdotes section** — pulls the book's memorable concrete stories (oil-stain, IKEA-flat-pack, Greger's notes). These do more work than abstract trait lists.

**What this skill could improve:**

- SKILL.md at 131 lines is well within budget but could absorb a small "translation table" example.
- No `assets/` directory (the book has 21 images but they don't add value to a text skill).

## What both share

Pattern fingerprint for any book skill:

1. **Description structure:** `Apply <Author>'s <framework cluster> from <Book Title> (<Publisher>, <Year>). Use when <triggers>, or asks about any named construct from the book (<list>).`
2. **First H2 is "When to invoke"** — explicit trigger enumeration.
3. **Second H2 is "Core frameworks"** — named-construct front-loading.
4. **Anti-scope section** — "What this skill is not" or similar, near the end.
5. **References section** — `index.md`, `glossary.md` (when present), chapter directory, evals.
6. **House-style match:** both follow the same SKILL.md skeleton. New book skills should match this fingerprint visually so the user's skill library reads consistently.

When building a new book skill, **read both** before drafting. They settle most decisions ("should I have a profiling table? what's the description length sweet spot? where do I put the lineage paragraph?") without further deliberation.

## Failure case study: buy-back-your-time v1

The current production skill is v2. v1 shipped factually wrong on four points — caught only by a deliberate review pass. Worth studying because the same failure modes recur on every LLM-synthesised book skill, and they're invisible until grep-verified.

**Context.** v1 was built via `skill-seekers` from the EPUB, then hand-rewritten because skill-seekers' enhancement step crashed (see [workflow.md § Known upstream tool bugs](workflow.md#known-upstream-tool-bugs-read-first)). The hand-rewrite drew on memory of the book + LLM training data — without grep-verifying against the chapter files.

**What v1 said (wrong) → what the book says (correct):**

| # | Claim in v1 SKILL.md | Reality from `references/chapters/` | Failure category |
|---|---|---|---|
| 1 | Buyback Rate formula: `(annual income ÷ 8,000) ÷ 4` | `(annual pay ÷ 2,000) ÷ 4` — equivalently `÷ 8,000` in a single step. v1 chained the two divisions, off by 4×. | Wrong numeric formula |
| 2 | Time Assassins: Staller / Speed Demon / Supervisor / **Saviour** / **Superhero** | Staller / Speed Demon / Supervisor / **Saver** / **Self-Medicator** | Fabricated enumerated list (LLM filled the last two slots with plausible-sounding alternatives) |
| 3 | 7 Pillars: family, faith, fitness, friends, finances, fun, future | **Health, Hobbies, Spirituality, Friends, Love, Finances, Mission** | Fabricated framework membership (LLM picked an alliterative "F" pattern from training data) |
| 4 | After fixing #3 in SKILL.md, a parallel subagent re-introduced the wrong list in `references/frameworks/index.md` | Same correct list as #3 | Derivative-file re-hallucination |

**How each was caught:**

- A reviewer agent grep'd specific phrases (`Buyback Rate`, `Saver`, `Self-Medicator`, `7 Pillars`) against the chapter files and reported the mismatch. Without grep, the wrong formula in particular reads as plausible — `÷ 8,000` is in the book, just as a one-step shortcut, not a chained division.
- The derivative-file re-hallucination (#4) was caught by a *second* review pass after v2 was thought to be complete. Even after SKILL.md was fixed, the parallel agent writing `frameworks/index.md` didn't grep — it pattern-completed from its own training.

**What v2 changed:**

- Hand-corrected the four facts above against grep'd chapter content.
- Added [Stage 3.5 — Verify against source](workflow.md#stage-35--verify-against-source-grep-before-claim) to `workflow.md` as a non-optional step.
- Added `--verify-claims` mode to `audit_skill.py` (checks V1/V2/V3/V4) so the same hallucination categories are caught mechanically next time.
- Added "Known misreadings" section to v2 SKILL.md listing the four errors so they're documented for future readers.
- Added `*(working name; not from book)*` rule in template voice rules — "Transformation Sheet" surfaced as a fifth issue (a practice the book describes but doesn't name), now flagged in v2.

**Takeaway.** *No book-derived skill is shippable until V1–V4 pass on `--verify-claims`.* The structural audit (B1–K4) only catches mechanical problems; factual hallucination needs the grep step. Every LLM-synthesised book skill that has been audited so far has had at least one V-class miss before the verifier was run.
