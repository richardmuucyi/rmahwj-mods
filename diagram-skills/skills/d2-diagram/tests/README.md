# d2-diagram test corpus

Thirteen cases: an eleven-rung complexity ladder plus two negative controls. Every case
is a small but realistic scenario (a bakery, a library, a weather-station network, a
ticket booking site) rather than a toy, so a failure reads as "the skill can no longer
draw the lending schema", not "case 6 broke".

```bash
python tests/run_harness.py                 # everything
python tests/run_harness.py --max-level 4   # the cheap rungs only
python tests/run_harness.py --only 05 09    # by id prefix
python tests/run_harness.py --rasterize     # also write PNGs to look at
python tests/run_harness.py --json          # machine-readable
```

Exit 0 only when every gate on every case passed.

## What "complexity" means here

The ladder is **not** "more boxes". Each rung adds one new *kind* of thing, and with it
one new way to be silently wrong. That is what makes it a useful regression ladder: a
break at rung N tells you which capability regressed.

| Rung | Scenario | Adds | The failure it guards |
|---|---|---|---|
| 0 | Notes sync laptop↔desktop | a linear chain, `direction` | nothing yet — this is the floor |
| 1 | Bakery order routing | shape semantics, branches | shape carrying meaning no label repeats |
| 2 | Shared-drive structure | containers | grouping by styling instead of containers |
| 3 | App signup | `classes`, class on a connection | per-shape style maps that rot in a week |
| 4 | Weather-station topology | globs + an explicit exception | the glob silently beating the specific rule |
| 5 | Booking app token handshake | `sequence_diagram` | flat scope; declaration order *is* the layout |
| 6 | Library lending schema | `sql_table`, crow's foot | dagre attaching FKs to the table, not the row |
| 7 | Shop integrations + legend | legend, tooltips, links | a legend of coloured rectangles that explain nothing |
| 8 | Ticketing test matrix | `grid-rows` / `grid-columns` | column-wise fill scrambling a row-major table |
| 9 | Station degraded mode | `scenarios` | multi-board writing a directory, not a file |
| 10 | Library lending C4 | `layers`, cross-board links, `d2-config` | layers inheriting nothing; config not travelling |

## The gates

Seven per case. The compile is only the first, because D2's worst failures all exit 0.

| Gate | Catches |
|---|---|
| `compiles` | syntax and semantic errors — the only real gate d2 gives you |
| `board-shape` | a multi-board diagram writing a directory when you expected a file |
| `board-count` | a board silently missing |
| `shape-count` | **the workhorse** — a label parsed as a key invents shapes |
| `edge-count` | a connection dropped or duplicated |
| `required-shapes` | a specific node vanishing under a rename |
| `no-phantom-shapes` | ids that read like prose — a mis-parsed label |
| `aspect-ratio` | a runaway layout, usually the wrong `direction` |
| `required-text` | a label that never made it into the render |

**`shape-count` does the real work.** When the classic label-instead-of-key bug was
injected into case 3 (`Auth API -> db` instead of `api -> db`), `compiles` passed,
`no-phantom-shapes` passed — "Auth API" is too short to look like prose — and only the
declared inventory caught it. A heuristic is a hint; a declared count is a test.

## The negative controls

A harness where nothing can fail is not testing anything. Two cases exist to fail:

- **`_neg-01-unknown-shape`** must *not compile*. `d2 validate` returns exit 0 and prints
  `Success!` on this exact file, which is why the compile is the gate and validate never is.
- **`_neg-02-phantom-label`** *compiles cleanly and draws the wrong graph* — it connects
  labels instead of keys and writes a multi-line label across real lines. It declares
  `expect_gate_failures`, so it passes only when exactly `shape-count` and
  `no-phantom-shapes` catch it. If either gate stops firing, this case turns red. That is
  the only way to notice a check has quietly stopped checking.

## Counting rules discovered by building this corpus

Found against d2 v0.7.1 and still holding on v0.9.0 (the harness passes on both). Each one
would otherwise make an assertion wrong:

- **Sequence diagrams: `edges == messages + actors`.** Every lifeline renders as a
  dangling connection (`(client -- )[0]`). Two actors and one message report 3 edges.
- **Sequence-diagram notes are legitimately prose-shaped ids**, so the phantom heuristic
  false-positives on them. Cases name them in `allow_prose_shapes` rather than switching
  the gate off.
- **ERD rows are not shapes.** The inventory counts tables, never columns.
- **Grid cells *are* shapes.** A 4×4 grid is 17 shapes — 16 cells plus the container.
- **Legend connections count; opacity-0 legend endpoints do not.**
- **Multi-board output drops the extension**: ask for `out.svg`, get `out/`.
- **Boards sit flat when the file uses one board keyword**, and nest under
  `layers/` `scenarios/` `steps/` only when it uses two or more. The skill's docs
  previously claimed always-nested, marked *(verified)*; that was wrong for the common
  case and has been corrected.

## Adding a case

One directory per case holding three files:

- `request.md` — the request in the user's words. This is the input for the eval layer,
  where the *agent* has to pick the diagram type; the harness itself never reads it.
- `reference.d2` — a known-good answer, commented with what the rung teaches.
- `expect.json` — the assertions. Keys: `complexity`, `scenario`, `teaches`,
  `expected_type`, `type_alternatives`, `vectors_offered`, `compile`, `shapes`, `edges`,
  `must_contain_shapes`, `must_contain_text`, `allow_prose_shapes`, `multiboard`,
  `boards`, `layout`, `theme`, `max_aspect`, `expect_gate_failures`, `fails_with`.

Derive the counts from the source by hand first, then run. If the render disagrees, find
out why before editing the number — every counting rule above was found exactly that way.

## The genre gallery (`all-types/`)

A second, smaller corpus with a different job. The ladder above tests that the skill draws
the *right graph*; `all-types/` holds one small diagram per genre the skill proposes
(plain, sequence, ERD, class, grid, C4-style containers, scenarios) so that a change to a
theme, the class block or the shared palette can be seen across **every** genre at once.
Each sample sets `theme-id: 0` and `dark-theme-id: 200`, so it carries both colour sets.

```bash
python scripts/gallery.py --out <dir>   # render light + dark, check corners, write contact sheets
python tests/eval_gallery.py            # the eighth layer: shipped corpus green, control corpus red
```

`eval_gallery.py` expects **8 boards** from the 7 sources, because `07-scenarios` draws
two. It judges corners from the PNGs itself, then builds a control corpus that must fail:
a copy of `01-plain` with its dark theme removed (its "dark" PNG is light) and a source
with `shape: bogus_shape`. Both must be named in the gallery's `FAIL` lines.

## Test layers

Eleven layers, each with its own controls. Run them after changing any script or reference.

```bash
python tests/run_harness.py     # 13 cases: the 0-10 ladder + 2 negative controls
python tests/eval_advisor.py    # does the classifier still propose the right genre?
python tests/eval_visual.py     # does the eye still see, and still stay quiet?
python tests/eval_quality.py    # does criterion 9 still catch a lying legend, and criterion 11 a container label louder than its nodes?
python tests/eval_reviewer.py   # do the reviewer's fixtures still render, and the template still carry every placeholder?
python tests/eval_raster.py     # is the PNG light by default, dark on request, and never faked dark?
python tests/eval_aesthetics.py # does the starting class block in aesthetics.md keep its own rules (no person shape, strokes 3:1, labels 4.5:1), and does every actor icon pass 3:1 on white and on the dark canvas?
python tests/eval_gallery.py    # does every genre in tests/all-types/ render light and dark with the right ground?
python tests/eval_layouts.py    # does --compare-layouts say "no effect" only when the engines drew the same picture, and name the boards of a multi-board file?
python tests/eval_drawio.py     # does to_drawio.py carry every object across where d2 drew it, and does draw.io open the result?
python tests/eval_from_drawio.py # do draw.io edits come back into the .d2 in their place, and is what cannot be carried reported?
```

After a change to themes, classes or the shared palette, also run `scripts/gallery.py
--out <dir>` and **open every contact sheet it lists**. `eval_gallery.py` proves each genre
renders on the right ground; only looking proves its labels can be read.

Nine of the eleven layers carry a case designed to **fail**, because a suite where nothing
can fail is not testing anything: `run_harness.py`'s `_neg-01`/`_neg-02` (a diagram that
must not compile, and one that compiles while drawing the wrong graph), `eval_visual.py`'s
clipped-heading and icon-over-label fixtures, `eval_quality.py`'s lying-legend
fixtures, `eval_raster.py`'s light-only SVG, which `--color-scheme dark` must leave
light, `eval_aesthetics.py`'s old-block fixture, the class block in its older form
(a `shape: person` actor and greys below the contrast floor), and `eval_gallery.py`'s control corpus (a light-only copy of a sample and a
source that must not compile, both of which the gallery must name), and `eval_layouts.py`'s
plain diagram, which ELK does move, so it must never be told "no effect", and `eval_drawio.py`'s
negative control (a shape moved 30 px, an ID dropped and an attach point nudged in a converted
file, all three of which the checks must report), and `eval_from_drawio.py`'s three (a `.d2`
changed after conversion must be refused, an untrusted source must report its message order,
and faults planted in a good result must each be reported). `eval_advisor.py` scores real corpus requests rather than a fixture built to
fail, and `eval_reviewer.py` checks that both fixtures still render and the template still
carries every placeholder, plus a structural assertion that `seeded.d2` keeps its clerk
nested and `clean.d2` keeps it out. If one of the seven turns green when it should be red,
the check has quietly stopped checking.
