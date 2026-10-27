# When rendering fails

d2's errors are precise and carry `file:line:column`; the column usually points at the
offending token. Read it before changing anything — resist rewriting the diagram when one
value needs quoting.

| Message | Meaning | Fix |
|---|---|---|
| `unknown shape "x"` | invented or misspelled shape | check the catalog in `references/syntax.md` |
| `invalid style keyword: "x"` | not a real style key | check `references/styling.md`; `3d` is lowercase, `3D` fails |
| `image shape must include an "icon" field` | `shape: image` without an icon | add `icon:`, or use a different shape |
| `connection missing destination` | dangling `->` | complete or delete it |
| `invalid text beginning unquoted key` | reserved character in bare text | quote the value |
| `maps must be terminated with }` | unbalanced brace | run `d2 fmt <file>` to locate it |
| `multiple must be style.multiple` | a shape is named after a style keyword | rename the node — `3d`, `shadow`, `fill` do this too |
| `unexpected text after md block string` | a `\|` inside the block ended it early — usually a Markdown table | use another delimiter: `` \|`md … `\| `` |
| `shape sql_table cannot have newlines in label` | `\n` in a table's own label | keep it on one line, or put the qualifier in a `shape: text` node beside it |
| `reserved field Link does not accept composite` | the key is a reserved keyword, and keys are case-insensitive, so `Link` is `link` (list in `references/syntax.md`) | rename the key (`link_rec: Link { … }`) or quote it (`"Link": { … }`) |
| `failed to install Playwright` | PNG/PDF/PPTX/GIF was requested | export SVG — see below |

Three failures produce no error at all, so recognise them by symptom:

- **A shape appeared twice.** You connected a label instead of a key.
- **d2 exited 0 and wrote nothing.** A reserved key with a label (`Link: Link { … }`)
  sets the field instead of making a shape. `render.py` reports `RENDER REPORTED SUCCESS
  BUT NO OUTPUT`. Rename or quote the key, as in the table row above *(verified on d2
  0.7.1)*.
- **A stray word sits over a sequence diagram or a table.** A `shape: sequence_diagram`
  or grid container prints its own key as a title (`seq`, `matrix`). Give it a real label,
  or `""` when a `shape: text` title already names the diagram. Criterion 11 of
  `scripts/quality.py` flags the bare key.
- **A label vanished in a CJK diagram.** Full-width punctuation is not ASCII punctuation:
  `：` is a different codepoint from `:` and will not separate a label. Use ASCII `:` `;`
  `.` for syntax and reserve full-width forms for the label text.
- **A Markdown heading is cut in half.** D2 measures a Markdown block at body-text
  metrics, so a `#` heading long enough to wrap overflows and is clipped — and `width`
  will not fix it. Use `shape: text` for titles. Details and the isolation table are in
  `references/styling.md`.
- **A node has fill but no border, and its text overflows.** You used a Markdown block as
  a node label. Markdown blocks ignore `stroke` and collapse single newlines — use a
  quoted plain label with `\n` instead (`references/syntax.md`).
- **An icon sits on top of its own label.** The node was sized to the label, leaving no
  room. Set explicit `width`/`height`; `icon.near` makes it worse
  (`references/styling.md`).
- **An icon is simply absent.** That URL 403s. Much of the hosted icon set does, and a
  dead URL is not an error — verify with `curl` before using it.
- **A legend shows rectangles instead of lines.** Legend entries must be *connections*,
  not shapes (`references/styling.md`).
- **A table-style grid is scrambled.** `grid-columns` alone fills column-wise; declare
  `grid-rows` first (`references/diagram-types.md`).
- **The flow appears to run backwards.** A grid container mid-flow is ranked as its own
  component, so `lb -> zones.aza.appa` never orders `zones` after `lb` — both engines park
  it beside the chain and the arrows read upward. Edge to the **container**
  (`lb -> zones`), not into its children (`references/diagram-types.md`).
- **The legend describes colours the diagram does not use.** A legend copied between
  diagrams that share a palette file: the classes travel, the usage does not. Criterion 9
  of `scripts/quality.py` catches it in both directions — rows claiming unused classes, and
  classes used with no row.
- **Arrowheads are a different colour from their lines.** An edge glob sets `stroke`;
  arrowheads take their fill from the theme's palette classes. Use `theme-overrides`
  (`references/styling.md`).

Fix, re-render, re-read. Do not hand over a diagram whose last render failed.
