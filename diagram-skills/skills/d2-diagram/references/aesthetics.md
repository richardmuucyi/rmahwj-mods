# Making a D2 diagram look designed, not generated

Everything here was measured against d2 v0.7.1 by rendering the same eight-node diagram
under each change and reading the SVG back. The scores in `quality.py` do not move for any
of it — a diagram can pass all seven machine criteria and still look generated. This file is
the part the harness cannot see.

## The finding that matters most: container fill

Default themes fill a container with a saturated tint. Because a container is large, that
tint becomes the dominant colour of the whole picture, and the nodes inside — the things
that actually carry meaning — sit *on* it at lower contrast than the box around them.

Changing **only** the container fill, with nothing else touched, is the single largest
improvement available:

```d2
classes: {
  actor: { shape: image; icon: ./actor-outline.svg; width: 54; height: 54
           style: { font-size: 14 } }
  svc:   { style: { fill: "#ffffff"; stroke: "#7b8794"; stroke-width: 1; border-radius: 6; font-size: 15 } }
  hot:   { style: { fill: "#dbeafe"; stroke: "#2563eb"; stroke-width: 2; border-radius: 6; font-size: 15; bold: true } }
  store: { shape: cylinder; style: { fill: "#f1f5f9"; stroke: "#7b8794"; stroke-width: 1; font-size: 15 } }
  zone:  { style: { fill: transparent; stroke: "#8794a6"; stroke-width: 1; stroke-dash: 5; font-size: 13; font-color: "#4b5563" } }
  flow:  { style: { stroke: "#2563eb"; stroke-width: 2; font-size: 12; font-color: "#1e40af" } }
  quiet: { style: { stroke: "#8794a6"; stroke-width: 1; stroke-dash: 3; font-size: 12; font-color: "#6b7280" } }
}
```d2
warehouse: Warehouse {
  style: { fill: transparent; stroke: "#cbd5e1"; stroke-dash: 4 }
  dock: Loading Dock
  scanner: Parcel Scanner
}
```

A container is a *grouping assertion*, not a component. Give it the lightest possible mark
that still groups: transparent fill, one-pixel dashed stroke in a pale neutral. Everything
else in the diagram then has room to carry colour.

This is also why **theme `303` (C4) reads as the most designed stock theme** — it is the
only one that renders containers as transparent with a dashed border instead of a fill.
Reach for it when you want a good default without hand-styling.

## Typography defaults are inverted

Measured from the rendered SVG under theme 0 *(verified)*:

| Element | D2 default | What it should be |
|---|---|---|
| Container label | **28px** | smallest — 13px, grey, often uppercase |
| Node label | 16px | largest — 15px, bold |
| Edge label | 16px | smallest — 12px, muted |

The grouping box shouts at nearly twice the size of the components, and edge labels tie
with node labels, so connections compete with the things they connect. Every professional
diagram inverts this. Set the hierarchy explicitly:

```d2
classes: {
  zone: { style: { font-size: 13; font-color: "#64748b" } }
  svc:  { style: { font-size: 15 } }
  flow: { style: { font-size: 12 } }
}
```

## Colour must encode, not decorate

Stock themes colour *everything* the same. When every node is the same blue, the diagram
has no subject. Pick one accent for the path the reader is meant to follow and render
everything else neutral:

- **Accent** (`#2563eb`, `stroke-width: 2`) — the primary flow, and the one node it is about.
- **Neutral** (white fill, `#94a3b8` stroke) — everything that merely exists.
- **Quiet** (`#cbd5e1`, `stroke-width: 1`, muted label) — secondary or supervisory edges.

The `monitors` edge in the worked example recedes to pale grey precisely so the main
request path reads first. Two weights of edge do more for legibility than any theme.

## Layout engine: test both, do not assume

`--layout=elk` gives orthogonal routing and is usually recommended for architecture, but
it is not automatically better. On the worked example ELK sent the `returns result`
back-edge on a long detour around the entire canvas, while dagre routed it compactly
underneath *(verified: both rendered, dagre read better)*. Render both and look.



## Orientation is a property of where it will be read, not of the diagram

`direction: right` and `direction: down` produce the same graph at wildly different aspect
ratios — 3.24:1 versus 0.44:1 for the same nine nodes. Neither is "correct"; the medium
decides. Rendered size of 15px body text after fitting to the container *(measured)*:

| Medium | `direction: right` | `direction: down` |
|---|---|---|
| 16:9 slide (1920x1080) | **15.0px** | 12.7px |
| README column (800px) | 6.7px — unreadable | **15.0px** |
| A4 portrait | 6.6px — unreadable | **13.2px** |
| Notes-app pane (900x700) | 7.5px | 8.2px — *both unreadable* |

The trap is assuming a wide ribbon is always wrong. On a slide it wins, because a slide is
itself wide and a 3.24:1 diagram still uses the full width at full size. In any narrow
column the same diagram collapses to 6.7px and becomes decoration.

The last row is the honest one: **at nine nodes neither orientation is readable in a
900x700 pane.** When both orientations fail, the problem is node count, not layout — split
the diagram rather than restyle it.

`direction: down` also buys something `right` cannot: the return path runs *parallel* to
the forward path instead of sweeping across the whole canvas, so a reader can trace it
without crossing the diagram. Narrative flows read better downward.

### Container labels collide with incoming edges

Going vertical puts every inbound edge into the same lane as the container's top-center
label. On the worked example `delivers parcels` landed on top of `WAREHOUSE` and
`quality.py --deep` reported `label-collision`. Move the label out of the lane:

```d2
warehouse: WAREHOUSE {
  label.near: top-left
  style: { fill: transparent; stroke: "#8794a6"; stroke-dash: 5 }
  dock: Loading Dock
}
```

Shortening the edge label fixes it too, but `label.near: top-left` keeps the wording and
generalises — apply it to every container in a top-down diagram, not just the one that
collided *(all three fixes verified; top-left preferred for losing no information)*.


## Use an icon for actors, not `shape: person`

`shape: person` is a deformable primitive: D2 stretches the silhouette into a box sized by
the label, which is the whole *Person shapes get fat* problem in `styling.md`. An icon is
not deformable — it scales inside the box you give it and keeps its aspect ratio — so
switching to one removes that failure mode rather than working around it.

```d2
customer: Returning Customer {
  shape: image
  icon: ./actor-outline.svg
  width: 54
  height: 54
}
```

Four monochrome actors ship with this skill in `assets/icons/people/`, drawn to sit in the
neutral palette above:

| File | Use |
|---|---|
| `actor-outline.svg` | **the default** — light, modern, recedes behind the flow |
| `actor-solid.svg` | when the icon is small or the actor matters more |
| `actor-figure.svg` | stick figure, when a UML-actor reading is wanted |
| `actor-cap.svg` | a figure in a cap, for a second role, so two actors are distinguishable at a glance |

An icon's colours are baked into its file: d2 embeds it as a picture, so a dark theme
cannot recolour it. All four therefore use only `#7b8794` and `#64748b`, which pass 3:1
on both white and the theme 200 dark canvas `#1E1E2E` (worst case 3.45). *(Recoloured:
the outline, figure and cap actor used `#475569`, which is 2.16 on the dark
canvas and made the actors fade out in a dark render.)* Keep any new icon inside that
pair, or check it against both grounds.

**Copy the icon next to your `.d2`** — `icon:` resolves relative to the source file, not to
the skill. The render inlines it as a `data:` URI (`--bundle` defaults on), so the exported
SVG is self-contained and keeps working with the source file gone *(verified: zero
references to the icon path remain in the output)*.

### Do not reach for the hosted icon library for people

Of ten plausible person/user paths probed on `icons.terrastruct.com`, **nine return 403**
and the only one that resolves, `essentials/005-programmer.svg`, is a full-colour cartoon
— skin tones, a brown desk, a blue shirt — which wrecks a restrained palette on contact
*(verified)*. Hosted icons also need network at render time. Keep people local.

## The contrast floor, and how a "tasteful" palette fails it

Quiet is not the same as invisible, and the eye is a bad judge of the difference on a
bright screen. Measure instead. Contrast ratio against the white canvas, WCAG-style:

| Role | A first attempt | Ratio | Verdict |
|---|---|---|---|
| Secondary edge stroke | `#cbd5e1` | **1.48** | invisible |
| Container stroke | `#cbd5e1` | **1.48** | invisible |
| Neutral node stroke | `#94a3b8` | 2.56 | below the 3:1 floor |
| Muted edge label | `#94a3b8` | 2.56 | fails text contrast |

Every one of those reads as "elegantly restrained" in a thumbnail and disappears at full
size — a supervisory edge at 1.48:1 makes its actor look **disconnected from the diagram**,
which is a false statement, not a style choice. The floors worth holding:

- **Strokes and shape outlines: 3:1 minimum.** `#8794a6` (3.08) is the lightest neutral
  that still holds a line; `#7b8794` (3.66) for anything load-bearing.
- **Label text: 4.5:1 minimum.** `#6b7280` (4.83) for muted labels, `#4b5563` (7.56) for
  container names.
- **A pale fill is only safe when its stroke carries the shape.** No fill light enough to
  sit behind dark text reaches 3:1 on white — `#f1f5f9` is 1.10 — so the outline does all
  the work. Never rely on fill alone to make a node exist.

Recede by **one step**, not five: the accent at 5.17:1 against a quiet stroke at 3.08:1 is
already a clear hierarchy.

### Two gotchas that bite while styling

- **`stroke-width` must be an integer 0–15.** `stroke-width: 1.5` fails to compile with
  *expected "stroke-width" to be a number between 0 and 15* — use 1 and 2 to separate quiet
  from accent *(verified)*.
- **Titles must be `shape: text`, never a markdown heading.** A `|md ### ... |` title trips
  the clipping bug and `quality.py --deep` reports `markdown-clipped`; see
  `styling.md` § *Titles, and the Markdown heading clipping bug*. A `near: top-center`
  title also adds its band to the canvas without rebalancing padding — measured 21% empty
  below versus 14% without it, which is worth a `--pad` trim on a wide diagram.

## The starting class block

Copy this rather than inventing per-shape styles. It encodes every rule above:

```d2
classes: {
  actor: { shape: image; icon: ./actor-outline.svg; width: 54; height: 54
           style: { font-size: 14 } }
  svc:   { style: { fill: "#ffffff"; stroke: "#7b8794"; border-radius: 6; font-size: 15 } }
  hot:   { style: { fill: "#eff6ff"; stroke: "#2563eb"; stroke-width: 2; border-radius: 6; bold: true } }
  store: { shape: cylinder; style: { fill: "#f8fafc"; stroke: "#7b8794" } }
  zone:  { style: { fill: transparent; stroke: "#8794a6"; stroke-dash: 4; font-size: 13; font-color: "#4b5563" } }
  flow:  { style: { stroke: "#2563eb"; stroke-width: 2; font-size: 12 } }
  quiet: { style: { stroke: "#8794a6"; stroke-width: 1; font-size: 12; font-color: "#6b7280" } }
}
```

Every value holds the floors above, measured on white: node strokes `#7b8794` 3.66,
container and quiet strokes `#8794a6` 3.08, accent `#2563eb` 5.17, container label
`#4b5563` 7.56, quiet label `#6b7280` 4.83. *(Corrected: this block used to
carry `shape: person` and `#cbd5e1`/`#94a3b8` greys at 1.48 and 2.56, breaking the two
rules this file and SKILL.md set.)*

The `actor` class is an icon: copy `assets/icons/people/actor-outline.svg` next to your
`.d2`, because `icon:` resolves relative to the source file. `width`/`height` set the box
the icon scales inside; unlike `shape: person`, a long label cannot deform it.

These are light-ground values. A hex colour is written into the SVG as-is and does not
switch under a `dark-theme-id`, so a white `svc` fill glares on a dark canvas. For a
diagram that ships both themes, keep fills `transparent` or leave them to the theme, and
keep only strokes that read on both grounds (`#8794a6` and `#7b8794` do). The same goes
for label colours: drop `font-color` and let the theme colour the text, because
`#4b5563` is 2.17:1 on the dark canvas `#1E1E2E`, under the 4.5:1 floor. `tests/all-types/01-plain.d2` uses `zone`
that way.

## What none of this is measured by

`quality.py` scored the naive and the designed version **identically** (7 PASS, 1 WARN,
differing only on canvas size). Criterion 5 measures the canvas, criterion 6 counts class
assignments, and neither looks at contrast, hierarchy or colour meaning. *(Criterion
11 now catches one hierarchy defect, a container label louder than its
nodes. Contrast and colour meaning are still unmeasured.)* Treat a clean
score as "nothing is broken", never as "this looks good" — then open the render.
