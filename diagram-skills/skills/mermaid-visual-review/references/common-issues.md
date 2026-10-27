# Common Mermaid Rendering Issues

## Contents
- [Severity taxonomy](#severity-taxonomy)
- [How to use this file during self-review](#how-to-use-this-file-during-self-review)
- [How to extend this file](#how-to-extend-this-file)

This file is the shared ground truth for self-review and the fresh-eyes subagent. Every rendered PNG is compared against these entries.

Entries are **type-agnostic by default**. Type-specific entries have an `Applies to:` line naming the mermaid diagram types they affect. When the self-review pass is examining a diagram, it should read the relevant `references/diagram-types/<type>.md` file alongside this one.

## Severity taxonomy

- **CRITICAL (Phase A)** — Structural failures. Must be fixed. (Clipping, broken links, missing title).
- **POLISH (Phase B)** — Aesthetic refinements. Themed colors, spacing, typography.

Early-stop condition for the iteration loop is "no CRITICAL items". POLISH items are allowed in the final output.

---

### Missing title frontmatter

**Symptom:** Mermaid block has no `---\ntitle: …\n---` at the top.
**Severity:** CRITICAL
**Fix recipe keys:** `add-title-frontmatter`
**Rationale:** Every diagram in this skill is guaranteed to have a title — it is the one rule locked in at Q2 and enforced pre-flight. A diagram without a title cannot be unambiguously referenced in prose or caption.

### Text clipping inside nodes

**Symptom:** Rendered PNG shows labels cut at the node boundary (e.g., `TWINKLE SLO` instead of `TWINKLE SLOW`, `WARM DIM 30` instead of `WARM DIM 30%`).
**Severity:** CRITICAL
**Fix recipe keys:** `shorten-label`, `flowchart-padding-init`, `card-with-hr-pattern`
**Applies to:** flowchart, state (when using boxes)

### Subgraph direction ignored

**Symptom:** Subgraph declared with `direction TB` (or LR) but children render in the opposite direction. Most often seen when a top-level `flowchart LR` contains subgraphs asking for `direction TB`.
**Severity:** CRITICAL
**Fix recipe keys:** `card-with-hr-pattern` (replace subgraph with single-node cards)
**Applies to:** flowchart

### Cyclic edge scrambles node order

**Symptom:** A back-edge (e.g., `Z → A` in a left-to-right flow) causes the layout engine to place nodes out of the author's intended sequence. Visually the arrows flow both directions and the reading order is unclear.
**Severity:** CRITICAL
**Fix recipe keys:** `linearise-cycle`, `dashed-reset-arrow-to-terminal-node`
**Applies to:** flowchart, stateDiagram

### Card height or width mismatch

**Symptom:** Sibling nodes intended to look like a row of equal cards render at noticeably different sizes because one has more content (e.g., one card has three lines, another has one).
**Severity:** CRITICAL
**Fix recipe keys:** `equalise-card-content`, `shorten-longest-label`, `card-with-hr-pattern`
**Applies to:** flowchart

### Edge labels cramped against nodes

**Symptom:** Edge label text nearly touches the source or destination node border, leaving no breathing room.
**Severity:** POLISH (CRITICAL if labels overlap node text)
**Fix recipe keys:** `flowchart-padding-init`
**Applies to:** flowchart, stateDiagram

### Low-contrast text

**Symptom:** Label text is legible but visually washed out against the node fill — e.g. italic `off` in slate-grey on light-grey fill.
**Severity:** POLISH (CRITICAL if illegible at normal zoom)
**Fix recipe keys:** `bump-text-contrast`, `drop-italic`

### Dashed vs solid edge indistinguishable at render size

**Symptom:** A dashed edge intended to signal a different meaning (reset, async, rollback) looks identical to solid edges at the PNG's display size because the dash pattern is too fine.
**Severity:** POLISH (CRITICAL if the semantic distinction is load-bearing for the reader)
**Fix recipe keys:** `distinct-dashed-linkstyle`

### Arrow label overlaps another arrow

**Symptom:** Two edges' labels render on top of each other, or a label sits across a third arrow, making both unreadable.
**Severity:** CRITICAL
**Fix recipe keys:** `flowchart-padding-init`, `relabel-shorter`, `rerank-nodes`

### Self-loop label collision

**Symptom:** In a sequence or state diagram, a self-loop's label overlaps the actor/state lifeline or an adjacent message.
**Severity:** CRITICAL
**Fix recipe keys:** `sequence-self-loop-note`, `state-self-transition-rename`
**Applies to:** sequenceDiagram, stateDiagram

### Actor alignment uneven

**Symptom:** In a sequence diagram, actor boxes at the top don't align or one box is visibly wider than others due to a longer actor name.
**Severity:** POLISH
**Fix recipe keys:** `sequence-shorten-actor-names`
**Applies to:** sequenceDiagram

### Multiple init blocks in source

**Symptom:** Mermaid source contains two or more `%%{init: …}%%` directives. Mermaid does not reliably merge these — it tends to apply one and silently drop the others, so directives in the dropped block (theme, padding, curve) have no effect on the render.
**Severity:** CRITICAL
**Fix recipe keys:** `merge-init-blocks`
**Rationale:** This is the single most common cause of "the theme isn't applying" or "my padding fix doesn't show up". The skill's own `render.sh --theme` path uses `merge_theme.py` to prevent this on themed renders, but if the source itself has competing init blocks (e.g. authored by hand and then re-edited by the skill), Phase A self-review must catch it.

### Linkstyle index drift after edge changes

**Symptom:** A `linkStyle N stroke:…` directive references an edge index that no longer points to the edge it was meant for. After fixes that add or remove edges, the originally-styled dashed/coloured edge is now unstyled and a different edge has the styling instead.
**Severity:** CRITICAL (when the styling encodes meaning, e.g. dashed = reset)
**Fix recipe keys:** `relabel-linkstyle-by-position`
**Applies to:** flowchart, stateDiagram
**Rationale:** Edges in mermaid are 0-indexed in *declaration order*. Apply a fix that adds an edge before the styled one and every `linkStyle N` after that point is now off by one. Easy to miss because the diagram still renders fine.

### Init-block syntax error

**Symptom:** Render fails with a mermaid parse error pointing at the `%%{init: …}%%` line, or no error message at all and an empty/blank PNG. Common causes: mismatched braces, trailing comma, missing closing `%%}`, or quotes inside string values without escaping.
**Severity:** CRITICAL — render is broken
**Fix recipe keys:** `repair-init-block`
**Rationale:** Mermaid's init-block parser is JSON-with-single-quotes — strict about brace and quote balance, lax about identifier quoting. A typo here breaks the whole diagram. This is one of the more common causes of a Phase A render failure.

### Unbalanced quotes or HTML in node label

**Symptom:** Render fails or a node renders with truncated label, raw HTML showing through, or the diagram below the offending node missing entirely. Common patterns: `["text with "quoted" word"]` (mismatched double-quotes), `[<b>bold without close]`, `[Note: > 50%]` (the `>` confuses the fence detector in some renderers).
**Severity:** CRITICAL
**Fix recipe keys:** `escape-label-quotes`, `balance-html-tags`
**Applies to:** flowchart, stateDiagram, classDiagram
**Rationale:** Mermaid's label parser stops at the first unmatched quote or unclosed tag, so the failure mode is silent partial rendering — easy to miss without reading the PNG carefully.

### Source node missing from rendered PNG

**Symptom:** A node declared in the source does not appear in the rendered PNG. The diagram still renders (no parse error) but a node is silently dropped — usually because it is declared but never referenced in any edge, or because an edge to it has a syntax error.
**Severity:** CRITICAL
**Fix recipe keys:** `wire-orphan-node`, `repair-edge-to-orphan`
**Applies to:** flowchart, stateDiagram
**Rationale:** Counting edges and nodes in the source and confirming each appears in the render is one of the cheapest, most effective Phase A checks. Mermaid does not warn about declared-but-unreferenced nodes — it just leaves them out.

### Edge curve doesn't match diagram intent

**Symptom:** A flowchart uses default polyline / step routing when its content (decision branches, parallel paths) would read more clearly with smooth curves — or, less commonly, uses curves when an architecture / wiring diagram would read more rigorously orthogonal.
**Severity:** POLISH (CRITICAL only if curve choice obscures meaning — e.g. parallel branches collapse on top of each other under default routing)
**Fix recipe keys:** `set-flowchart-curve`
**Applies to:** flowchart

**Pick `basis` (curves) when most apply:**
- Diagram has 2+ decision diamonds with branching paths
- Multiple edges share a source or target node (fan-out / fan-in pattern)
- Use context is "internal spec" / "decision flow" / process flow
- Few crossing edges (curves don't help spaghetti)

**Pick `step` (orthogonal) when most apply:**
- Diagram is system architecture / wiring / data-flow
- Use context is "stakeholder deck" / architecture-style flow (orthogonal reads more rigorously)
- High edge density with many crossings — orthogonal makes routing legible
- Mostly rectangle nodes (no diamonds), reads like a pipeline

**Respect explicit choice.** If the source already sets a curve, do not flag — the author chose. This entry only fires when no curve directive is present and judgment says one would help.

---

## How to use this file during self-review

1. Render the current mermaid source to a PNG.
2. Read the PNG.
3. Walk each entry above, check whether the symptom is present.
4. For each matching entry, add to the `critical` or `polish` list of the verdict with:
   - `issue`: entry name
   - `evidence`: what you saw in the PNG
   - `fix_key`: one of the fix recipe keys
5. If `critical` is empty after walking the full list, hand off to the subagent for a fresh-eyes pass.

## How to extend this file

When a new failure mode is found in the wild — during an eval run or a real invocation — add an entry here and a corresponding recipe to `known-good-fixes.md`. The entries here should be concrete enough that a reviewer with no prior context can recognise the symptom.
