# Stage 5 in detail

## 5a. The playwright-cli traps `visual_review.py` handles

Three traps are already handled inside the script, and will bite anyone who calls
playwright-cli directly: the **`file:` protocol is blocked** (so the SVG is served over
loopback); **`goto` on a bare `.svg` reports a TimeoutError even on success** (the load
event never fires, so the SVG is inlined into a wrapper page and success is confirmed by
probing the DOM); and on Windows **`playwright-cli` is an npm `.cmd` shim** that dies with
`WinError 2` unless the resolved path is passed. A fourth bites the probe itself:
playwright-cli wraps your JS in a single-quoted string, so it must be one line with no
`//` comments.

## 5b–5d. Inventory, ASCII, quality score, layout comparison

**b. Check the inventory.** A mistyped label or a renamed reference silently *creates* a
shape, and d2 still exits 0. `--check` decodes the shape and connection IDs back out of the
rendered SVG so you can see what was actually drawn:

```bash
python scripts/render.py <name>.d2 -o <name>.svg --check
```

Read the list against what you intended. It flags IDs that read like prose — the signature
of a label parsed as a new key — and notes unconnected shapes. Neither flag is proof;
titles and notes are legitimately unconnected. When you know the count, assert it:
`--expect-shapes 12 --expect-edges 15` exits non-zero on a mismatch.

**c. ASCII, for topology only.** `--ascii-preview` renders the same graph as Unicode
box-drawing and prints it, which is useful for checking arrow direction and container
membership. Know its blind spots: it cannot show icons, Markdown blocks, colour or
overlap, so it silently passes the defects listed in (a). Never let it be the only check on
a diagram anyone will look at.

**d. Score it, if it carries a legend or you are reworking someone else's diagram.**

```bash
python scripts/quality.py <name>.d2
```

Eleven criteria; the one the other checks cannot see is **criterion 9, legend honesty**. A
legend row whose class never appears in the body claims an encoding the diagram does not
use; a class used with no row is an encoding nobody can decode. Both pass the compiler,
both pass the geometry check, and both are invisible to the person who wrote them —
because the failure mode is a legend *copied* between diagrams that share a palette file.
The classes travel; the usage does not. This was found the hard way: it was flagged by an
adversarial reviewer, fixed, and then reintroduced in the same session by pasting one
legend into six diagrams.

The rest of the criteria are worth a glance when you inherit a diagram rather than write
one — label length, canvas area, whether styling is centralised.

**Criterion 11** warns when a container label is louder than its nodes. d2 draws container
labels at 28 px over 16 px nodes, so the grouping box shouts over what it groups
(`references/aesthetics.md`). The fix it names is the `zone` class. A `sequence_diagram` or
grid wrapper is exempt from the size rule, because its label is the diagram's title; it
warns only when the wrapper's bare key is showing (`seq`, `matrix`).

The script also reports canvas size and flags an aspect ratio beyond 6:1 — usually a sign
the diagram wants a different `direction`. Which layout engine suits a given diagram is not
predictable, and no number predicts it either — render both and look:

```bash
python scripts/render.py <name>.d2 -o <name>.svg --compare-layouts
```

It writes `<name>.dagre.svg/.png` and `<name>.elk.svg/.png` beside the output and prints
both canvas sizes, but **it does not pick one.** It used to recommend the less lopsided
canvas, and that chose the worse layout on both diagrams it was tried on: ELK beat dagre
on a skills map that dagre won on ratio, and dagre beat ELK on a request round trip that
ELK won on ratio, because ELK sent the return edge round the whole canvas. Open both PNGs,
choose by eye, and pin the winner with `layout-engine` in `d2-config`.

Two cases where there is nothing to open. A `sequence_diagram` or a grid places its own
shapes, so both engines draw byte-identical PNGs; the helper then says **"layout has no
effect on sequence_diagram"** (or `grid`) and keeps one render. A multi-board file
(`layers`, `scenarios`, `steps`) writes a folder per engine, so the helper does not run and
names the boards instead: re-run with `--target=<board>` (`--target=''` is the root board).
`tests/eval_layouts.py` holds both cases and a plain diagram as the control.

## 5e. The fresh-eyes reviewer (the longer text SKILL.md carried before it was trimmed)

**e. Dispatch the fresh-eyes reviewer.** You have now looked at your own diagram, which
is the weakest review available: it encodes your model of the system, so an error in that
model reads as correct to you.

Dispatch `agents/reviewer.md` via the `Agent` tool (`subagent_type: "general-purpose"`),
substituting `{TITLE}`, `{GENRE}`, `{SYSTEM_DESCRIPTION}`, `{DECLARED_FACTS}`,
`{PNG_PATH}` and `{SVG_LABELS}`. Give it the PNG and the label text — **not** your
reasoning and not the `.d2`.

It catches **semantic and boundary errors** — a claim the picture makes that contradicts
a declared fact or the system description, something sitting inside a container whose own
label rules it out. It does **not** catch geometry: the template's own "What NOT to
report" section tells it to stay off overlaps, clipping and canvas size, because (a) and
`quality.py` already own those. Dispatching it does not replace looking at the picture
yourself in (a) — it is a second, structurally different kind of eye, not a stronger
version of the first.

- **`{SVG_LABELS}`**: call `svg_labels()` from `scripts/quality.py` — the same function
  criterion 4 already uses for label-length scoring — on the rendered SVG path. It reads
  only `<text>...</text>` content, so the embedded `base64,` font data (measured 58% of a
  fixture SVG's bytes here) never enters the string in the first place. There is no
  separate stripping step to perform or forget:

  ```bash
  python -c "import sys; from pathlib import Path; sys.path.insert(0, 'scripts'); from quality import svg_labels; print('\n'.join(svg_labels(Path('<name>.svg'))))"
  ```

- **`{SYSTEM_DESCRIPTION}`** must be assembled from the declared `# SOURCE:` citations or
  a linked task page. If you free-write it, the reviewer validates the same model that
  drew the diagram and the exercise is worthless. Where no independent source exists, say
  `NO TRUSTED SOURCE` and the reviewer will treat every asserted interaction as
  unverified.

**Skip it only for a throwaway probe.** "The diagram is simple" and "I already looked at
it" are not reasons — looking at it yourself is the thing this stage exists to
supplement.

**Known limit, stated so it is not assumed away:** the reviewer does **not** reliably
catch a wrong *topology* (an edge drawn to the wrong neighbour). Topology is not a value,
so it cannot be reconstructed from `# SOURCE:` citations; catching it needs prose only
the author can write, which reintroduces the contamination.

## 5f. The design critic

**f. Optional: score the design with the critic.** Everything above finds defects and false
claims; nothing above judges whether the diagram is *good* — `quality.py` scores a naive and a
designed diagram the same. When a diagram is headed for other people (a deck, a spec, a note
others will read) or you are iterating it towards a quality bar, dispatch `agents/critic.md` via
the `Agent` tool (`subagent_type: "general-purpose"`). Give it the light and dark PNGs, the
`.d2`, the purpose in the user's words, and **the medium it will be read in** — legibility is
scored at that size, not at full resolution. It returns six scores (purpose, claim, layout,
labels, colour, legibility), an overall /10 and up to six ranked edits, each marked
*changes the claim* or *presentation only*.

- **Apply presentation edits; take claim-changing ones to the user**, or back through 5e. The
  critic does not verify facts — that boundary is written into its template.
- **Re-run with the same brief and no previous scores.** A critic shown the old number anchors to
  it, and one run is one sample: ±1 in a single area is noise. Judge by the overall and by which
  faults went away. Re-render and re-run 5a before re-dispatching.
- **Why it earns its cost:** in testing it scored a skills map 5/10 twice — first for having no
  claim and three disconnected islands, then, after a rebuild, for a 4.3:1 strip that read at
  about 7 px in a note pane. No machine check here could see either fault.

Skip it for a throwaway probe, or when the user wants only the source.
