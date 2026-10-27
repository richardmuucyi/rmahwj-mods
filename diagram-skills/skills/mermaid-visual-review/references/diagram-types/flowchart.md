# Flowchart-specific failure modes

This file supplements `references/common-issues.md` for mermaid `flowchart` and `graph` diagrams.

## Type-specific issues

### Subgraph direction is frequently ignored

When a top-level `flowchart LR` contains a subgraph with `direction TB` (or vice versa), mermaid-cli's layout engine often renders the inner nodes in the parent direction regardless. This is not a bug — it is a known layout-engine limitation.

**Detection:** Rendered PNG shows children laid out horizontally even though source says `direction TB`.
**Fix:** `card-with-hr-pattern` from `known-good-fixes.md`. Replace the subgraph container with a single-node card using `<hr/>` dividers to stack the content manually.

### Cyclic edges scramble left-to-right layout

A flowchart with a `A → B → C → A` cycle will place nodes in an order that satisfies the cycle rather than preserving the author's linear intent. The back-edge renders as a long sweep under the main flow.

**Detection:** Arrows visibly flow in two directions in what should be a sequential reading; nodes are out of their declared order in the render.
**Fix:** `linearise-cycle` from `known-good-fixes.md`. Introduce a terminal "reset" node and use a dashed arrow to it instead of looping back.

### Single-node cards vs subgraphs

For grouped, structured content that needs internal layout control, prefer single-node cards with `<hr/>` dividers over `subgraph` containers. The `<hr/>` pattern is more reliable because it sidesteps the subgraph-direction limitation above.

Example pattern:
```
S3["<b>Scene 3 — Evening</b><hr/>Desk lamp · off<br/>Floor lamp · <b>WARM DIM 30%</b> ✓<br/>String lights · <b>TWINKLE SLOW</b> ✓"]:::on
```

**Trade-off:** loses per-line colouring. All lines inherit the card's classDef fill and stroke. Acceptable when the card as a whole is on/off; not acceptable when individual lines need distinct colours.

### Long node titles cause width asymmetry

Mermaid sizes each node independently based on its label width. A row of nodes with varying label lengths will render at visibly different widths, breaking the row's visual rhythm.

**Detection:** Sibling cards in a row render at noticeably different widths.
**Fix:** Shorten the longest label (`shorten-longest-label`), or pad the shortest with a non-breaking space line. Prefer shortening.

### Edge labels collide with adjacent nodes

By default mermaid places edge labels very close to the source and destination nodes. For diagrams with long edge labels, this causes the label to overlap the node border or even touch node text.

**Detection:** Edge label's text crosses or nearly touches a node's border in the PNG.
**Fix:** `flowchart-padding-init` from `known-good-fixes.md`. Adds `nodeSpacing` and `rankSpacing` to create breathing room around edges.

## Flowchart-specific linting tips for self-review

- Count edges in the source and verify every edge appears in the render with its label visible.
- For every `classDef`, confirm at least one node uses it. Unused classDefs are dead code.
- If the diagram uses `linkStyle`, verify the N indices still match after any edge changes. Off-by-one here is a common regression source.
- **When the layout reads badly** — a long detour, crossing edges, a very wide canvas — render both engines and look: `python <skill>/scripts/compare_layouts.py <source.mmd> [--theme themes/<name>.json]` writes `<stem>.dagre.png` and `<stem>.elk.png` and recommends neither, because no number picks the better one (on the Bitly review elk had the better ratio and still detoured the redirect round the whole diagram). Set the winner with `config: layout: elk` in the frontmatter; check it with `compat_check.py`, since Obsidian's bundled mermaid may lack the elk layout. *(Superseded 2026-10-18: this line offered `%%{init: {'flowchart': {'defaultRenderer': 'elk'}} }%%` as a last-resort fix to apply blind, without seeing the result beside the default.)*
