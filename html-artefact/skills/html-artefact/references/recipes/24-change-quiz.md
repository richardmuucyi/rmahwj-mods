# 24 — Change quiz

**Category:** Know your unknowns · after building
**Reference HTML:** `references/thariq-examples/unknowns/11-change-quiz.html` (Thariq's; prompts in that folder's `README.md`)
**Pattern template:** `references/reply-builder.html` (prompt card, copy helper, state-in-JS reply builder)
**JS:** Heavy: a quiz engine with shuffled options, a pass path and a fail path, both ending in a reply
**Evidence:** preferred over the plain form in a side-by-side comparison

## Intent

Before the user merges or signs off a change, prove they understand it. Give a short report (verdict, context, mental model, what was done, what is non-obvious, what is proven), then a quiz they must pass. A miss sends them back to the exact section; a pass hands them a reply they can paste.

## Example prompt

> I want to make sure I understand everything that happened in this change before I merge. Give me an HTML report on the export-feature diff — context, intuition, what was done — with a quiz at the bottom that I must pass.

## Standard sections (in order)

1. **Masthead.** Eyebrow, h1 naming the change, one-sentence lede.
2. **Prompt card.** The user's prompt, verbatim, with Copy.
3. **Frame bar.** What the report is built from (the diff command, the commit or range).
4. **Check first.** Before explaining anything, check the state of the change: is it already merged? Are there unrelated uncommitted edits? Say so in a callout. Both versions in the comparison found a change that was already in the main line, and put it at the top.
5. **Verdict first.** Three short points: what the change does, the subtle part, how thin or strong the evidence is. Then stat tiles (files, lines added and removed, tests).
6. **Context.** Why this change exists, in two or three cards.
7. **Mental model.** Two diagrams (before and after), hand-drawn SVG or boxes. Optional: a small "try it" panel with 3–4 scenario buttons that show old and new behaviour side by side.
8. **What was done, file by file.** One line each, with why.
9. **Non-obvious behaviours.** Three or four, each with an id the quiz can link to.
10. **What is proven, and what is only claimed.** Honest, short.
11. **The quiz.** Six to eight scenario questions, one answer each. Options are shuffled. Each answer gets feedback at once.
12. **Result.** Pass: a **Cleared** box with a reply to paste and optional follow-up checkboxes. Fail: **Not yet**, links to the sections the missed questions came from, and a reply that says which questions were missed and asks for a re-explanation of only those.

## Interactive elements

- Question data in one array: `{q, opts:[[text, 0|1]…], good, anchor, anchorLabel}`.
- A shuffle on build; a Retry that rebuilds and reshuffles.
- `finish()` branches on the score: pass builds the pass reply, fail builds the fail reply and the link list.
- Both replies come from small builder functions that read the state (`shared-patterns.md` § 7).

## Rules that came out of the comparison

- **Ask about consequences, not recall.** "A render sits behind another job for two minutes. What does the loop do?" beats "Which file changed?".
- **Every question must be answerable from the page,** and each has an anchor to the section that answers it.
- **Both result paths must end in a reply.** The pass reply lists the follow-ups the user ticked. The fail reply names the missed questions and asks for those only.
- **Pass bar:** all correct is the default (Thariq's page uses 6 of 6). A looser bar such as 10 of 12 is allowed; say the bar in the intro.
- The answer key sits in the page's JS. That is fine: the user is the one being tested.

## Verify before you hand it over

Run both paths. Answer everything correctly and check the Cleared box and the pass reply. Answer everything wrongly and check the Not yet box, that every re-read link points at an element that exists, and the fail reply. Do not trust a text match: a running "Score: 0 / 8" counter is visible from the start and is not a result. Run `scripts/audit.sh`.

## Anti-patterns

- Trivia questions.
- The correct option always in the same place, or always the longest.
- A result that appears below the fold with no scroll.
- A pass that ends in a one-line sign-off the user cannot send to anyone.
