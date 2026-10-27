# 03 — Annotated pull request

**Category:** Code Review & Understanding
**Reference HTML:** `references/thariq-examples/03-code-review-pr.html`
**JS:** Light — anchor-link smooth-scroll handler

## Intent

A PR diff as a scannable web page instead of a wall of unified-diff text. Risk map at top with severity-coloured chips that jump-link to each changed file; each file rendered as a card with inline margin annotations. Reviewer's view — they read this and know exactly where to focus.

## Example prompt

> Walk me through PR #247 (adding optimistic updates to task list mutations). For each changed file, show the diff inline with margin notes calling out anything risky, tag each file with a severity, and give me a risk map at the top so I know where to focus.

(Thariq's variant from his piece: *"Help me review this PR by creating an HTML artifact that describes it. I'm not very familiar with the streaming/backpressure logic so focus on that. Render the actual diff with inline margin annotations, colour-code findings by severity..."*)

## Standard sections (in order)

1. **PR head** — repo line, H1 (PR title), author chip with avatar, branch arrow (`feature/x → main`), `+142 / −38` stat strip in mono
2. **"What this PR does"** — one-paragraph H2
3. **Risk map** — `.risk-map` row of severity-coloured chips, one per changed file, anchor-linking to the file card below. `.legend` row underneath explaining the colours.
4. **Files** — stack of `<article class="file-card">`. Each card:
   - File path header (mono) + risk tag + `+/−` count
   - `.diff` block — 3-column grid: line-no, mark, code; `+` lines tinted `var(--olive)`-soft, `−` lines tinted `var(--clay)`-soft
   - Inline annotation panels next to risky hunks (margin notes)
5. **"Suggested next steps"** — closing checklist for the reviewer

## Interactive elements

- **Risk-map chips smooth-scroll to file cards** — `html { scroll-behavior: smooth; }` does most of it; ~25 lines of JS for explicit `click` handlers and an active-anchor highlight

## JS patterns to copy

- **Anchor-link smooth-scroll with active state** — `IntersectionObserver` on file cards toggles `.active` on the matching chip in the risk map

## Distinctive styling

- **Three-tier severity palette** — `var(--olive)` (safe), `#C8A772` (worth a look), `var(--clay)` (attention). Same colour appears on the chip, the file's risk tag, and the dot in the legend.
- **Diff lines as a 3-column grid** — line number / mark / code. Lets colour and line numbers stay aligned without monospace-prefix hacks.
- **Diff colours are NOT GitHub colours.** Use kraft-palette tints — `--olive`-soft for adds, `--clay`-soft for dels.

## Anti-patterns

- **Don't render diffs as `<pre>` with `+`/`−` prefixes.** The 3-column grid is what makes line-numbered diffs readable.
- **Don't import a diff library.** Author the diff structure by hand — five span classes for token highlighting cover everything.
- **Don't annotate every hunk.** Margin notes are for risky ones. Quiet hunks look quiet — that's signal.

## Variations

- **For the author's side** (motivation, file-by-file *why*, where to focus the review), see recipe `17-pr-writeup.md`. Pair the two for a complete PR experience.
- **For unfamiliar code in general** (no diff, just walk through what's there), see recipe `04-module-map.md`.
