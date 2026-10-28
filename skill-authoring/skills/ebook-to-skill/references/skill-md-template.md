# SKILL.md template for book-derived skills

## Contents

- [The template](#the-template)
- [Sizing targets](#sizing-targets)
- [Voice rules](#voice-rules)
- [Common mistakes to avoid](#common-mistakes-to-avoid)

## The template

Copy the block below into `<skill-dir>/SKILL.md` and fill in `<BRACKETS>`. Constraints and rationale are in comments — strip the `<!-- -->` lines before saving.

```markdown
---
name: <slug>
description: <Framework cluster — noun phrase> from <Author>'s *<Book Title>* (<Publisher>, <Year>). Use when the user is <concrete trigger 1>, <concrete trigger 2>, <concrete trigger 3>, or asks about any named construct from the book (<comma-separated list of 5-12 named constructs>). Do NOT use for <negative trigger 1>, <negative trigger 2>.
---

<!-- DESCRIPTION RULES:
     - **Lead with a noun phrase, not a verb** ("Delegation, energy management, and founder-leverage frameworks from..." — not "Apply X's frameworks..."). Claude treats verb-led descriptions as workflow instructions and may *follow* the description instead of reading the file. Noun-led = trigger-shaped.
     - Third person. No "I can help...", no "you can use this...".
     - Max 1024 characters.
     - Include WHAT (cluster of frameworks) + WHEN (3+ specific triggers) + KEY TERMS (named constructs).
     - Include negative triggers if there's a risk of mis-firing.
     - This is the ONLY thing Claude sees when choosing skills — invest in it. -->

# <Book Title>

<One-line framing: what this skill does in plain English.>
Source: <Author>, *<Book Title>* (<Publisher>, <Year>). <One-line model lineage if relevant: e.g. "Builds on Hippocrates' four temperaments → Marston (1928) → modern DISC."> <If the book has a clear hinge / pivot chapter where the argument changes axis (e.g. nexus's Ch 6 "computers as agents not tools"), state it here: "Structurally hinged on Ch X, where <one-line description of the pivot>." Many serious nonfiction books have one; identifying it sharpens the rest of the skill.>

Core claim (verbatim, Ch X): **"<one-sentence verbatim quote from the book that operationalises its thesis>"**. <Optional one-sentence gloss.>

<!-- REQUIRED. Place the book's single most operational sentence — verbatim, with chapter citation, in bold — in the first 20 lines of the body. This is the *frame* future Claude sessions need in one line. If the book doesn't have a clean thesis-sentence, find the closest equivalent and quote it precisely. Don't paraphrase. If you cannot find a single verbatim sentence that does this work, that is a signal the book lacks a thesis hinge and the skill will be weaker for it. -->

## When to invoke

Trigger this skill when the user:

- <Concrete trigger pattern 1 — e.g. "Is preparing a difficult conversation">.
- <Concrete trigger pattern 2>.
- <Concrete trigger pattern 3>.
- Mentions any **named construct**: <list the book's named frameworks/tools — these are what makes the description searchable>.
- Says things like *"<example phrase 1>"* or *"<example phrase 2>"*.

Do **not** invoke for: <out-of-scope topic 1>, <out-of-scope topic 2>. <One-line on why — usually the book's frame doesn't apply.>

## Core frameworks (one line each)

<!-- The named constructs. Front-load. These are 80% of the skill's value.
     Pattern: **<Name>** — <one-line definition + when to use>. -->

- **<Framework 1>** — <one-line definition>. <When to apply>.
- **<Framework 2>** — <one-line definition>.
- **<Framework 3>** — …
- …

<Optional: a single closing paragraph on how the frameworks relate, or distribution stats from the book — e.g. "Most people are X; only Y% are Z".>

## <Diagnostic / profiling table — if applicable>

<!-- Many practical books have a comparison structure: 4 types, 5 tools, 7 patterns.
     A side-by-side table is high-leverage. Use only if the book supports it.
     If the book is a sequential argument (no comparison structure), skip this section. -->

| Signal | <Type A> | <Type B> | <Type C> | <Type D> |
|---|---|---|---|---|
| <Dimension 1> | … | … | … | … |
| <Dimension 2> | … | … | … | … |

## Worked examples / case studies (from the book)

<!-- Pull 3–5 of the book's most memorable concrete stories. These do more work
     than abstract trait-lists. Use one of two shapes depending on the book:

     SHAPE A — typology / diagnostic books (DISC, four colors, MBTI-like):
       bold lead-in describing the setup, then a bullet list of how each
       type/color/character reacts. See surrounded-by-idiots for the worked
       version.

     SHAPE B — argument / framework books (nexus, atomic-habits, zero-to-one):
       a short prose paragraph per case with chapter-file pointer. The case
       itself does the work; readers don't need a typology-grid to understand it.

     Always include if the book has memorable concrete stories; pick the shape
     that fits the book's argumentative structure. -->

**Shape A — typology / diagnostic:**

**<Story 1 — short label>** — <one-line setup>.
- <Type/character A>: <reaction>.
- <Type/character B>: <reaction>.
- <…>

**Shape B — argument / framework:**

**<Case 1 — short label>** (Ch N) — <one-paragraph setup of the case, what it shows, why the book uses it, and the chapter-file pointer for full detail>.

## How to apply (the core move)

<!-- Translate the book's diagnostic into action. Per-type tactics, written in
     practitioner voice ("Use X when Y", not "The book recommends X"). -->

- **<Type/situation A>:** <Concrete tactic 1>. <Concrete tactic 2>. <Anti-pattern to avoid>.
- **<Type/situation B>:** …
- …

<Optional: closing paragraph on the meta-rule — "when X and Y match, do Z".>

## <Other high-value chapter content>

<!-- Each chapter that has standalone practical content gets a short summary
     here pointing at the full chapter file. Use a table:
     Situation · Chapter file · Core move. Keeps SKILL.md compact while
     making references discoverable. -->

| Situation | Chapter file | Core move |
|---|---|---|
| <Use case 1> | `<NN-chapter-slug.md>` | <One-line take-away> |
| <Use case 2> | `<NN-chapter-slug.md>` | <One-line take-away> |

## How to use this skill in conversation

<!-- Behavioural rules for the assistant. Numbered list, imperative voice.
     Aim for 4–7 rules covering: when to diagnose, how to phrase advice, when
     to push back, when to load chapter files vs paraphrase. -->

1. **<Rule 1 — e.g. "Profile before prescribing">.** <Explanation>.
2. **<Rule 2 — e.g. "Name the construct out loud">.** <Explanation>.
3. **<Rule 3>.** <…>
4. …

## Known misreadings

<!-- REQUIRED — single highest-leverage section for skill maturity. Seed with the
     common confusions / hallucinations Claude (or readers) tend to make about
     this book. Each entry is a one-liner. Update as new failure modes surface
     during use. Anti-pattern: omitting this section because "the skill is new
     and we haven't seen any mistakes yet" — seed it from your Stage 3.5 grep
     misses and from the book's known reader-confusions. -->

- **<Construct X> is not <common-confusion Y>.** <One-line clarification — e.g. "The Buyback Rate is not your hourly rate; it's 25% of it.">
- **<Construct X>'s order is <real-order>, not <plausible-but-wrong-order>.** <Why this matters.>
- **<Enumerated list> members are <verbatim-from-book>** — not <fabricated-alternative>. <If LLM training data biases toward the wrong version, flag it.>
- **<Practice X> ≠ <similar-practice-Y>.** <The subtle distinction.>

## What this skill is *not*

<!-- Anti-scope. Crucial for skills built on pop-psychology / pop-business books
     that overclaim. Be honest about limitations. -->

- Not <out-of-scope use 1>. <Why.>
- Not <out-of-scope use 2>. <Why — sometimes "use a more rigorous tool instead".>
- Not a substitute for <expert role — clinical, legal, etc., where relevant>.

## Reference

- [references/index.md](references/index.md) — chapter map + named-construct lookup<+ pairing sources for the flagship case study, if any>.
- [references/glossary.md](references/glossary.md) — alphabetical term lookup.
- [references/chapters/](references/chapters/) — <N> per-chapter files. Load only what you need.
- [references/_evals.md](references/_evals.md) — 3 test scenarios.
```

## Optional sections (use when warranted, skip when not)

The following are *optional* additions some books need and others don't. Add only when the book genuinely needs them — adding an empty section is worse than no section.

### Empirical-strength tiers (use sparingly)

Some books — *Why We Sleep* is the worked example — make one long causal-strength argument with discrete claims that sort cleanly by evidence quality. For these, a Tier 1 (Strong / consensus-aligned) / Tier 2 (Robust correlation, contested causation) / Tier 3 (Single-study or extrapolated) rubric does real work in the "How to use this skill in conversation" rules.

```markdown
## Empirical-strength tiers

When citing a specific claim from this book, sort by tier:

- **Tier 1 (Strong / consensus-aligned)** — <list>
- **Tier 2 (Robust correlation, contested causation)** — <list>
- **Tier 3 (Single-study or extrapolated)** — <list>
```

**When to skip:** if the book is a framework / synthesis whose contested points are *qualitative* and scattered (Harari's *Nexus*; Munger's *Almanack*), the rubric is procrustean. Use the standard `## Known misreadings` section with specific claim-level caveats instead. The two patterns address the same problem in different book shapes; don't force both.

### Pairing sources for a flagship case study

When the book builds a signature case study readers will be tempted to slogan-quote (nexus's Facebook–Myanmar–Rohingya; Walker's WHO/cancer claim; Kiyosaki's real-estate anecdotes), add a `## Pairing sources` section to `references/index.md` listing 3–5 primary or specialist sources to pair with the book's framing.

```markdown
## Pairing sources for the <case> case

Use *<Book Title>* for the **frame**; use the sources below for **specifics** and **prior conditions**:

| Source | What it grounds |
|---|---|
| <Source 1> | <One-line: what specific claim this verifies / falsifies> |
| <Source 2> | <…> |
```

**Hard constraint: pairing sources MUST be supplied by the human at Checkpoint 2.** The LLM building the skill must not auto-synthesise this list — confident-sounding hallucinations (an author's wrong book; a misnamed report; a fabricated journal title) are the failure mode. If the human can't supply specific titles at Checkpoint 2, omit the section entirely.

## Sizing targets

- **Frontmatter description:** 400–900 chars (max 1024).
- **SKILL.md body:** target 100–200 lines; absolute ceiling 500.
- **Chapter files:** vary by source — 1k–80k chars each is fine, don't trim.
- **Glossary:** 20–60 entries depending on book density.
- **Eval count:** exactly 3 (recall + application + provenance).

## Voice rules

- Practitioner voice: "Use X when Y" over "The book teaches X".
- Imperative for assistant-behaviour rules ("Profile before prescribing", not "It is recommended that you...").
- **Naming honesty.** Title-case only terms the **author** Title-cased. Working labels (a practice the book describes but doesn't name) carry an explicit `*(working name; not from book)*` qualifier the first time they appear. Inventing canonical-sounding labels for un-named practices is the most common subtle hallucination — it gives readers and downstream agents the false confidence that they can cite the term back.
- Avoid hedging language ("maybe", "sometimes", "in some cases") in the frameworks section — that's where confidence matters.
- Hedging is appropriate in **What this skill is not** — be honest about pop-science limits.
- Every numeric formula, enumerated list, and Title-Cased construct must be **grep-verifiable** against `references/chapters/`. If the verifier (`audit_skill.py --verify-claims`) flags a miss, fix the wording before shipping. See [audit-checklist.md § Known hallucination categories](audit-checklist.md#known-hallucination-categories).

## Common mistakes to avoid

- **Description in first person** — "I can help you..." breaks Claude's skill-selection. Always third person.
- **Description leads with a verb ("Apply...", "Use...", "Convert...")** — Claude treats verb-led descriptions as workflow instructions and may follow the description verbatim instead of reading SKILL.md. Lead with the noun phrase (e.g. "Delegation, energy management, and founder-leverage frameworks from..."). See [superpowers writing-skills CSO finding](https://github.com/obra/superpowers/blob/main/skills/writing-skills/SKILL.md).
- **Generic triggers** — "Use when working with leadership topics" is uselessly broad. List the specific named constructs and phrases.
- **Section bloat** — every section should justify its tokens. If you can't say what a section does in one breath, cut it.
- **Burying the named constructs** — they should appear in the description AND in the first H2 section. Searchability is the value.
- **No anti-scope** — every skill needs "what this is not". Without it, the skill mis-fires on adjacent queries.
- **No "Known misreadings"** — the highest-leverage mature-skill content. Seed from your Stage 3.5 verifier misses.
- **Loading the whole book as one `book.md`** — splits into `chapters/` always. The monolith pattern defeats progressive disclosure.
- **Inventing canonical names** for practices the author describes but doesn't title (e.g. coining "Transformation Sheet" for a tool the book never names). Always flag with `*(working name; not from book)*`.
- **Skipping Stage 3.5** ("the LLM probably got it right") — every comprehensive book skill that has been audited so far has had at least one hallucination caught at Stage 3.5.
