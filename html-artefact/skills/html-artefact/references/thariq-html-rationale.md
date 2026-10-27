# Why HTML — the case in one page

Distilled from Thariq's *"Using Claude Code: The Unreasonable Effectiveness of HTML"* (May 2026). Read once; refer back when you're tempted to default to markdown.

## The core argument

Markdown has been the dominant agent → human file format. It's portable, has some rich-text capability, and is easy to edit by hand. But as agents have become more powerful, three things have changed:

1. **Agent outputs are getting longer.** Markdown files past ~100 lines become hard to read — nobody actually reads them top-to-bottom, and you can't get anyone else in your org to either.
2. **The user mostly isn't editing the file by hand any more.** They prompt the agent to edit it. That removes one of markdown's biggest historical advantages.
3. **What the artefact needs to express has gotten richer** — comparisons, live mocks, sliders, drag-and-drop, real flowcharts, code reviews with margin annotations. Markdown can ASCII-diagram its way through some of these, but the result is a workaround.

HTML wins on every one of these: more readable at length, easier to skim and navigate, far more expressive, just as easy for an agent to author, shareable as a URL.

## What HTML buys you

| Capability | What HTML lets the agent do |
|---|---|
| Tabular data | Real `<table>`s, sorted/filtered if needed |
| Design tokens | Live `<style>` declarations, CSS custom properties |
| Illustrations | Inline `<svg>` — vector art the user can tweak by hand |
| Code snippets | Syntax-highlighted, side-by-side, copy buttons |
| Interaction | Sliders, toggles, drag-and-drop, copy-to-clipboard |
| Workflows | SVG + HTML node click handlers — real flowcharts, not ASCII |
| Spatial data | Absolute positioning, canvases, maps |
| Images | Inline as SVG or data-URI when single-file matters |

Almost no information shape the agent can read can't be expressed more efficiently in HTML.

## What HTML costs

Two real costs to be honest about:

1. **Slower to generate.** ~2-4× the tokens of an equivalent markdown file. With 1M context (Opus 4.7) this is rarely a problem in practice.
2. **HTML diffs are noisy.** The biggest drawback. Reviewing a chain of HTML edits in git is unpleasant. The mitigation: regenerate rather than edit in place across sessions. Treat each artefact as a fresh write.

The trade is worth it the moment the artefact is going to be read by a human. The cost is paid once at write time; the benefit is paid every time the artefact is opened.

## When HTML wins clearly

- **Specs, planning, exploration.** Generate N options side-by-side. Easier to react to a visible mockup than imagine one.
- **Code review & understanding.** Render diffs with inline annotations, draw module maps, walk reviewers through file by file.
- **Design & prototypes.** Sketch in HTML even when the target is React/Swift. Prototype animations with knobs.
- **Reports, research, learning.** Multi-source synthesis into a skimmable explainer with real diagrams and tabbed code snippets.
- **Custom editing interfaces.** A throwaway HTML editor purpose-built for one task — drag-sort tickets, edit a config with dependency warnings, tune a prompt with live preview. Always end with a copy-back button.

These are the five buckets the 20 reference demos cover. This skill ships a recipe for each one.

## When markdown wins

- **Editing in plain text continuously.** Notes, journals, todo lists.
- **Spec docs that live with code in a repo.** PR reviewability beats expressiveness.
- **One-paragraph answers.** Just answer inline.
- **Prompts and config files.** Markdown / plain text is meant to be edited.

## Two-way interaction is HTML's superpower

The pattern Thariq returns to: build an artefact, fiddle with it, copy the result back as a prompt or JSON. The artefact is a temporary tool that exists for one decision.

- Drag thirty tickets across columns → click "Copy as markdown" → paste into the planning doc.
- Toggle feature flags with dependency warnings → click "Copy diff" → paste into the PR.
- Tune a prompt template with live filled previews → click "Copy prompt" → paste back into Claude Code.

Every editor in the gallery ends with a copy-back button. That's the loop closer — without it, the artefact is half-finished.

## The premise that makes the suite work

**Single-file standalone HTML.** Every demo is one `.html` file, no external dependencies. You can:

- Double-click and it opens in any browser
- Upload to S3 and share a link
- Email it as an attachment
- Print to PDF
- Read it offline

The moment an artefact depends on a CDN or external CSS, the premise breaks. The skill enforces this in its self-audit step.

## The frontend-design plugin

Thariq calls out that **the frontend-design plugin** (`frontend-design:frontend-design`) is the right partner when an HTML artefact needs more design opinion than the standard kraft-paper template carries. Use it for any artefact that's going to be shared widely or that represents a product surface. For the throwaway and document-style artefacts this skill targets, the bundled palette + house style is enough.

## Don't over-skill-ify

Thariq's own warning: *"I'm a little bit afraid that people will read this article and turn it into a /html skill or something. While there might be some value in that, I want to emphasize that you don't need to do much to get Claude to do this."*

This skill respects that warning by being **a router by intent, not a forced workflow**. It catalogues 24 patterns (Thariq's 20 and four of ours) + their prompts, ships the house style as a paste-ready file, and otherwise stays out of the way. The right move is often to read a recipe for the closest pattern, then prompt from scratch following the house style. The skill exists to make that lookup fast, not to gate-keep the work.

## Source

- Original piece: https://x.com/trq212/status/2052809885763747935 (May 2026)
- Gallery of 20 demos, plus 11 more under `/unknowns/`: https://thariqs.github.io/html-effectiveness/
- Files in this skill mirror the gallery in `references/thariq-examples/` and indexed by intent in `references/recipes/`.
