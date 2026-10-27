# D2 syntax reference

Complete declarative syntax for D2 (written against v0.7.1, tested with v0.9.0). Anything marked *(verified)* was tested against
the installed binary rather than taken on the documentation's word.

## Contents

- [Shapes](#shapes) · [Shape catalog](#shape-catalog)
- [Connections](#connections) · [Arrowheads](#arrowheads)
- [Containers](#containers)
- [Labels, text, Markdown, code, LaTeX](#labels-text-markdown-code-latex)
- [Comments](#comments) · [Strings and quoting](#strings-and-quoting)
- [Classes](#classes)
- [Variables and substitutions](#variables-and-substitutions)
- [Globs](#globs)
- [Imports](#imports)
- [Overrides, null, suspend](#overrides-null-and-suspend)
- [Positions and dimensions](#positions-and-dimensions)
- [Interactivity](#interactivity)
- [Composition: layers, scenarios, steps](#composition-layers-scenarios-steps)
- [Reserved keywords](#reserved-keywords)

---

## Shapes

A bare identifier declares a shape. Keys are **case-insensitive** — `postgresql` and
`postgreSQL` are the same shape.

```d2
imAShape
im_a_shape
im a shape
a-shape
```

A single hyphen is not a connection; `a--shape` would be. Semicolons put several shapes on
one line:

```d2
SQLite; Cassandra
```

A shape's label defaults to its key. Assign a different one after a colon. The part before
the colon is the **key** you reference everywhere else; the part after is cosmetic:

```d2
pg: PostgreSQL
Cloud: my cloud
Cloud.shape: cloud
```

Default shape type is `rectangle`.

### Shape catalog

Standard shapes — every one below verified to compile:

| | | | |
|---|---|---|---|
| `rectangle` (default) | `square` | `page` | `parallelogram` |
| `document` | `cylinder` | `queue` | `package` |
| `step` | `callout` | `stored_data` | `person` |
| `diamond` | `oval` | `circle` | `hexagon` |
| `cloud` | `c4-person` | | |

Special shapes, each with its own sub-syntax:

| Shape | Purpose | See |
|---|---|---|
| `text` | non-Markdown plain text | below |
| `code` | code block | below |
| `class` | UML class | `diagram-types.md` |
| `sql_table` | ERD table | `diagram-types.md` |
| `sequence_diagram` | sequence diagram | `diagram-types.md` |
| `image` | standalone image | needs an `icon` field or the compile fails *(verified)* |

`circle` and `square` hold a **1:1 aspect ratio** — a long label widens *and* heightens
them, and setting `width`/`height` snaps both to the larger value.

`person` and `c4-person` are ratio-capped too (1.50:1 and 1.05:1), which turns a long
actor name into a wide, squat figure — the cause and the three fixes are in
`styling.md` § *Person shapes get fat*.

---

## Connections

Four operators, and only four:

```d2
Write Replica Canada <-> Write Replica Australia
Read Replica <- Master
Write Replica -> Master
Read Replica 1 -- Read Replica 2
```

Referencing an undeclared shape in a connection creates it.

**Connections reference keys, not labels.** This is the most common D2 mistake, and it
fails silently rather than erroring:

```d2
be: Backend
fe: Frontend

Backend -> Frontend   # WRONG — creates two brand-new shapes
be -> fe              # right — connects the existing ones
```

Labels and chaining:

```d2
Read Replica 1 -- Read Replica 2: Kept in sync
d -> a -> c
```

**Repeated connections do not merge — they declare new, parallel connections.** To style
an existing one, reference it by index:

```d2
x -> y: hi
x -> y: hello

(x -> y)[0].style.stroke: red
(x -> y)[1].style.stroke: blue
```

Cycles are fine.

### Arrowheads

Set `source-arrowhead` and/or `target-arrowhead` on a connection. A bare value is the
arrowhead's *label*; a map configures its shape.

```d2
a -> b: To err is human {
  source-arrowhead: 1
  target-arrowhead: * {
    shape: diamond
    style.filled: true
  }
}
```

Shapes *(all verified)*: `triangle` (default), `arrow`, `diamond`, `circle`, `box`,
`cross`, `cf-one`, `cf-one-required`, `cf-many`, `cf-many-required` — the `cf-` set is
crow's foot notation for ERDs.

- `triangle` accepts `style.filled: false`; `diamond`, `circle` and `box` accept
  `style.filled: true`.
- An arrowhead on an end that has no arrow does nothing. `x -> y` has no source arrow, so
  a `source-arrowhead` there is silently inert.
- Keep arrowhead labels short — they skip autolayout and collide easily.

---

## Containers

Dot notation or nested maps:

```d2
clouds: {
  aws: {
    load_balancer -> api
    api -> db
  }
  gcloud: {
    auth -> db
  }
  gcloud -> aws
}
```

Container labels, two equivalent forms:

```d2
gcloud: Google Cloud { ... }
gcloud: { label: Google Cloud }
```

`_` refers to the **parent scope**, letting you reach outside a container from within:

```d2
christmas: {
  presents
}
birthdays: {
  presents
  _.christmas.presents -> presents: regift
  _.christmas.style.fill: "#ACE1AF"
}
```

Containers resize to fit their children, so `width`/`height` cannot be set on them — ELK
is the exception.

---

## Labels, text, Markdown, code, LaTeX

A standalone block string is Markdown:

```d2
explanation: |md
  # I can do headers
  - lists
  - lists

  And other normal markdown stuff
|
```

To put a Markdown label *on a shape*, declare the shape explicitly:

```d2
explanation: |md
  # header
|
explanation.shape: rectangle
```

**Do not use a Markdown block as an ordinary node label.** A Markdown block is a text
panel, not a shape, and it behaves differently in two ways that both look like rendering
bugs *(verified by isolating a plain label against a Markdown one with the same class)*:

- **It ignores `stroke`** — you get the fill with no border, and the text overflows it.
- **It collapses single newlines**, per normal Markdown paragraph rules, so two source
  lines silently run together.

For a multi-line node label, use a quoted plain label with `\n`. It gets a proper border,
centred text, and the line breaks you wrote. Reserve Markdown blocks for standalone panels
where you actually need lists, bold or code spans — and keep any heading in them short
(see `styling.md` on heading clipping).

Swap `md` for a language to get a syntax-highlighted code block:

```d2
explanation: |go
  awsSession := From(c.Request.Context())
  client := s3.New(awsSession)
|
```

Languages come from the Chroma library; D2 adds the aliases `md`, `tex`, `js`, `go`, `py`,
`rb`, `ts`. An unrecognised language degrades to plain text rather than erroring.

LaTeX via `latex` or `tex` — MathJax under the hood, so mathematical notation, not
documents:

```d2
formula: |latex
  \lim_{h \rightarrow 0 } \frac{f(x+h)-f(x)}{h}
|
```

LaTeX blocks ignore `font-size`; size them with `\tiny{}`, `\small{}`, `\normal{}`,
`\large{}`, `\huge{}`. MathJax has no linebreaks — approximate with `displaylines`.

**Block string delimiters.** If the content contains `|`, add more pipes, or use any
non-alphanumeric symbol as the delimiter:

```d2
my_code: |||ts
  const works = (a > 1) || (b < 2)
|||

my_code: |`ts
  declare function getSmallPet(): Fish | Bird;
`|
```

Non-Markdown text, useful for titles and captions:

```d2
title: A winning strategy {
  shape: text
  near: top-center
  style: {
    font-size: 55
    italic: true
  }
}
```

Unicode, CJK and emoji all work *(verified — Chinese labels render correctly, and the text
stays selectable in the SVG)*.

---

## Comments

```d2
# line comment
x -> y # trailing comment

"""
block
comment
"""
```

A `#` inside a URL starts a comment unless the value is quoted — a real trap for links
carrying fragments. In UML class bodies, escape a literal `#` as `\#`.

---

## Strings and quoting

Mostly you do not need quotes, which is deliberate — leading and trailing whitespace is
trimmed for you. Quote (single or double) when text contains characters the language uses:
`{}`, `|`, `#`, `->`, `.`, `;`, `:`. Use double quotes if the text contains single quotes
and vice versa; if it contains both, use double and escape with `\`.

**Single quotes bypass `${}` substitution**; double quotes do not.

`\n` inside a label forces a line break.

To use a reserved keyword as a key, quote it: `"label": string`.

---

## Classes

Reusable attribute bundles under the `classes` keyword:

```d2
classes: {
  load balancer: {
    label: load\nbalancer
    width: 100
    style: {
      stroke-width: 0
      fill: "#44C7B1"
      shadow: true
    }
  }
  unhealthy: {
    style: {
      fill: "#FE7070"
      stroke: "#F69E03"
    }
  }
}

web lb.class: load balancer
api2.class: unhealthy
```

- On connections: `a -> b: {class: something}`, or afterwards
  `(a -> b)[0].class: something`.
- An attribute set directly on an object **overrides** the class.
- Multiple classes take an array, applied **left to right**, so the later one wins:
  `logo.class: [d2; sphere]`
- Any `class` is written into the SVG as a real `class` attribute, so it can be targeted
  with your own CSS or JS after export.

---

## Variables and substitutions

```d2
vars: {
  server-name: Cat
  primary: "#44C7B1"
}
server: ${server-name}
server.style.fill: ${primary}
```

- Nested vars use dots: `${group.item}`.
- Scoped like ordinary programming variables — the innermost definition wins.
- Single quotes bypass substitution.
- `...${x}` spreads a map or array.

### Configuration variables

`d2-config` sets CLI options from inside the file, which keeps a diagram's intended
rendering with the diagram:

```d2
vars: {
  d2-config: {
    theme-id: 4
    dark-theme-id: 200
    pad: 0
    center: true
    sketch: true
    layout-engine: elk
  }
}
```

That is equivalent to
`d2 --layout=elk --theme=4 --dark-theme=200 --pad=0 --sketch --center`.
**CLI flags and environment variables take precedence over `d2-config`**, so a flag will
quietly beat what the file asks for.

`d2-legend` declares a legend — see `styling.md`.

---

## Globs

Bulk edits in one line. Globs apply **backwards and forwards**: a rule is re-evaluated
against every shape declared after it, not only those already present. Globs are
case-insensitive.

```d2
iphone 10
iphone 11 mini
iphone 11 pro

*.height: 300
*mini.height: 200
*pro.height: 400
```

| Form | Scope |
|---|---|
| `*` | the current scope only |
| `**` | recursive; for connections, leaf shapes only |
| `***` | global — crosses into `layers` and survives imports |

Glob connections: `* -> *`, with self-connections deliberately omitted. Target existing
connections with `(* -> *)[*].style.stroke: red`.

**Filters** use `&` with any reserved keyword, plus the special `connected: true|false`
and `leaf: true|false`. Extra filter lines are ANDed; `!&` inverts. Connections filter on
endpoints via `&src:` / `&dst:`, which take absolute IDs.

```d2
*: {
  &shape: circle
  style.fill: red
}
```

Changing theme defaults is the everyday use:

```d2
***.style.fill: lightblue
(*** -> ***)[*]: {
  style.stroke: red
}
```

---

## Imports

```d2
a: @x                      # regular — the whole file becomes a's map
a: { ...@x }               # spread — file contents merged into this map
a: @people.managers.sue    # partial — one object out of a file
```

- Omit the `.d2` extension; autoformat strips it anyway.
- Spread imports only work inside a map. `a: ...@x.d2` is invalid.
- Relative imports resolve **relative to the importing file**, not the working directory.
- Windows absolute paths must be quoted: `x: @"C:\path\to\file"`.
- Quote filenames containing dots: `@"schema-v0.1.2"`.
- Globs inside an imported file are not carried over — except triple globs, which are.

---

## Overrides, null and suspend

Redeclaring a shape **merges** with the earlier declaration, and the latest explicit label
wins.

Assign `null` to delete a shape, connection or attribute:

```d2
x -> y
y: null             # deletes y AND its connections
a.style.fill: null  # deletes just that attribute
```

Nulling a shape implicitly nulls its connections and its descendants.

`suspend` / `unsuspend` mark objects for deletion and restore them. This is the basis of
the model-view pattern: define every model once, then reveal a subset per view.

```d2
**: suspend
(** -> **)[*]: suspend

diners.daniel: unsuspend
```

---

## Positions and dimensions

Positioning is the layout engine's job — that is most of the point of text-to-diagram.
Two escape hatches exist.

**`near` with a constant** *(all verified)*: `top-left`, `top-center`, `top-right`,
`center-left`, `center-right`, `bottom-left`, `bottom-center`, `bottom-right`. This is how
you add a title or pin a legend:

```d2
title: |md
  # A winning strategy
| { near: top-center }
```

**`near` nested under `label` or `icon`** positions those within a shape, and unlocks two
extra prefixes:

- `outside-top-left`, `outside-top-center`, `outside-top-right`, `outside-left-center`,
  `outside-right-center`, `outside-bottom-left`, `outside-bottom-center`,
  `outside-bottom-right`. Note `outside-left-center` reverses the word order of
  `center-left`.
- `border-*` puts the label on the border itself.

**`near` set to another object's ID works only in TALA**, as do `top` and `left`.

`width` and `height` work on most shapes but **not containers**, which size to their
children. ELK is the exception.

---

## Interactivity

```d2
x: { tooltip: Total abstinence is easier than perfect moderation }
y: I am a Mac { link: https://apple.com }
x -> y: gazoontite { link: https://google.com }
```

- Tooltips are HTML `title` attributes, so Markdown inside them will not render.
- Giving a tooltip a `near` field pins it open permanently.
- `link` can also point at another board (`link: layers.detail`) for click-through
  navigation. In a `link` value, `_` means the parent **board**, not the parent container.
- PNG exports turn tooltip icons into numbers and append an index; `--force-appendix` does
  the same for SVG.

---

## Composition: layers, scenarios, steps

Three keywords declare additional boards. They differ only in what they inherit:

| Keyword | Inheritance |
|---|---|
| `layers` | nothing — a fresh board, for a new level of abstraction |
| `scenarios` | inherits the base layer — an alternate view of the same thing |
| `steps` | inherits the previous step — a sequence of events |

```d2
x -> y
layers: {
  detail: {
    a -> b -> c
  }
}
scenarios: {
  failure: {
    y.style.fill: salmon
  }
}
```

**A multi-board diagram does not produce one SVG.** `d2 in.d2 out.svg` writes a
*directory* `out/` instead.

**Where the boards land depends on how many board KEYWORDS the file uses** *(verified
against v0.7.1 -- the earlier "always nested" note here was wrong for the common case)*:

| The file uses | Output |
|---|---|
| one keyword only (`layers` **or** `scenarios` **or** `steps`), any number of boards | **flat**: `out/index.svg`, `out/detail.svg`, `out/failure.svg` |
| two or more keywords | **nested by type**: `out/index.svg`, `out/layers/detail.svg`, `out/scenarios/failure.svg` |
| a layer that itself has layers | `out/layers/detail/index.svg`, `out/layers/detail/deeper.svg` |

Note also that the directory **drops the extension**: ask for `out.svg` and you get `out/`,
never `out.svg/`. A caller that tests the path it passed will always conclude the render
failed. Glob the directory instead of predicting the paths.

For a single file use `--animate-interval=1200`; for the root board alone use
`--target=''`. `scripts/render.py` detects this case and reports the real paths.

---

## Reserved keywords

Anything below is interpreted rather than treated as a shape name. Quote it to use it
literally.

**Structural** — `shape`, `label`, `icon`, `style`, `class`, `classes`, `vars`,
`direction`, `near`, `width`, `height`, `constraint`, `tooltip`, `link`,
`source-arrowhead`, `target-arrowhead`, `layers`, `scenarios`, `steps`, `suspend`,
`unsuspend`, `top`, `left`, `grid-rows`, `grid-columns`, `grid-gap`, `vertical-gap`,
`horizontal-gap`.

**Config** — `d2-config` (`theme-id`, `dark-theme-id`, `pad`, `center`, `sketch`,
`layout-engine`, `theme-overrides`, `dark-theme-overrides`, `data`) and `d2-legend`, both
nested under `vars`.

**Style** — see `styling.md`.

`direction` takes `up`, `down`, `right`, `left`. It applies globally; only TALA honours it
per-container.

### Style keywords are reserved too

Naming a shape after a style keyword fails, and the error names the keyword rather than
the line's real problem — `multiple must be style.multiple` for a node called `multiple`,
likewise `3d`, `shadow`, `opacity`, `fill`. Rename the node ("stacked copies", "3D block")
rather than trying to quote your way out.

### Block strings and the pipe collision

The delimiter is whatever follows the first `|`, so **a Markdown table terminates a `|md`
block at its first cell separator** — the error is `unexpected text after md block
string`, which does not obviously point at the table. Pick a different delimiter:

```d2
notes: |`md
  | layer | hit rate |
  |---|---|
  | Redis | ~95% |
`|
```

Any non-alphanumeric symbol works (`|||`, ``|` ``, `|~`). Reach for this by default when
the content is Markdown containing a table, or code in a language that uses `|`.
