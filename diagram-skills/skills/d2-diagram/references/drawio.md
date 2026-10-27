# draw.io output

d2 cannot export to draw.io: `d2 --help` lists svg, png, pdf, pptx, gif and txt only.
`scripts/to_drawio.py` builds a `.drawio` file from the SVG d2 writes, so a diagram can be
handed to someone who edits in draw.io. No layout runs on the way across. Every shape,
line and label lands where d2's own layout put it.

```bash
python scripts/to_drawio.py diagram.d2 -o diagram.drawio --png
python scripts/to_drawio.py diagram.svg          # an existing render
python scripts/to_drawio.py boards/              # a multi-board folder
python scripts/to_drawio.py diagram.d2 -- --layout=elk   # d2 flags after --
```

`--png` exports the result through the draw.io desktop app (when it is installed) so it can
be looked at. **Look at it**, beside the d2 render: the counts the script prints prove the
objects arrived, not that they look right.

## Which file is the source afterwards

The `.d2` stays the source. A re-run of the converter overwrites draw.io edits, so when
someone has edited the draw.io copy, bring their edits back first (next section), then
re-convert. If people will edit it in draw.io from now on and never return to d2, say so and
stop editing the `.d2`.

## Bringing draw.io edits back (round trip)

`scripts/from_drawio.py` takes a `.drawio` that `to_drawio.py` made and someone edited, and
writes the `.d2` with their changes in it:

```bash
python scripts/from_drawio.py edited.drawio --base diagram.d2 -o diagram.new.d2
```

Without `--base` it uses the `.d2` beside the draw.io file with the same stem. Without `-o`
it writes `diagram.from-drawio.d2` beside the base. It never overwrites the base. Read the
new file, then replace the old one by hand.

**How it finds the changes.** It converts the base again, which reproduces the file as it
was before anyone edited it, and compares the edited file against that, cell by cell, on
`d2_id`. `to_drawio.py` records a fingerprint of the source in the file. A `.d2` that changed
after conversion is refused (exit 2), because a shape added to it later would look like a
shape deleted in draw.io. Files converted before fingerprints existed are accepted with a
note.

**How it writes them.** The `.d2` is kept verbatim: comments, classes and vars stay as
written. Labels, colours, strokes, fonts, arrowheads, shape changes and deletions are
appended as d2 statements, which d2 applies over the declarations above them. `key: null`
deletes. New shapes and new lines are appended as declarations. A pasted copy reuses its
original's one-line declaration (`{ shape: cylinder }`), and a re-drawn line keeps its d2
class.

**Sequence diagrams are placed, not appended.** A message's place in the source is its place
in the picture. A message appended at the end of a group stretched that group's band over
everything below it.

- A new message goes in after the message or note drawn just above it, in the same group.
- A re-pointed message has its ends edited where it stands, so it keeps its place and class.
- A new box in the actors' row is a new actor, placed by its position left to right. A new
  box below that row, on the lifelines, is a note on the nearest actor, placed by height like
  a message. An earlier version made every new box an actor, and the check passed it; the
  check now compares each shape's role (actor, note, group).
- Messages are numbered again afterwards. Inside a group, d2 numbers per group
  (`route_b.(you -> main)[0]`, not the SVG's `(you -> main)[1]`).

**The check.** The result is rendered, converted again and compared with the edited file:
labels, ends, colours, arrowheads and, in a sequence diagram, message order and group.
Anything that differs is printed under NOT carried, and the exit code is 1.

**Not carried, and reported:**

- positions (d2 lays the diagram out again);
- a shape moved into another container (d2 keys cannot move);
- adding or removing an arrowhead (that is a new direction in the `.d2`);
- a line with a free end outside a sequence diagram;
- edits inside a `sql_table` or `class`, or in a legend;
- boards other than the first page;
- formatting inside a label (bold words, a coloured span): the text comes back plain;
- a draw.io style with no d2 equivalent (`fontFamily`, `gradientColor`, ...), a removed
  style value, or a colour d2 rejects (draw.io's `default`);
- a restyled lifeline (style its actor instead).

**What the check compares.** For an existing shape or line, only what the person changed:
d2 restyles some things on its own (an actor's fill once it has a message), and that is not a
lost edit. In a sequence diagram it also compares message and note order, each with its group
and its ends or actor, and the actors left to right, each per diagram: with two diagrams on one
page, their items interleave by height and d2 re-spaces each diagram on its own. A new message
or note goes to the diagram it is drawn in (tested stacked and side by side).

If the `.d2` holds something the statement reader does not trust (a block string such as
`|md ... |`), sequence lines fall back to appending, and the check reports the order.

## How each d2 element arrives

| d2 | draw.io |
|---|---|
| rectangle, square | native rectangle (rounded when d2 rounded it) |
| oval, circle | native ellipse |
| every other shape, and `3d`, `multiple`, `double-border` | a custom stencil made from d2's own outline |
| `shape: image`, icons | image cell (data URIs kept) |
| text, `shape: text` | text cell |
| Markdown block | HTML text cell (d2's Markdown CSS is not carried) |
| `sql_table`, `class` | the frame, its header band and row rules, each cell of text a child |
| container | parent cell when it really encloses its children; children move with it |
| connection | line with d2's route as waypoints; spline routes become `curved=1` |
| arrowheads | block, classic, diamond, oval, box, cross, and the four ER crow's feet |
| `shadow`, `opacity`, dashed strokes | `shadow=1`, fill and stroke opacity, `dashPattern` with `fixDash=1` |
| tooltip, link | the cell's draw.io tooltip and link |
| layers, scenarios, steps | one draw.io page per board |
| legend | its frame, text and sample lines as plain cells |

A custom stencil looks identical and still resizes and recolours, but draw.io lists it as a
custom shape, not as its own cylinder or cloud. The SVG does not say which d2 shape drew a
path, so naming a native draw.io shape would be a guess.

A line's ends attach to the shapes they touch, so a shape moved in draw.io pulls its lines
with it. Ends that touch no shape stay as free points: sequence messages end on lifelines,
not on actors. A sequence lifeline is attached at its top only, so dragging an actor
sideways slants its lifeline.

Each cell carries its d2 ID as a `d2_id` property (Edit Data in draw.io), so a cell can be
traced back to the line of `.d2` that made it.

## What does not carry across

- **The font, unless draw.io can load it.** Cells ask for Source Sans Pro (d2's font) from
  Google Fonts, then Helvetica and Arial. The draw.io desktop export did not load the Google
  font in testing, so its PNG uses Arial, which is wider. Labels keep their centres; a long
  label can look tighter in its box.
- **Line height.** draw.io sets lines at 1.2 x the font size, a little taller than d2.
- **Masks.** d2 cuts a line behind its label. draw.io cannot, so the label gets a background
  in the colour behind it, worked out from the shapes underneath.
- **Multiply blend.** d2 draws sequence groups with multiply at 50% opacity. draw.io draws
  plain 50% opacity, which is identical on a white ground.
- **The tooltip and link icons** d2 adds to a render (the tooltip text itself is kept).
- **Sketch mode and animation.** The converter warns on a sketch render: render without
  `--sketch` and use draw.io's own Sketch option instead.

## How the round trip was verified

`tests/eval_from_drawio.py` covers three round trips. Edits are written into the XML the way
draw.io writes them (`tests/drawio/round_trip_edits.py`), because the draw.io editor cannot
be driven from a script.

- **Unedited cloud-merge file:** the `.d2` comes back byte for byte.
- **Cloud-merge with eleven edits:** includes a message added inside Route A, a re-pointed
  message, a new actor and a deleted note in a group. Each lands in its place, and the check
  passes on order and group.
- **01-plain with eight edits:** includes a pasted copy and a new shape in a container. All
  carry except one move into another container, which is reported (exit 1).

Three negative controls:

1. a changed `.d2` is refused;
2. a source the reader does not trust falls back to appending, and its order is reported;
3. faults planted in a good result are each reported: a dropped colour line, a message moved
   to another group, a note declared as an actor, and a new actor appended after all the others.

**The adversarial review.** Two read-only reviewer agents tried to break both
scripts, and every finding was reproduced before it was fixed.

- **`from_drawio.py`:** 12 findings, 9 of them false passes (an edit lost or misplaced while
  the check said "verified"). Each is a case in `tests/drawio/review_cases.py`, and each
  failed before its fix.
- **`to_drawio.py`:** 9 findings, among them a crash on code blocks, boards in alphabetical
  order, `--png` skipping the last page, hollow arrowheads drawn solid in dark themes, and a
  path-parser hang. They are the `review:` cases in `tests/eval_drawio.py`.

## How the conversion was verified

`tests/eval_drawio.py` converts twelve diagrams: the seven genres in `tests/all-types/`
(including a multi-board file), three corpus cases (icon, crow's-foot ERD, legend with
tooltips), the cloud-merge sequence fixture and `tests/drawio/every-shape.d2`, which holds
every shape, style flag and arrowhead. It checks four things against d2's SVG:

1. every object ID arrives exactly once;
2. single-rectangle shapes keep d2's box within 0.5 px;
3. line ends lie within 6 px of d2's (an arrowhead's tip moves the end);
4. attached ends rebuild their point within 0.5 px.

It then exports each file through draw.io, and plants three faults that the checks must
catch.

By eye: every diagram was exported and compared with the d2 render. On the cloud-merge
diagram an overlay of the two renders put every box, line and note on the same pixels.
Labels sat within 1.5 px vertically.

Two fixes came from measuring:

- draw.io places a top-aligned label 5 px lower than its spacing says, and a bottom-aligned
  one 1 px higher. The converter subtracts both.
- Attach fractions stored to two decimals tilted straight ERD lines by 1.4 px. They are now
  stored to four.
