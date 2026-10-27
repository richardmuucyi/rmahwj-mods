# D2 CLI, exports and troubleshooting

Reference for driving `d2` (tested with v0.9.0; most measurements first made on v0.7.1), plus the failure modes worth recognising on sight.

- [Invocation](#invocation)
- [Flags](#flags)
- [Subcommands](#subcommands)
- [Export formats](#export-formats)
- [Error taxonomy](#error-taxonomy)
- [Troubleshooting](#troubleshooting)
- [Install](#install)

---

## Invocation

```shell
d2 in.d2 out.svg     # explicit output
d2 in.d2             # writes in.svg
d2 - -               # read D2 from stdin, write SVG to stdout
```

**Trust the exit code, never the output file.** d2's own manual says so: on some errors it
still writes a partial render so you can keep iterating on a broken diagram. Exit 0 means
success; exit 1 means the diagram is wrong.

The corollary bites in practice: `d2 in.d2 out.svg | head` makes `$?` the exit status of
`head`, not of `d2`, so a failure reads as a success. Either do not pipe, or read
`${PIPESTATUS[0]}`. `scripts/render.py` exists partly so this cannot be got wrong.

---

## Flags

| Flag | Default | Notes |
|---|---|---|
| `-t, --theme` | `0` | theme ID; see `styling.md` for the list |
| `--dark-theme` | unset | theme used when the viewer's browser is in dark mode |
| `-l, --layout` | `dagre` | `dagre`, `elk`, or `tala` if separately installed |
| `-s, --sketch` | false | hand-drawn aesthetic |
| `--pad` | `100` | pixels around the diagram; raise it if you draw a `stroke` frame |
| `--center` | false | centre the SVG in its viewbox |
| `--scale` | `-1` | `-1` fits SVG to screen; `1` disables fitting; `0.5` halves |
| `--animate-interval` | `0` | ms per board — packs a multi-board diagram into one animated SVG/GIF |
| `--target` | all | board to render; `''` for root only, `'layers.x.*'` for a subtree |
| `-b, --bundle` | true | inline assets and layers into the SVG |
| `--no-xml-tag` | false | drop the `<?xml …?>` prolog — use when embedding SVG directly in HTML |
| `--force-appendix` | false | add the tooltip/link appendix to SVG as well as PNG |
| `--ascii-mode` | `extended` | `extended` (Unicode box-drawing) or `standard` (pure ASCII) |
| `--stdout-format` | — | `png`, `svg`, `ascii`; only when output is `-` |
| `--timeout` | `120` | seconds; raise for very large diagrams |
| `--salt` | — | suffix for SVG element IDs, so two diagrams on one HTML page do not collide |
| `--font-regular/-italic/-bold` | — | paths to `.ttf` files |
| `-w, --watch` | false | live-reload server; `--host`, `--port`, `--browser` go with it |
| `-d, --debug` | false | debug logs |

Nearly every flag has an environment-variable twin: `D2_THEME`, `D2_LAYOUT`, `D2_PAD`,
`D2_SKETCH`, `D2_DARK_THEME`, `D2_CENTER`, `D2_BUNDLE`, `D2_TIMEOUT`, and so on.

**Precedence: flags and environment variables beat `vars.d2-config` in the file.** If a
diagram renders with the wrong theme, check for a stray `D2_THEME` before editing the
source.

---

## Subcommands

| Command | Does |
|---|---|
| `d2 layout` | list available layout engines |
| `d2 layout elk` | long help for one engine, including its tuning options |
| `d2 themes` | list theme IDs and names |
| `d2 fmt file.d2` | rewrite the file in canonical form |
| `d2 validate file.d2` | **parse** check only — see the warning below |
| `d2 play file.d2` | open the file in the online playground |

### `d2 validate` is not a correctness check

Verified behaviour: `d2 validate` catches syntax errors (exit 1) but returns exit 0 and
prints `Success! … is valid D2.` for a file containing `a.shape: bogus_shape`, which fails
to compile. It checks that the text parses, not that the diagram means anything.

**Never use `validate` as the gate.** The compile is the gate.

---

## Export formats

| Format | Command | Status (measured on v0.7.1) |
|---|---|---|
| SVG | `d2 in.d2 out.svg` | works — the default and the intended deliverable |
| ASCII | `d2 in.d2 out.txt` | works; add `--ascii-mode standard` for pure ASCII |
| PNG | `d2 in.d2 out.png` | **broken** — see below |
| PDF | `d2 in.d2 out.pdf` | **broken** — same cause |
| PPTX | `d2 in.d2 out.pptx` | **broken** — same cause |
| GIF | `d2 in.d2 out.gif` | **broken** — same cause |

### Why PNG/PDF/PPTX/GIF failed on v0.7.1

Those formats work by having d2 download a Playwright driver, drive a headless Chromium
and screenshot the SVG. d2 v0.7.1 pins Playwright 1.47.2, and the CDN hosts it downloads
from have been retired — every mirror returns 404 *(verified: `playwright.azureedge.net`
and `playwright.download.prss.microsoft.com` both 404 for
`playwright-1.47.2-win32_x64.zip`)*. The failure is `err: failed to install Playwright`.
On v0.9.0 `d2 in.d2 out.png` produced a valid PNG in a quick test; `rasterize.py` still
works on both versions and controls the colour scheme, so it remains the default.

This is an upstream/CDN issue, not a broken install, and it does not affect SVG at all.

**Use `scripts/rasterize.py` for PNG.** It drives headless Chrome or Edge over the
rendered SVG:

```bash
python scripts/rasterize.py diagram.svg [more.svg ...] --scale 2
```

Options: `--scale` (pixel density; 2 for docs and slides), `--out-dir`,
`--background white|transparent`, and `--color-scheme light|dark` (which colour set a
dual-theme SVG shows; default light, and the OS setting is never used — see SKILL.md).
It sizes each SVG to its natural pixel dimensions in a
wrapper page first — otherwise the browser scales-to-fit and the image comes out soft or
cropped — and it confirms the PNG really appeared, because Chromium exits 0 on some
failures.

A headless browser is the *correct* converter rather than merely a convenient one: D2
embeds Markdown as HTML `<foreignObject>`, which only an HTML-capable renderer draws.
`rsvg-convert`, Inkscape and cairosvg drop those blocks without warning.

### ASCII notes

ASCII renders only under ELK or TALA; asking for dagre silently falls back to ELK. Keep
ASCII diagrams to plain boxes and arrows — shadows, `multiple`, `animated` and most shapes
have no ASCII equivalent, and unrepresentable shapes degrade to a corner glyph.

### Multi-board exports

A diagram using `layers`, `scenarios` or `steps` cannot be one image. `d2 in.d2 out.svg`
writes a **directory** `out/`, with internal links rewritten to the board paths.

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

Options:

- default — a browsable directory of linked SVGs
- `--animate-interval=1200` — one animated SVG cycling the boards
- `--target=''` — the root board only, as a single file
- PDF/PPTX would give one page per board, but are unavailable here

---

## Error taxonomy

d2 error messages are precise and carry `file:line:column`. Read the column number — it
usually points straight at the offending token.

| Message | Cause | Fix |
|---|---|---|
| `unknown shape "x"` | typo or invented shape name | check the catalog in `syntax.md` |
| `invalid style keyword: "x"` | not a real style key | check the table in `styling.md`; note `3d` is lowercase |
| `image shape must include an "icon" field` | `shape: image` with no icon | add `icon:` or use a different shape |
| `connection missing destination` | dangling `->` | complete or delete the connection |
| `invalid text beginning unquoted key` | reserved character in an unquoted string | wrap the value in quotes |
| `maps must be terminated with }` | unbalanced brace | run `d2 fmt` to locate it |
| `failed to install Playwright` | PNG/PDF/PPTX/GIF requested | export SVG instead — see above |

---

## Troubleshooting

**`failed to import "_classes.d2"` when the file is plainly there.**

**Relative imports resolve against the working directory, not the importing file.** A file
containing `...@_classes` compiles when you are cd'd into its folder and fails from
anywhere else.

An earlier version of this note claimed forward slashes fixed it. **That was wrong** --
re-isolated by test on Windows, with and without spaces in the path:

| invocation | result |
|---|---|
| forward slashes, foreign cwd | **FAIL** |
| backslashes, foreign cwd | **FAIL** |
| forward slashes, spaces in path, foreign cwd | **FAIL** |
| `cd` into the file's folder first | **OK** |

The only reliable fix is to run d2 from the source file's own directory.
`scripts/render.py` does this -- it sets the subprocess cwd to the source's folder, passes
the source by bare name, and makes the output path absolute so it does not land beside the
source. Call d2 directly and you must do the same.

The failure hides easily, because it works whenever you happen to be in the file's own
folder. It surfaces in batches, CI, and anything that renders a tree of diagrams.

**A label will not compile.** It contains reserved characters. Quote it:
`"x(int y)": "[]int"`.

**Non-ASCII text behaves strangely.** Full-width punctuation is not ASCII punctuation. The
CJK colon `：` is a different codepoint from `:` and will not register as a label
separator; the same goes for `；`, `。` and friends. In a Chinese or Japanese diagram, use
ASCII `:` `;` `.` for D2 syntax and reserve full-width forms for label text. This produces
a baffling "my label vanished" symptom rather than an error.

**Text renders too wide.** D2 does not wrap. Insert `\n` yourself.

**Connections look cluttered.** On a densely connected diagram with short labels, set
explicit `width`/`height` on the busy shapes — more perimeter gives the router more room.
Switching to `--layout=elk` for orthogonal routing usually helps too.

**A container-to-child connection does nothing.** Dagre does not support ancestor-to-
descendant connections. Use ELK or TALA.

**HTML inside a Markdown block breaks the diagram.** The SVG is XML, so the HTML must be
well-formed: `<br/>`, not `<br>`.

**Markdown does not render in some SVG viewers.** D2 implements Markdown with XHTML
`<foreignObject>`, so the viewer needs an HTML engine. Browsers are fine; Adobe
Illustrator and similar pure-SVG editors are not.

**An embedded SVG is not interactive.** Tooltips and links survive in inline `<svg>`,
`<object>`, `<iframe>` and `<embed>`. They are lost in `<img>` and CSS `background-image`,
which treat the file as a flat picture.

**Two diagrams on one HTML page conflict.** Their generated element IDs collide. Give each
a distinct `--salt`.

**An object cannot belong to two containers.** Not supported, by design — there is no Venn
overlap.

**Ports are not supported.** You cannot pin a connection to a named side of a shape.

---

## Install

d2 needs no browser and makes no network calls at render time, apart from an occasional
version check — and fetching any remote `icon:` URLs you use.

```shell
# macOS / Linux
curl -fsSL https://d2lang.com/install.sh | sh -s --

# Windows, portable, no admin rights
#   download d2-vX.Y.Z-windows-amd64.tar.gz from
#   https://github.com/d2lang/d2/releases
#   then put bin/d2.exe somewhere on PATH
```

A portable install usually lives at `~/.local/bin/d2` (`d2.exe` on Windows); run
`d2 --version` to see which version you have.

The Windows MSI via `winget install Terrastruct.D2` is the documented route but has been
observed to hang indefinitely; the portable tarball above is the reliable
path. `scripts/render.py` looks in `~/.local/bin`, `C:\Program Files\D2\bin`, `~/go/bin`,
`/opt/homebrew/bin` and `/usr/local/bin` when `d2` is not already on PATH.

**TALA is not bundled.** `d2 layout` reports only `dagre` and `elk`. TALA is proprietary
and installs separately, so treat TALA-only features — `near` an object, `top`/`left`
locking, per-container `direction` — as unavailable unless it has been installed.

## Raster output

On d2 v0.7.1, `d2 in.d2 out.png` fails, as do PDF, PPTX and GIF. They work by downloading a
Playwright driver, and v0.7.1 pins Playwright 1.47.2 whose download hosts have been
retired — every mirror returns 404 *(verified against two)*. Upstream CDN problem, not a
broken install. SVG is unaffected. On v0.9.0 a PNG export worked in a quick test, but
`rasterize.py` is still the default because it works on both and controls light/dark.

When someone asks for an image, a PNG, something to paste into a deck or a document,
render the SVG first and then rasterize it:

```bash
python scripts/render.py    diagram.d2 -o diagram.svg
python scripts/rasterize.py diagram.svg --scale 2
```

`rasterize.py` drives headless Chrome or Edge. It takes several SVGs at once, `--scale`
for pixel density (2 is the sensible default for docs and slides), `--out-dir`, and
`--background transparent`. It wraps each SVG at its natural pixel size before shooting so
the browser cannot scale-to-fit and hand you a soft or cropped image, and it verifies the
file actually appeared rather than trusting the browser's exit code.

**PNGs come out light by default, whatever the OS is set to.** An SVG rendered with a
dark theme carries both colour sets, and a browser picks one from the operating system.
On a machine set to dark mode, a PNG meant for a light document used to come
out dark, and nothing in the output said so. The script now always pins the choice on a
temporary copy: light unless you pass `--color-scheme dark`. The SVG you keep is
untouched. The flag picks between the sets an SVG carries and cannot invent one, so a
light-only SVG stays light under `--color-scheme dark` (the script prints a note).

**A headless browser is the correct converter, not a convenient one.** D2 embeds Markdown
as HTML `<foreignObject>`, which only an HTML-capable renderer draws. `rsvg-convert`,
Inkscape and cairosvg silently drop those blocks.

Keep the `.d2` when you deliver a PNG. The raster is the output; the source is what gets
edited next time, and the SVG in between regenerates in one command.

ASCII (`.txt`) also works, and is genuinely useful for terminals and plain-text docs.
