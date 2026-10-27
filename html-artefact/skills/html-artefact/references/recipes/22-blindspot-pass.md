# 22 — Blindspot pass

**Category:** Know your unknowns · before building
**Reference HTML:** `references/thariq-examples/unknowns/01-blindspot-pass.html` (Thariq's; prompts in that folder's `README.md`)
**Pattern template:** `references/reply-builder.html` (prompt card, copy helper, state-in-JS reply builder)
**JS:** Light to medium: include-checkboxes, per-card copy chips, one assembled prompt
**Evidence:** preferred over the plain form in a side-by-side comparison

## Intent

The user is about to change something they have never touched. Find what they do not know that they do not know, say what each surprise costs, show the evidence, and let them fold the findings they care about into one better prompt for the real change.

## Example prompt

> I'm adding a new SSO auth provider to Acme but I've never touched the auth module. Do a blindspot pass: find my unknown unknowns in this part of the codebase, explain each one, and tell me how to prompt you better for the implementation.

## Standard sections (in order)

1. **Masthead.** Eyebrow, h1 naming the change, one-sentence lede.
2. **Prompt card.** The user's prompt, verbatim, with Copy (`shared-patterns.md` § Prompt card).
3. **Frame bar: what this was built from.** Counts taken from what you actually read: "N files: x read in full, y in part, z unread · nothing run". Say "nothing run" when nothing was run.
4. **Asked vs actually walking into.** Two cells side by side. The ask in the user's words; the reality in one paragraph.
5. **Stat strip.** Count per type (landmine, convention, missing concept, history), the lowest confidence, and the number of commands run.
6. **The blindspot cards**, ordered by what a wrong edit costs. Each card has:
   - a type badge and a number;
   - a title that states the **surprise** as a sentence, not the topic;
   - 2–4 sentences of explanation and a "why it bites" line;
   - an evidence line with `path:line` and a confidence;
   - an **Include in my prompt** checkbox and a copy chip holding the one-sentence prompt fix.
7. **What this pass could not check.** A short honest list: what you did not read, run or measure.
8. **Your improved prompt.** Chips for "what are you changing?", a mode switch (plan first and touch nothing / make the change then show the diff), and the assembled prompt: the ticked cards become numbered constraints. One Copy button.

## Interactive elements

- Include checkboxes with all / none / count.
- A copy chip on every card.
- Change chips and a mode switch that rewrite the assembled prompt.
- State in one JS object; the assembled prompt is rendered from it (`shared-patterns.md` § 7).

## Rules that came out of the comparison

- **Numbers come from what you did.** Never type "47 files scanned" from a guess. List the files you read, then count the list.
- **Every card has evidence.** A file and line, or the page says "inferred" next to it.
- **Cap the cards at about ten.** Order by cost of a wrong edit, not by topic.
- **A card is a surprise.** "Sessions are double-written; the store you find first is the wrong one" is a card. "Be careful with sessions" is not.
- **Give the section 7 real content.** The user trusts the page more when it says what it did not do.

## Verify before you hand it over

Click one include checkbox and one copy chip; check that the assembled prompt changes and that Copy yields it. Run `scripts/audit.sh`.

## Anti-patterns

- Invented counts, or evidence-free cards.
- Generic risks that fit any codebase.
- Ending with a summary paragraph instead of the assembled prompt.
- A static "better prompt" the user cannot change.

## Optional additions, not tested

The version this recipe replaced in the comparison had a diagram of what one change touches and a glossary table of unfamiliar flags. This recipe's form was preferred overall. Add a glossary only when the reader truly lacks the vocabulary.
