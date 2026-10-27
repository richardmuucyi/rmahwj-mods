# D2 diagram types

Special shapes that unlock a whole diagram genre, plus which layout engine each one wants.

- [Sequence diagrams](#sequence-diagrams)
- [UML class diagrams](#uml-class-diagrams)
- [SQL tables / ERDs](#sql-tables--erds)
- [Grid diagrams](#grid-diagrams)
- [C4 diagrams](#c4-diagrams)
- [Choosing a type](#choosing-a-type)

---

## Sequence diagrams

Set `shape: sequence_diagram` on an object — usually the root.

```d2
shape: sequence_diagram
alice -> bob: What does it mean to be well-adjusted?
bob -> alice: The ability to play bridge or golf as if they were games.
```

There is no separate syntax to learn; the ordinary D2 rules apply, with two differences
that matter a lot:

**1. Scope is flat.** Children of a sequence diagram share one scope throughout. Outside a
sequence diagram, `groupA.alice` and `groupB.alice` are two shapes; inside one, they are
the same actor. This is what makes groups work.

**2. Order matters.** Everywhere else in D2 declaration order carries no meaning. Here it
is the whole layout. Actors appear left to right in declaration order, and messages appear
top to bottom in declaration order. Declare actors explicitly when you want a particular
column order:

```d2
shape: sequence_diagram
a; b; c; d          # fixes the column order
c -> d
d -> a
b -> d
```

An "actor" is what other tools call a participant.

### Counting what a sequence diagram actually drew

`render.py --check` reports **more connections than you wrote**, and the difference is
not a bug. Each actor's lifeline renders as a dangling connection -- the inventory shows
them as `(client -- )[0]` -- so:

    edges == messages + actors

*(verified: 2 actors and 1 message report 3 connections.)* Assert `--expect-edges` with
that formula or every sequence-diagram assertion you write will be wrong by the actor
count. Notes and groups DO count as shapes; a note's id is its own text, so
`--check` flags it as prose-like. That warning is a false positive on notes.

### Spans

A span (elsewhere: lifespan, activation box, activation bar) is a nested object on an
actor, connected to something:

```d2
shape: sequence_diagram
alice.t1 -> bob
alice.t2 -> bob.a
alice.t2.a -> bob.a
alice.t2.a <- bob.a
alice.t2 <- bob.a
```

Nesting spans inside spans gives you nested activation bars.

### Groups

A group (elsewhere: fragment, edge group, frame — `alt`, `loop`, `opt` in UML) is a
container inside the sequence diagram that is not itself connected to anything:

```d2
shape: sequence_diagram
alice
bob
shower thoughts: {
  alice -> bob: A physicist is an atom's way of knowing about atoms.
  alice -> bob: Today is the first day of the rest of your life.
}
life advice: {
  bob -> alice: If all else fails, lower your standards.
}
```

**Actors used inside a group must be declared at the top level first** — that is why
`alice` and `bob` appear alone above. Skipping this is the most common sequence-diagram
error, and because of the flat-scope rule it produces a confusing result rather than a
clean failure.

### Notes

A nested object on an actor with **no** connections is a note:

```d2
shape: sequence_diagram
alice -> bob
bob."In the eyes of my dog, I am a man."
important insight: {
  bob."Cold hands, no gloves."
}
bob -> alice: Chocolate chip.
```

### Self-messages

```d2
father -> father: internal debate ensues
```

### Styling

Style actors and messages like anything else. Lifeline edges inherit the actor's `stroke`
and `stroke-dash`, which is the lever for showing a dead or inactive participant.

---

## UML class diagrams

```d2
D2 Parser: {
  shape: class

  +reader: io.RuneReader
  readerPos: d2ast.Position

  -lookahead: "[]rune"
  \#lookaheadPos: d2ast.Position

  +peek(): (r rune, eof bool)
  rewind()
  commit()
  \#peekn(n int): (s string, eof bool)
}

"github.com/terrastruct/d2parser.git" -> D2 Parser
```

Rules:

- Each key is a field or a method. **A key containing `(` is a method**; its value is the
  return type. A method key with no value returns void.
- A field's value is its type. Wrap types containing D2 syntax in quotes — `"[]rune"`.
- Visibility prefixes: none or `+` public, `-` private, `#` protected. **`#` must be
  escaped as `\#`**, otherwise the line is parsed as a comment and vanishes.
- Quote reserved keywords used as member names: `"label": string`.

ELK usually routes class diagrams more cleanly than dagre.

---

## SQL tables / ERDs

```d2
objects: {
  shape: sql_table
  id: int {constraint: primary_key}
  disk: int {constraint: foreign_key}
  json: jsonb {constraint: unique}
  last_updated: timestamp with time zone
}

disks: {
  shape: sql_table
  id: int {constraint: primary_key}
}

objects.disk -> disks.id
```

- Each key is a row; the value after the colon is its type.
- `constraint` is rendered short for the recognised values: `primary_key` → PK,
  `foreign_key` → FK, `unique` → UNQ. Any other constraint is shown verbatim.
- Multiple constraints take an array: `x: int { constraint: [primary_key; unique] }`.
- Foreign keys are just connections between rows: `objects.disk -> disks.id`.
- **Connections point at the exact row only under ELK or TALA.** Under dagre they attach
  to the table as a whole, which usually looks wrong for an ERD — so prefer
  `--layout=elk` here.
- **Rows are not shapes.** The inventory counts the three *tables*, not their columns
  *(verified)*. On an ERD, expected shape count is the table count -- never the column
  count -- so an assertion built from "things I can see" will be far too high.
- Crow's foot arrowheads (`cf-one`, `cf-many`, and the `-required` variants) give
  conventional cardinality notation.
- `fill` styles the header, `stroke` styles the body, `font-color` the header text.
  Because `stroke` is the **row background**, not a border, a bright stroke fills every
  row with it — a cyan stroke on a dark table makes the columns near-invisible. Pick the
  two so header and body both hold the one `font-color`.
- **A `sql_table` label cannot contain a newline.** `users: "user_roles\n(join table)"`
  is a hard error, `shape sql_table cannot have newlines in label` *(verified v0.7.1)* —
  unlike every other shape, where `\n` is the recommended way to break a label. Keep the
  qualifier on one line, or move it to a `shape: text` node beside the table.

---

## Grid diagrams

`grid-rows` and `grid-columns` impose a structured grid, bypassing the layout engine.

```d2
grid-rows: 3
Executive
Legislative
Judicial
```

- Setting only one of the two lets cells expand to fill.
- Setting both makes **the one declared first dominant** — it decides the fill order.

**The trap: `grid-columns` on its own fills COLUMN-wise.** Declaring a table header row
followed by data rows under a bare `grid-columns: 7` scatters your header down the first
column instead of across the top — and it looks deliberate, so it is easy to miss.
Verified behaviour with `A1;A2;A3` then `B1;B2;B3`:

| Declaration | Fill order |
|---|---|
| `grid-columns: 3` | column-wise — **scrambles a row-major table** |
| `grid-rows: 2` | row-wise |
| `grid-rows` then `grid-columns` | row-wise |
| `grid-columns` then `grid-rows` | column-wise |

For a table written row by row, declare **`grid-rows` first**.
- Gaps: `grid-gap`, or `vertical-gap` / `horizontal-gap` which override it. `grid-gap: 0`
  produces solid tables and maps.
- Elements in a column share a width and elements in a row share a height, so one long
  label pads a whole row. Fix by setting explicit `width`s.
- Align a ragged grid by padding it with invisible elements (opacity 0).
- Grids nest inside grids.

**Connections between cells inside a grid are straight centre-to-centre segments with no
path-finding**, because the grid has taken positioning away from the layout engine.
Connections to the grid *as a whole* route normally.

**A grid container is ranked as its own component, so edges into its children do not
order it.** Give a grid to a container mid-flow — `internet -> lb -> zones` where `zones`
holds two grid-laid availability zones — and writing `lb -> zones.aza.appa` leaves the
grid unranked relative to `lb`. Both engines then park it *beside* the upstream chain
instead of below it, and the diagram reads with its arrows running backwards: the load
balancer sits at the bottom with traffic apparently flowing up into the servers it feeds.
Nothing errors; the graph is correct and the picture lies.

Edge to the **container**, not into its children:

```d2
lb -> zones: "spreads traffic across both zones"   # ranks the grid after lb
```

*(Verified v0.7.1, dagre and elk alike. Took a 0.48:1 strip with inverted flow to a
0.79:1 diagram reading correctly top-down.)* Watch for it whenever a grid sits in the
middle of a flow rather than at the end of one.

For a table of data, a Markdown table in a single shape is usually less work than a grid,
especially with repeated cell values.

---

## C4 diagrams

D2 has no dedicated C4 mode, but it ships the pieces: `shape: c4-person`, theme `303`
(C4), containers for boundaries, and `layers` for the C4 level hierarchy — Context →
Container → Component, each a layer, linked with `link: layers.<name>` so a reader clicks
down through the levels.

---

## Choosing a type

| The user wants | Use | Layout |
|---|---|---|
| Boxes and arrows, system architecture | plain shapes + containers | dagre, or elk if routes get messy |
| Who calls whom, in what order | `sequence_diagram` | n/a — self-laid-out |
| Database schema, entity relationships | `sql_table` | **elk** (row-exact routing) |
| Code structure, types, inheritance | `class` | elk |
| Deployment matrix, org grid, a table | `grid-rows`/`grid-columns` | n/a — grid controls it |
| The same system at several zoom levels | `layers` | any |
| One system in normal vs failure mode | `scenarios` | any |
| A process unfolding over time | `steps` | any |

When in doubt, plain shapes with containers is the right default. The special shapes are
worth reaching for only when the genre really matches — a sequence diagram drawn as boxes
and arrows is worse than one drawn as a sequence diagram, but an architecture diagram
forced into a grid is worse than one laid out freely.
