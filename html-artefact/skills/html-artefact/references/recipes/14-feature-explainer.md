# 14 — Feature explainer

**Category:** Research & Learning
**Reference HTML:** `references/thariq-examples/14-research-feature-explainer.html`
**JS:** Light — tab-bar switcher

## Intent

Explain one feature in one codebase (here: rate limiting in `acme/api`). TL;DR at top, collapsible request-path steps so the reader drills in where they want, tabbed config snippets for different scenarios, and an FAQ at the end. Designed for someone who needs to understand a specific feature today — not a comprehensive system walkthrough.

> **Note:** This recipe is for one feature in a few hundred lines of HTML. For a bigger system, make one page per feature and link them.

## Example prompt

> Explain rate limiting in this repo. Start with a TL;DR box, then walk the request path step by step with each step collapsible so I can drill in. Tabbed code snippets for the three config flavours (per-IP / per-user / per-route). End with an FAQ.

(Thariq's variant: *"I don't understand how our rate limiter actually works. Read the relevant code and produce a single HTML explainer page: a diagram of the token-bucket flow, the 3-4 key code snippets annotated, and a 'gotchas' section at the bottom. Optimize it for someone reading it once."*)

## Standard sections (in order)

1. Eyebrow + H1
2. **TL;DR callout** (kraft-paper card) — the punchline in 2-3 sentences
3. **The request path, step by step** — four (or N) `<details>` blocks. Each `<summary>`: step number + file location in mono + one-line description. Inside each: code snippet + annotation paragraph
4. **Configuring** — `.tabbar` with 2-4 `<button>` tabs ("per-IP" / "per-user" / "per-route"). Each tab swaps the visible `.tabs > div` panel of code + commentary
5. **Gotchas worth knowing** — prose callouts for the spec's blind spots
6. **FAQ** — `<details>` / `<summary>` Q&A list

## Interactive elements

- **Native `<details>` expand/collapse** on steps and FAQ items — no JS
- **Tab-bar buttons** swap visible code panels — `.on` class on the active button, `.show` on the active panel

## JS patterns to copy

- **Native `<details>` for collapsibles** (`shared-patterns.md` §3)
- **Tab switcher** — click handler toggles `.on` on the button and `.show` on the matching panel by id. ~15 lines

## Distinctive styling

- **All-native `<details>`** — disclosure triangle is CSS-styled (`summary::-webkit-details-marker { display: none; }` + custom)
- **Tab buttons** use `.tabbar button.on` state class
- **Step locations** (`middleware/ratelimit.ts:21`) live in mono inside the `<summary>` line

## Anti-patterns

- **Don't use JS for collapsibles when `<details>` works.** Accessibility, keyboard, mobile — all free with native.
- **Don't put tabs above the steps.** Order matters: walkthrough first (understand the flow), config recipes second (apply it).
- **Don't try to cover everything.** This is one feature, not a system. If the scope is bigger, split it into one page per feature.

## Variations

- **For an abstract concept** (not a feature in one codebase) with a live interactive figure, see recipe `15-concept-explainer.md`
- **For a multi-component system walkthrough**, make one page per component and link them — do not grow this page
