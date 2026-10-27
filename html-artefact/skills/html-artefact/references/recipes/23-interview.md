# 23 — Interview

**Category:** Know your unknowns · before building
**Reference HTML:** `references/thariq-examples/unknowns/06-interview.html` (Thariq's; prompts in that folder's `README.md`)
**Pattern template:** `references/reply-builder.html` (prompt card, copy helper, state-in-JS builder)
**JS:** Medium to heavy: a small state machine with a progress rail, auto-advance and a summary
**Evidence:** preferred over the plain form in a side-by-side comparison

## Intent

A feature is still ambiguous. Ask the user one question at a time, ordered by how much their answer changes what gets built, and end with a decisions summary plus a brief they paste back. The user answers by clicking, not by writing paragraphs.

## Example prompt

> Interview me one question at a time about anything still ambiguous in the annotation-export feature. Prioritize questions where my answer would change the architecture.

## Standard sections (in order)

1. **Masthead.** Eyebrow, h1 that states the number of questions, one-sentence lede.
2. **Prompt card.** The user's prompt, verbatim, with Copy.
3. **Frame bar.** What the questions were built from (files, history, the date and commit you measured at).
4. **Measured facts.** A short stat strip of numbers that shaped the questions. Say how each was measured and what you could not check.
5. **Progress rail.** One item per question, tagged by blast radius (architecture / data / UX / polish). Done items get a tick.
6. **One question at a time.** Each card has:
   - the blast-radius tag and the question;
   - 2–3 lines of "what the repo says", with evidence;
   - 2–4 option cards, each with a trade-off sentence;
   - a **lean** with a confidence and its weakest link;
   - a free-text "Other" and a "skip, take my lean" link.
7. **Summary.** A decisions table, then a **brief to paste back**: the decisions as a numbered list, a note on which answers are fixed (architecture) and which may be revisited, and the next instruction (for example "write the spec first, no code").

## Interactive elements

- Click an option (or press its number); the card advances after about a second; Back always works.
- The rail jumps to any question.
- "Skip, take my lean" records the lean as the answer.
- The summary has Copy brief and Restart.
- State is one object: `{answers, index}`. Render functions read it. The brief is built from it by one function.

## Rules that came out of the comparison

- **Order by blast radius.** The first question should be the one that could change the architecture.
- **Every question must change something.** If two answers lead to the same build, drop the question.
- **About eight questions at most.** Past that, take leans and say so.
- **Give a lean on every question,** with a confidence and a weakest link, so the user can accept it fast.
- **The brief carries the decisions and the next step.** A table the user cannot paste is not the end.
- Measure facts once, cite them, and say what you could not check.

## Verify before you hand it over

Walk the page the way a user would: answer every question, reach the summary, press Copy brief, and check that each decision appears in the copied text and that the text ends with the next instruction. Run `scripts/audit.sh`.

## Anti-patterns

- All questions on one long form: it hides the order.
- Options without trade-offs.
- Free-text only.
- A summary that is not copyable.

## Optional additions, not tested

The version this recipe replaced in the comparison had a live "architecture so far" panel with a check for answers that collide, and an export that listed the build and the cost of each decision (a much longer brief). This recipe's form was preferred overall. Either addition may still help on a feature with many coupled choices.
