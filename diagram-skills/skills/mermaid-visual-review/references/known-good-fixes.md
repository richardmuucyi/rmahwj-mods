# Known-Good Mermaid Fix Recipes

## Contents
- [add-title-frontmatter](#add-title-frontmatter)
- [set-flowchart-curve](#set-flowchart-curve)
- [flowchart-padding-init](#flowchart-padding-init)
- [distinct-dashed-linkstyle](#distinct-dashed-linkstyle)
- [card-with-hr-pattern](#card-with-hr-pattern)
- [equalise-card-content](#equalise-card-content)
- [shorten-label](#shorten-label)
- [shorten-longest-label](#shorten-longest-label)
- [linearise-cycle](#linearise-cycle)
- [dashed-reset-arrow-to-terminal-node](#dashed-reset-arrow-to-terminal-node)
- [bump-text-contrast](#bump-text-contrast)
- [drop-italic](#drop-italic)
- [sequence-self-loop-note](#sequence-self-loop-note)
- [state-self-transition-rename](#state-self-transition-rename)
- [sequence-shorten-actor-names](#sequence-shorten-actor-names)
- [relabel-shorter](#relabel-shorter)
- [merge-init-blocks](#merge-init-blocks)
- [relabel-linkstyle-by-position](#relabel-linkstyle-by-position)
- [repair-init-block](#repair-init-block)
- [escape-label-quotes](#escape-label-quotes)
- [balance-html-tags](#balance-html-tags)
- [wire-orphan-node](#wire-orphan-node)
- [repair-edge-to-orphan](#repair-edge-to-orphan)
- [rerank-nodes](#rerank-nodes)
- [radar-label-margins](#radar-label-margins)
- [gantt-ticks-and-width](#gantt-ticks-and-width)
- [block-align-and-pad](#block-align-and-pad)
- [architecture-sideways-edges](#architecture-sideways-edges)

Each entry has a **stable key** that maps to a `fix_recipe_keys` entry in `common-issues.md`. When self-review flags an issue and returns a fix_key, look up the recipe here and apply it.

Keys are stable across the skill's lifetime — if you need to change a recipe, edit in place; do not add a v2 key. Add a new recipe only after the fix has been rendered and checked on a real diagram.

---

## add-title-frontmatter

**Triggered by:** `Missing title frontmatter`
**Recipe:** Insert a YAML frontmatter block at the very top of the mermaid source, before any other content.

```mermaid
---
title: <Inferred or default title>
---
<existing diagram content>
```

Title inference order (from spec §3 rule 1):
1. `.md` block → nearest heading above the block; fall back to `Untitled <type> diagram` if none.
2. `.mmd` file → filename stem, humanised.
3. Inline → first keyword + `Untitled <type> diagram` fallback.

## set-flowchart-curve

**Triggered by:** `Edge curve doesn't match diagram intent` — Phase A self-review chose a curve that fits the diagram's intent (see the entry's heuristic in `common-issues.md`).
**Recipe:** Inject (or merge into existing init block) the chosen curve directive immediately after the title frontmatter:

```
---
title: <title>
---
%%{init: {'flowchart': {'curve': '<basis|step|linear>'}}}%%
flowchart LR
    ...
```

Substitute `<basis|step|linear>` per the judgment from `common-issues.md`. If an init block already exists, merge `flowchart.curve` into it; do not replace the whole block.

**Respect explicit author choice.** If the source already has a curve set, this recipe is not applied — the author wins.

**Caveat — font/measurement gotcha (mostly bites `basis`).** Mermaid measures text width using a fallback font during dagre layout but renders with whatever `themeVariables.fontFamily` you set. If those don't match (e.g. `Inter` set, fallback measures wider), labels can clip mid-character (`Lookup STOCK2` → `Lookup STOCK:`) — most visible with curved layouts because they pack tighter. Two fixes: (a) drop the custom `fontFamily` so layout-time and render-time fonts agree, or (b) raise `flowchart.padding`/`nodeSpacing` enough to absorb the mis-measurement (~22 / 60 are usually safe).

## flowchart-padding-init

**Triggered by:** `Edge labels cramped against nodes`, `Text clipping inside nodes`, `Arrow label overlaps another arrow`
**Recipe:** Insert or update an init block at the top of the mermaid source, after any existing frontmatter.

```
%%{init: {'theme': 'base', 'themeVariables': {'fontSize': '14px', 'fontFamily': 'system-ui', 'lineColor': '#475569'}, 'flowchart': {'padding': 18, 'nodeSpacing': 55, 'rankSpacing': 75}} }%%
```

If an init block already exists, merge rather than replace: preserve existing themeVariables and only add/update `flowchart` sub-keys.

## distinct-dashed-linkstyle

**Triggered by:** `Dashed vs solid edge indistinguishable at render size`
**Recipe:** Add a `linkStyle` line at the end of the diagram identifying the edge(s) by their 0-indexed position. Use a wide dash pattern in **neutral grey** — the dash carries the meaning, not the colour.

```
linkStyle N stroke:#7b8794,stroke-width:2px,stroke-dasharray:6 4
```

`#7b8794` holds 3:1 on white (3.66), on the zinc-light group fill and on the zinc-dark ground (4.07), so it reads in every theme. Reach for a hue only when the diagram has none yet, and never one the diagram already uses for another meaning.

*(Superseded: the recipe used amber `#d97706`. On a diagram with an orange accent — the Bitly review marked its request path `#e8590c` — it added a second orange meaning "async", so two near-identical colours carried two different meanings.)*

Replace `N` with the edge index (edges are numbered in order of declaration, starting at 0). For multiple dashed edges: `linkStyle 3,5,7 stroke:...`.

## card-with-hr-pattern

**Triggered by:** `Subgraph direction ignored`, `Card height or width mismatch`, `Text clipping inside nodes` (when inside subgraphs)
**Recipe:** Replace `subgraph` containers with single-node cards that use a `<hr/>` divider between the card title and body.

Before:
```
subgraph S3["Scene 3 — Evening"]
    direction TB
    E1["Desk lamp<br/>off"]
    E2["Floor lamp<br/>WARM DIM 30%"]
    E3["String lights<br/>TWINKLE SLOW"]
end
```

After:
```
S3["<b>Scene 3 — Evening</b><hr/>Desk lamp · off<br/>Floor lamp · <b>WARM DIM 30%</b> ✓<br/>String lights · <b>TWINKLE SLOW</b> ✓"]:::on
```

Define a classDef for the style:
```
classDef on fill:#dcfce7,stroke:#16a34a,stroke-width:2px,color:#14532d
```

**Caveats:** Loses per-line colouring (every lamp shares the card's fill, so the unlit desk lamp is no longer greyed out). Acceptable when the card as a whole is on/off; not acceptable when individual lines need distinct colours.

## equalise-card-content

**Triggered by:** `Card height or width mismatch`
**Recipe:** Give every sibling card the same number of content lines. If one card has fewer, pad with a neutral entry (e.g. `Desk lamp · off`) so all cards render at the same height.

## shorten-label

**Triggered by:** `Text clipping inside nodes`
**Recipe:** Rename the offending label to a shorter form. Prefer removing redundant words over abbreviation. E.g.:
- `Scene 2 — Work From Home Hours` → `Scene 2 — Work`
- `Lights Dimmed Down to Bedtime Level` → `Bedtime dim`

## shorten-longest-label

**Triggered by:** `Card height or width mismatch`
**Recipe:** Identify the card whose label is pushing the row's width and shorten only that one. Keep siblings unchanged.

## linearise-cycle

**Triggered by:** `Cyclic edge scrambles node order`
**Recipe:** Remove the back-edge and introduce a distinct terminal node that represents the reset state. Connect to the terminal node with a dashed arrow (use `distinct-dashed-linkstyle`). The reset is now a layout-stable forward edge to a sink.

Before:
```
P0 --> P1 --> P2 --> P3
P3 --> P0
```

After:
```
P0 --> P1 --> P2 --> P3 -.-> P4
linkStyle 3 stroke:#7b8794,stroke-width:2px,stroke-dasharray:6 4
```

## dashed-reset-arrow-to-terminal-node

**Triggered by:** `Cyclic edge scrambles node order`
**Recipe:** Alias for `linearise-cycle` + `distinct-dashed-linkstyle` combined. Use when the caller wants both parts applied together.

## bump-text-contrast

**Triggered by:** `Low-contrast text`
**Recipe:** Adjust the `color:` channel in the node's classDef to a darker shade. For `#94a3b8` on `#f1f5f9`, bump to `#334155`. General rule: pick a colour at least 4 tonal steps darker than the fill.

## drop-italic

**Triggered by:** `Low-contrast text`
**Recipe:** Remove `<i>...</i>` tags from label text. Italic text on light backgrounds tends to render with less perceived weight than upright text, and mermaid does not always honour italic toggles at the class level.

## sequence-self-loop-note

**Triggered by:** `Self-loop label collision` (sequence diagrams)
**Recipe:** Replace a long self-loop message with a `Note over` annotation. The note renders outside the lifeline and cannot collide with adjacent messages.

Before:
```
A->>A: Internal validation of complex input payload
```

After:
```
Note over A: Internal validation of<br/>complex input payload
```

## state-self-transition-rename

**Triggered by:** `Self-loop label collision` (state diagrams)
**Recipe:** Shorten the self-transition label, or move the detail to a state description below the diagram.

## sequence-shorten-actor-names

**Triggered by:** `Actor alignment uneven`
**Recipe:** Shorten actor names to their shortest unambiguous form. Prefer initialisms over full names when every name is long (e.g. `LMS` instead of `Library Management System`).

## relabel-shorter

**Triggered by:** `Arrow label overlaps another arrow`
**Recipe:** Shorten the label to one short phrase (2–4 words). Long labels are the most common cause of arrow-label collisions.

## merge-init-blocks

**Triggered by:** `Multiple init blocks in source`
**Recipe:** Replace the multiple `%%{init: …}%%` directives with a single block that contains every key from each. Resolution rule for overlapping keys: a later block overrides an earlier one (matches mermaid's left-to-right processing as best understood).

```
# Before
%%{init: {'theme': 'base', 'themeVariables': {'fontSize': '14px'}}}%%
%%{init: {'flowchart': {'padding': 18}}}%%

# After
%%{init: {'theme': 'base', 'themeVariables': {'fontSize': '14px'}, 'flowchart': {'padding': 18}}}%%
```

The skill's `scripts/merge_theme.py` does this programmatically for the themed-render path; for source-level fixes, do it by hand.

## relabel-linkstyle-by-position

**Triggered by:** `Linkstyle index drift after edge changes`
**Recipe:** Re-count edges in declaration order (0-indexed) after every fix that adds or removes one. Update each `linkStyle N` to point at the same logical edge it described before. If you cannot tell which edge was originally styled, look at the *previous* version of the source (last_known_good_source) — the edge whose styling described "reset" or "async" should still have a description matching the styled colour or dash pattern.

Quick mental trick: if you add a new edge between existing edges, every `linkStyle N` for N ≥ insertion point becomes `linkStyle N+1`.

## repair-init-block

**Triggered by:** `Init-block syntax error`
**Recipe:** Inspect the failing `%%{init: …}%%` line. Common fixes:

1. **Mismatched braces** — count `{` and `}`; they must balance.
2. **Trailing comma before closing brace** — `{'a': 1, }` is invalid; remove the comma.
3. **Missing closing `%%}`** — the directive must end with `%%}` exactly (no space).
4. **Single-quote escaping** — mermaid init uses single-quoted strings; if a value needs to contain a single quote, switch the outer quoting to double on that one value: `{'msg': "don't"}`.

If the init block is opaque and the diagram works without it, drop it entirely and re-add only the directives you need (usually `flowchart.padding` from `flowchart-padding-init` or a curve directive).

## escape-label-quotes

**Triggered by:** `Unbalanced quotes or HTML in node label`
**Recipe:** A node label declared with double-quotes `["…"]` cannot contain unescaped double-quotes. Either switch to backticks (mermaid permits `[\`text with "quoted" word\`]` in many renderers) or use HTML entities: `["text with &quot;quoted&quot; word"]`.

## balance-html-tags

**Triggered by:** `Unbalanced quotes or HTML in node label`
**Recipe:** Every `<b>` needs `</b>`; every `<i>` needs `</i>`. Self-closing tags like `<br/>` and `<hr/>` must include the slash. The most common offenders: `<b>` opened in one line and never closed because someone broke the line with `<br/>`. Fix by closing within the same logical chunk.

## wire-orphan-node

**Triggered by:** `Source node missing from rendered PNG`
**Recipe:** A node declared but never referenced in any edge will not render. If the node is meant to appear, add at least one edge connecting it. If the node was intentionally orphan (rare — usually decorative), force it to render with an invisible edge: `OrphanNode ~~~ NeighbouringNode` (the `~~~` syntax is an invisible edge in flowchart).

## repair-edge-to-orphan

**Triggered by:** `Source node missing from rendered PNG`
**Recipe:** When a node is meant to be reached by an edge but the edge has a syntax error, mermaid silently drops both. Look for typos in node IDs in edge declarations: `A --> Bx` when the node is declared as `B`, or `A -> B` (single dash) instead of `A --> B`.

## rerank-nodes

**Triggered by:** `Arrow label overlaps another arrow`
**Recipe:** Introduce an invisible intermediate node to force the layout engine to spread ranks further apart. Use sparingly — it's a layout hack.

## radar-label-margins

**Triggered by:** `Side axis labels clipped at the canvas edge` (radar)
**Recipe:** Widen the side margins in the source's frontmatter `config`, so a left or right axis label fits inside the canvas:

```
---
title: <title>
config:
  radar:
    marginLeft: 110
    marginRight: 110
---
```

mermaid puts each axis label at `radius × axisLabelFactor + 4px` (300 × 1.05 + 4 = 319px) from the centre of a 600px chart, with 50px side margins. A side label is anchored there and runs outwards, so about 30px of text fits. 110px holds about ten characters at the default font; widen further for longer names, or shorten them. Margins are config, not theme variables, so no theme can fix this. *(Measured 2026-10-18 on 11.16.1: "Latency" and "Ops effort" whole in both themes.)*

## gantt-ticks-and-width

**Triggered by:** `Axis dates overprint`, `A short schedule renders as a thin strip` (gantt)
**Recipe:** Set a tick interval and a short date format in the gantt body, and a fixed width in the frontmatter `config`:

```
---
config:
  gantt:
    useWidth: 900
    barHeight: 28
    barGap: 8
    topPadding: 60
---
gantt
  dateFormat YYYY-MM-DD
  axisFormat %d %b
  tickInterval 1week
```

Pick `tickInterval` so the axis carries 4 to 8 ticks (`1day`, `1week`, `1month`). `useWidth` replaces the page width, which made a four-task schedule 1,784 × 264 px (6.8:1); at 900 it was 3.4:1. *(Measured 2026-10-18 on 11.16.1.)*

## block-align-and-pad

**Triggered by:** `A diagonal arrow lands on a corner`, `Blocks cramped against their arrows` (block)
**Recipe:** Put each target block in its source's row or column, padding the row with `space`, and raise the block padding in the frontmatter `config`:

```
---
config:
  block:
    padding: 24
---
block-beta
  columns 3
  a["A"] b["B"] c["C"]
  space d["D"] space
  b --> d
```

block-beta draws an edge as a straight line between two blocks, so a target one column across and one row down gets a diagonal arrow whose head lands on its corner. `padding` (default 8) is the gap round each block's label. *(Measured 2026-10-18 on 11.16.1.)*

## architecture-sideways-edges

**Triggered by:** `An edge runs through a service's label` (architecture)
**Recipe:** architecture-beta draws a service's label under its icon, so an edge that leaves the bottom (`B`) or enters the top (`T`) of a labelled service crosses the label. Lay the services out so their edges leave and enter from the sides:

```
api:R --> L:store
api:L --> R:queue
```

instead of `api:B --> T:queue`. When a vertical edge is unavoidable, put it on a service whose label the edge does not cross (an edge entering the top of the lower service is fine; one leaving the bottom of the upper service is not). *(Seen 2026-10-18 on 11.16.1, in both themes.)*
