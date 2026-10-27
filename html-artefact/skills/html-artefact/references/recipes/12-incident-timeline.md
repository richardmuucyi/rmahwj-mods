# 12 — Incident timeline

**Category:** Reports
**Reference HTML:** `references/thariq-examples/12-incident-report.html`
**JS:** None — sticky TOC is CSS-only

## Intent

A post-mortem for one incident as a single-page document with a vertical minute-by-minute timeline, log excerpts inline, root cause, impact numbers, and an action-item checklist. Readable end-to-end (not just skim-and-bounce), with a sticky TOC for jumping.

## Example prompt

> Write up INC-2025-0412 (elevated 502s on task sync) as a single-page post-mortem. Vertical timeline with timestamps, log excerpts at each beat, root cause, impact numbers, and the action-item checklist. Include a TOC sidebar.

## Standard sections (in order)

1. Title + incident ID + severity chip (kraft-paper card)
2. **`.toc` sidebar (left rail, sticky)** with anchored links to every H2
3. **Timeline** — vertical `.timeline` rail with `.tl-dot` per beat (severity-coloured); each entry has timestamp + one-line summary + log line in mono + body paragraph
4. **Root cause** — prose H2, often with a `.code-panel` or `.diff-line` block showing the offending code
5. **Impact** — numeric summary in stat-card format (users affected, duration, error rate peak)
6. **Action items** — checklist (`<input type="checkbox" disabled>` for read-only feel) with owner + due date per item

## Interactive elements

None — TOC links are anchor-only (smooth-scroll via CSS).

## JS patterns to copy

None.

## Distinctive styling

- **Vertical timeline rail** — one absolutely-positioned 1.5px line + circular `.tl-dot` nodes, severity-coloured
- **Sticky `.toc` left-rail** mimics docs sites (Stripe / Linear) without any JS
- **Inline log lines** in mono with faint background tint — no full code-block frame; logs aren't "code," they're evidence

## Anti-patterns

- **Don't put the timeline in a `<table>`.** The visual rail is the whole point and tables can't render it cleanly.
- **Don't compress timestamps.** Show every beat in the form `14:23:01 UTC`. Reader needs the granularity to triage.
- **Don't omit the action items.** A post-mortem without follow-ups is just a story.

## Variations

- **For a meeting-format walkthrough** (manager wants the highlights, not the depth), see recipe `09-slide-deck.md`
- **For a multi-incident pattern report** (not a single incident), use a status-report skeleton with each incident as a row — recipe `11-status-report.md`
