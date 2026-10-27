# Converting mermaid to D2

Everything here was derived by converting a corpus of 52 mermaid diagrams
and checking each render. The verdicts are measured, not assumed.

## Decide before you convert

**Do not convert by diagram type. Convert by construct count.** The single question that
predicts whether a mermaid diagram survives is: **how many `alt`/`else` blocks does it
have?**

```bash
grep -c '^\s*alt\|^\s*else' diagram.mmd
```

| `alt`/`else` | Verdict |
|---|---|
| 0 | Converts cleanly. Often *better* than the original — see "what improves" below. |
| 1–2, terminal | Fine. Two sibling groups reading as two endings is honest. |
| 3+, interleaved | **Do not convert as-is.** Split by scenario, one file per branch. |

D2 has no else-frame. Mermaid draws `alt`/`else` as one frame with dashed dividers;
D2 can only give you separate labelled groups stacked vertically. For a diagram that
pairs two narratives at every phase, that turns "these are alternatives" into "these
happen in sequence" — a meaning change, not a cosmetic one, and it doubles the height.

The fix for a heavy one is to split it: one D2 file per scenario, each reading straight
down, with the shared tail repeated. Two readable diagrams beat one misleading diagram.

## Construct mapping

| mermaid | D2 | Verdict |
|---|---|---|
| `graph`/`flowchart TD` | `direction: down` | exact |
| `classDef` + `class` | `classes` block | **better** — colours live in one place |
| `{...}` rhombus | `shape: diamond` | exact |
| `([...])` stadium | `shape: oval` | exact |
| `[(...)]` cylinder | `shape: cylinder` | exact |
| `-->` `-.->`  | `->` + `style.stroke-dash` | exact |
| `-->|label|` | `a -> b: label` | exact |
| `A & B --> C` | two separate connections | exact (1 mermaid line → 2 D2 lines) |
| `<br/>` in a label | `\n` inside a **quoted** label | exact |
| `subgraph` | container | exact |
| `subgraph ... direction LR` | *dropped* — TALA only | usually survives anyway; see below |
| `participant X as Y` | `X: Y` under `shape: sequence_diagram` | exact |
| `->>` `-->>` | `->` with `style.stroke-dash` for returns | exact |
| `->>+` / `-->>-` activation | span — a nested object on an actor | close |
| `Note over A` | `A."text"` | exact |
| `Note over A, B` spanning two actors | note on one actor only | **degraded** |
| `rect rgb(...)` phase band | a labelled group | **better** — the phase gets a name |
| `opt` | nested group | close |
| `par` | nested group labelled "Parallel …" | degraded — no par semantics |
| `alt` / `else` | nothing | **lost** — see above |
| `autonumber` | nothing — number by hand | **lost** |
| `stateDiagram-v2`, `[*]` | shapes + circle pseudo-states | neutral |
| `<b>` `<i>` inside labels | nothing — plain labels are one weight | lost |

## What actually improves

- **`classDef` → `classes`.** Six repeated colour rules become one block. Restyling a
  whole diagram becomes a four-line edit.
- **`rect rgb(...)` → a labelled group.** In mermaid the phase is a background colour you
  decode; in D2 it is a titled frame. Move the `Note over …: Phase 2 …` header into the
  group's title and the diagram reads better than the original.
- **Imports.** If several diagrams share a palette, put it in `_classes.d2` and
  `...@_classes` from each.

## Traps specific to conversion

**Literal newlines instead of `\n`.** Writing a multi-line label across real lines makes
every continuation line a **new shape**. It compiles. Always quote multi-line labels:
`p: "line one\nline two"`. Verify with `render.py --check`.

**`<b>`/`<i>` do not survive.** Strip them. Do not reach for a Markdown block to get bold
back — Markdown labels ignore `stroke` (no border) and collapse single newlines into one
paragraph. Use a plain quoted label with `\n`.

**`&amp;` and other HTML entities** need decoding to `&` first.

**Per-container `direction` is dropped** because it is TALA-only. In practice ELK often
places parallel lanes side by side anyway, because they are independent branches off the
same node — verified on two diagrams. Treat that as luck, not a guarantee.

**Mermaid `%%{init: ...}%%` config blocks** have no equivalent. Their content (actor
margins, widths) is layout tuning you can usually drop.

## Suggested workflow

1. Extract every mermaid block with its source note, so provenance survives.
2. Count `alt`/`else` per diagram and triage with the table above.
3. Keep the original mermaid node IDs as D2 keys — ugly, but it makes the two diffable.
4. Convert, render, **look at the PNG**, and run `--check` against your expected counts.
5. Record what was lost in a comment at the top of the `.d2`. The next reader needs to
   know that the four stacked groups used to be one `alt` frame.
