# D2 styling, themes and legends

Everything that changes how a diagram *looks*. Values marked *(verified)* were compiled
against the installed binary.

## Style keywords

All set under `style`. Every keyword below verified to compile.

| Keyword | Value | Notes |
|---|---|---|
| `opacity` | float `0`–`1` | |
| `stroke` | CSS colour name, hex, or a subset of CSS gradients | on `sql_table`/`class`, this fills the **body** |
| `fill` | CSS colour name, hex, gradient | shapes only; on `sql_table`/`class` this fills the **header** |
| `fill-pattern` | `dots` · `lines` · `grain` · `none` | shapes only; `none` cancels a pattern a theme applied |
| `stroke-width` | integer `1`–`15` | |
| `stroke-dash` | integer `0`–`10` | |
| `border-radius` | integer `0`–`20` | a very high value gives a pill; also affects connection corners on ELK |
| `shadow` | `true`/`false` | shapes only |
| `3d` | `true`/`false` | **lowercase only** — `style.3D` fails to compile *(verified)*; rectangle/square only |
| `multiple` | `true`/`false` | shapes only; the stacked-copies look |
| `double-border` | `true`/`false` | rectangles and ovals |
| `font` | `mono` | the only option today |
| `font-size` | integer `8`–`100` | ignored inside LaTeX blocks |
| `font-color` | colour | on `sql_table`/`class`, header text only |
| `animated` | `true`/`false` | marching-ants flow along a connection; SVG only, inert in PDF |
| `bold`, `italic`, `underline` | `true`/`false` | |
| `text-transform` | `uppercase` · `lowercase` · `title` · `none` | `none` cancels a theme's caps |
| `filled` | `true`/`false` | arrowheads only — see `syntax.md` |

### Root-level styles

Applied at the top level of the file, `style` targets the whole diagram:

```d2
direction: right
x -> y: hi
style: {
  fill: LightBlue      # diagram background
  stroke: FireBrick    # a frame around the diagram
  stroke-width: 2
}
```

Supported at root: `fill`, `fill-pattern`, `stroke`, `stroke-width`, `stroke-dash`,
`double-border`. If you use `stroke` as a frame, raise `--pad` or the frame hugs the
content.

### Changing defaults instead of repeating yourself

Reach for globs rather than styling every shape:

```d2
***.style.fill: lightblue
(*** -> ***)[*]: {
  style.stroke: red
}
```

---

## Themes

Set with `--theme=N` on the CLI, `D2_THEME=N` in the environment, or `theme-id` inside
`vars.d2-config`. The complete list, read from the installed binary *(verified)*:

**Light**

| ID | Name | ID | Name |
|---|---|---|---|
| 0 | Neutral Default | 100 | Vanilla Nitro Cola |
| 1 | Neutral Grey | 101 | Orange Creamsicle |
| 3 | Flagship Terrastruct | 102 | Shirley Temple |
| 4 | Cool Classics | 103 | Earth Tones |
| 5 | Mixed Berry Blue | 104 | Everglade Green |
| 6 | Grape Soda | 105 | Buttered Toast |
| 7 | Aubergine | 300 | Terminal |
| 8 | Colorblind Clear | 301 | Terminal Grayscale |
| | | 302 | Origami |
| | | 303 | C4 |

**Dark** — 200 Dark Mauve, 201 Dark Flagship Terrastruct.

There is no theme 2 — do not assume the IDs are contiguous.

`--dark-theme=200` makes the diagram switch with the viewer's system preference. Left
unset, one theme is used for both modes. Explicit styles in the D2 source still apply in
both modes, which can look wrong in one of them — so if you hand-pick colours, either
commit to a single theme or check both.

### Special themes change more than colour

`Terminal` (300) also sets caps-lock labels, zero border radius, a monospaced font,
`fill-pattern: dots` on containers, and a double border on the outermost container. Those
properties will not appear in your source, which is confusing if you are debugging why a
label is uppercase — the fix is `style.text-transform: none`.

### Overriding theme colours

```d2
vars: {
  d2-config: {
    theme-overrides: {
      B1: "#2E7D32"
      B2: "#66BB6A"
      AA2: "#0D47A1"
      AB4: "#F44336"
    }
    dark-theme-overrides: {
      B1: "#1B5E20"
    }
  }
}
```

Colour codes follow D2's palette slots (`B1`–`B6` primaries, `AA*`/`AB*` accents). Not
every slot is used by every theme.

### Going dark: two things that catch people out

**A dark theme paints the canvas; do not paint your own.** Themes 200/201 emit a real
full-canvas `<rect>` behind everything, so a dark diagram needs nothing else. The
temptation, when you want a *different* dark than the theme ships, is to inject a
background rect into the SVG afterwards — and it leaves a white surround, because d2's
inner `<svg>` carries a **negative-origin viewBox** (e.g. `-37 -139 780 948`), so a rect
at `0,0` covers the content box and not the canvas. Change the ground with
`theme-overrides`, or repaint the theme's own rect; do not add one.

**An edge glob recolours the line but not the arrowhead.** Arrowheads take their fill
from the theme's palette *classes* (`.fill-B1`, `.stroke-B1`), which
`(** -> **)[*].style.stroke` never touches. On theme 200 that leaves mauve heads on cyan
lines, which reads as an encoding that means something. It does not.

```d2
vars: { d2-config: {
  theme-id: 200
  theme-overrides: { B1: "#5EC9EA"; B2: "#5EC9EA" }   # heads follow the lines
} }
```

Reach for `theme-overrides` before post-processing the SVG — it survives a re-render, and
a sed over the output does not.

---

## Sketch mode

`--sketch` renders everything as if hand-drawn. It is a strong stylistic signal: good for
a whiteboard-feel explainer or an early draft you do not want read as final, bad for a
formal spec. Also available as `sketch: true` in `d2-config`.

---

## Icons and images

Any URL works as an `icon` value, and with the local CLI so does a relative path:

```d2
deploy: {
  icon: https://icons.d2lang.com/aws%2FDeveloper%20Tools%2FAWS-CodeDeploy.svg
}
local: {
  icon: ./my_cat.png
}
deploy -> backup: {
  icon: https://icons.d2lang.com/infra%2F002-backup.svg
}
```

- Free icon set for architecture diagrams: <https://icons.d2lang.com> (same content at
  `icons.terrastruct.com`).
- `shape: image` makes the icon the entire shape, and **requires** an `icon` field
  *(verified — it is a compile error without one)*.

### Verify every icon URL before using it

**A large part of that icon set returns HTTP 403, and a dead URL renders as a silently
missing icon — no error, no warning, exit 0.** Measured: `dev/postgresql.svg`,
`dev/redis.svg` and the whole AWS tree return 200, while `dev/database.svg` and
`essentials/131-database.svg` return 403. There is no way to tell by looking at the path.

Check first:

```bash
for p in "dev%2Fredis.svg" "aws%2FCompute%2FAmazon-EC2.svg"; do
  echo "$(curl -s -o /dev/null -w '%{http_code}' "https://icons.terrastruct.com/$p")  $p"
done
```

Known-good starting points: `dev/{postgresql,redis,mysql,go,python,react,nginx,docker,
mongodb}.svg`, `essentials/005-programmer.svg`, `infra/{002-backup,019-network}.svg`, and
the `aws/` tree (`aws/Compute/Amazon-EC2.svg`, `aws/Database/Amazon-DynamoDB.svg`,
`aws/Database/Amazon-ElastiCache.svg`, `aws/Networking & Content Delivery/
Elastic-Load-Balancing.svg`, `aws/Analytics/Amazon-Kinesis.svg`,
`aws/Mobile/Amazon-API-Gateway.svg`).

Quote any URL containing `&` — the AWS "Networking & Content Delivery" paths need it,
because `&` is D2's glob-filter operator.

### Size icon-bearing nodes, or the icon lands on the label

D2 sizes a node to fit its **label**, then places the icon centred in whatever is left. On
a node with a two-line label that leaves nothing, and the icon is drawn straight over line
two. It looks like a rendering bug and it is really a sizing problem.

Give icon-bearing nodes explicit dimensions:

```d2
lb: "Load balancer\nstateless web tier behind it" {
  icon: "https://icons.terrastruct.com/aws%2FNetworking%20&%20Content%20Delivery%2FElastic-Load-Balancing.svg"
  width: 300
  height: 190
}
```

The same label-drives-the-box rule disfigures `shape: person` far more visibly — see
*Person shapes get fat* below.

Counterintuitively, **`icon.near: top-left` makes the overlap worse** — verified by
isolating four placements. The default is already correct; the box is just too small.
`label.near: outside-bottom-center` also works, at the cost of a label outside the shape.

### Icons are embedded, not linked

`--bundle` defaults to true, so every fetched icon is inlined into the SVG as a data URI —
verified: zero remote references remain in the output. The exported file keeps working
when those URLs rot. The fetch happens at *render* time, so a diagram that must build
offline needs local paths (`icon: ./logo.png`).

---

## Person shapes get fat, and it is the label doing it

`shape: person` and `shape: c4-person` are sized like every other node — **to fit the
label** — and the human silhouette is then stretched to fill that box. For `person` the
label is drawn *below* the figure, so you pay box width for text that is not even inside
the box. A long actor name produces a wide, squat figure that reads as a rendering bug and
is really the icon-sizing problem above wearing a different hat.

Swept against d2 v0.7.1, label length vs the drawn silhouette *(verified)*:

| Label | `person` | `c4-person` |
|---|---|---|
| 1 char | 44 x 66 (0.67) | 52 x 79 (0.66) |
| 8 chars | 88 x 66 (**1.33**) | 98 x 111 (0.88) |
| 14 chars | 143 x 95 (1.51) | 159 x 151 (1.05) |
| 41 chars | 388 x 259 (1.50) | 433 x 410 (1.06) |
| 80 chars | 742 x 495 (1.50) | 824 x 784 (1.05) |

The sweep repeats `X`, which is wider than average text, so real mixed-width labels sit
below these figures at the same character count — it is the label's rendered *width*
that drives the box, never its character count. The ratios and the caps are unaffected.

Two regimes, which is why it only *sometimes* looks wrong:

- **`person` pins its height to a 66px floor** until the label pushes it past ~99px wide.
  In that band the figure widens at a constant height — same head, ever-broader body.
  Most actor labels land here, and this is where "fat" comes from.
- **Past the floor the ratio locks at 1.50:1** and the whole glyph scales up together. It
  stops getting relatively fatter and starts getting *large*: a 41-character job title (`Customer Support Specialist at Front Desk` is
  one) draws a 314 x 209 person against 49 x 66 for `User` — 6.4x the width
  and **20x the area** *(verified)*.
- **`c4-person` has no flat band.** It grows in both dimensions from one character up,
  approaching a 1.05:1 cap, with a head that inflates along with it.

The height inflation is specific to these shapes, not a general layout fault. The same
41-character label leaves a `rectangle` at 344 x 66 — flat, merely wide — while `person`
is dragged to 314 x 209 to honour its ratio cap *(verified: same label, same render)*.

### The fix is not to use the shape

**`shape: person` and `shape: c4-person` are banned in this skill** — see SKILL.md
§ *Never use `shape: person`*. Use `shape: image` with an icon from
`assets/icons/people/`; an icon is not deformable, so none of the above applies to it.
`quality.py` criterion 10 warns on any use.

The workarounds below are kept only to explain **why** the shape is banned, and for
reading diagrams that still use it. Do not reach for them in new work.


**1. Shorten the label.** The only fix with no trade-off, and usually the right one: an
actor is a role, not a job description. `Agent` renders 65 x 66 (0.98); the 41-character job title
renders 314 x 209. Push the detail onto the connection
label, where it belongs.

**2. Wrap it** — width follows the *widest line*, not the total. Same text, 47% narrower:

```d2
agent: "Customer Support\nSpecialist" { shape: person }
```

| Lines | Size | Ratio |
|---|---|---|
| 1 | 314 x 209 | 1.50 |
| 2 | 165 x 110 | 1.50 |
| 3 | 89 x 98 | **0.91** |

Three lines drops it back under 1:1 — the wrap is doing real work, not cosmetics.

**3. Pin the geometry.** `width` / `height` are honoured to within a pixel (asked 48x72,
got 49x72 — stroke rounding, not drift). `64 x 96` reproduces the natural portrait ratio
at any label length:

```d2
agent: Support Specialist {
  shape: person
  width: 64
  height: 96
}
```

> [!warning] Pinning the box does not shrink the label
> Layout positions neighbours by the *shape* box, so a long label under a narrowed person
> overruns whatever sits next to it. Three pinned `person` nodes with full-length labels
> scored `3. Nothing clipped or colliding  WARN  label-collision; label-collision` under
> `quality.py --deep`. Pin the geometry **and** shorten or wrap the label — fix 3 alone
> trades a fat actor for a colliding one.

The combination that passes clean:

```d2
agent: "Support\nSpecialist" { shape: person; width: 64; height: 96 }
customer: Customer { shape: person; width: 64; height: 96 }
```

Note that a fat actor **fails no existing quality criterion** — the naive version of that
diagram scores 7/7. Criterion 5 measures the whole canvas, not one shape's proportions, so
this is a look-at-the-render defect, not one the harness will hand you.

---

## Legends

Declared with the special `d2-legend` variable. Everything inside it becomes a legend
entry rather than part of the diagram:

```d2
vars: {
  d2-legend: {
    a: {
      label: Microservice
    }
    b: Database {
      shape: cylinder
      style.stroke-dash: 2
    }
    a -> b: Bad relationship
    a -> b: Tenuous {
      target-arrowhead.shape: circle
    }
  }
}
```

**A legend entry has to be a CONNECTION to render as a line sample.** Declaring shapes
with stroke colours — `r: Read path { style.stroke: blue }` — draws three coloured
*rectangles*, which say nothing about the edge styles they are supposed to explain. This
compiles and looks deliberate, so it is easy to ship.

`a -> b` declares three things — two shapes and a connection — so all three land in the
legend. Set the two endpoints to opacity 0 and only the line sample survives:

```d2
vars: {
  d2-legend: {
    a.style.opacity: 0
    b.style.opacity: 0
    a -> b: Read path {
      style: {
        stroke: "#1565C0"
        stroke-width: 3
      }
    }
    a -> b: Async / batch {
      style: {
        stroke: "#6A1B9A"
        stroke-dash: 4
      }
    }
  }
}
```

Rename the legend by labelling it, which matters for non-English diagrams:

```d2
vars: {
  d2-legend: "凡例" {
    # entries
  }
}
```

An alternative hand-rolled legend is a container pinned with `near`, which gives more
layout control at the cost of doing the work yourself.

---

## Titles, and the Markdown heading clipping bug

**A long Markdown heading gets clipped.** This is the most likely thing to spoil an
otherwise good diagram, it produces no error, and it cannot be seen in an ASCII preview —
you only catch it by looking at the render.

Verified behaviour on v0.7.1: D2 measures a Markdown block's box using body-text metrics,
so a `#` or `##` heading long enough to wrap overflows the box and its second line is cut
off. Confirmed by isolation:

| Block | Result |
|---|---|
| `# d2-diagram — render pipeline` | **clipped** |
| same, plus `width: 600; height: 140` | **still clipped** — width does not re-flow it |
| `## d2-diagram — render pipeline` | **clipped** — not a heading-level issue |
| `# Pipeline` (short, fits one line) | fine |
| `# Deployment notes` + a bullet list | fine — multi-line by *structure* is fine |
| a long paragraph with no heading | fine — body text measures correctly |

So the rule is about **wrapping a heading**, not about length or heading level, and
`width`/`height` are not the fix.

For a diagram title, prefer `shape: text`, which sizes correctly at any length:

```d2
title: d2-diagram — render pipeline {
  shape: text
  near: top-center
  style: {
    font-size: 28
    bold: true
  }
}
```

Use a Markdown block when you actually need Markdown — lists, bold, code spans, links —
and keep any heading in it short enough to sit on one line.

## Fonts and non-Latin text

The default font is Source Sans Pro; `--font-regular`, `--font-italic` and `--font-bold`
take paths to `.ttf` files.

CJK, other non-Latin scripts and emoji render correctly, and the text stays real text in
the SVG rather than being converted to paths *(verified with Chinese labels)*. The
practical consequence: glyphs are resolved by whatever renders the SVG, so a viewer
without a CJK font will show boxes even though the file is fine. For a diagram that must
look identical everywhere, embed a font with `--font-regular`.

`style.font: mono` is the only built-in family switch.
