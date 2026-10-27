# 17 — PR writeup for reviewers

**Category:** Code Review & Understanding
**Reference HTML:** `references/thariq-examples/17-pr-writeup.html`
**JS:** None — sticky TOC is CSS-only

## Intent

The author's side of a PR. Where `03-annotated-pull-request.md` is "here's what changed and the risk map," this is "here's why I did it, file by file, and here's where to focus your review." For reviewers who haven't touched the code in months.

## Example prompt

> Write up PR #312 for my reviewers. Explain the motivation, walk them through the change file by file with the *why* for each, show before/after behaviour, and tell them exactly where to focus. They haven't touched the notification code in six months.

## Standard sections (in order)

1. Repo line + PR number/title + author + `.prompt-box`
2. **Sticky-sidebar `.toc`** with anchors to every section below (#why, #tour, #focus, #tests, #rollout)
3. **Why** — motivation prose. Why now, what problem, what we picked over what
4. **File-by-file** — `.step` blocks (one per file): file path `.badge`, "why this file" paragraph, code excerpt
5. **Where to focus your review** — `.panel` with bulleted hotspots ("Pay attention to the streaming backpressure in `notify-worker.ts`")
6. **Test plan** — bullets covering what's tested + what was checked manually
7. **Rollout** — bullets: feature flag, monitoring, rollback steps

## Interactive elements

- **Sticky TOC** with smooth-scroll anchors. Active section highlight via `:target` CSS pseudo-class — no JS

## JS patterns to copy

None.

## Distinctive styling

- **Left-rail `.toc`** mimics docs sites (Stripe / Linear) — sticky, kraft-paper border, mono link text
- **Same `.step + .badge` pattern as recipe 04** (module map) — visual consistency across "tour" artefacts
- **Anchor IDs encode meaning** — `#why`, `#tour`, `#focus`, `#tests`, `#rollout`. Easy to link to specific sections from Slack/email

## Anti-patterns

- **Don't dump all files into one `<pre>`.** The `.step` per file is what lets the "why" paragraph sit next to the diff.
- **Don't skip "where to focus."** It's the section that makes this artefact different from a regular PR description.
- **Don't write more than 2 paragraphs of motivation.** Reviewers skim — front-load the verdict.

## Variations

- **Pair with recipe 03 (annotated PR).** This is the author's view; 03 is the reviewer's view. Generate both for high-stakes PRs.
- **For internal post-mortems** (not PRs), the same skeleton works — replace "where to focus" with "lessons" and "rollout" with "preventative action."
