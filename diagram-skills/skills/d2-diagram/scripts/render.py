#!/usr/bin/env python3
"""Compile a .d2 script to SVG (or another format) and report the result honestly.

Why this exists rather than calling `d2` inline:

1.  d2's own man page warns "Never use the presence of the output file to check for
    success.  Always use the exit status of d2." It is easy to lose that exit status --
    piping d2 into `head` or `tail` makes `$?` the pager's status, not d2's. This script
    captures the real returncode and nothing else decides success.
2.  `d2 validate` only parses. It exits 0 on semantically broken input such as
    `a.shape: bogus`. The compile is the only real gate, so that is what runs here.
3.  Multi-board diagrams (layers / scenarios / steps) do NOT write the single file you
    asked for -- d2 writes a *directory* of boards instead. Callers that assume a lone
    .svg silently report a path that does not exist. This script detects that and reports
    what was actually written.
4.  The d2 binary is not always on PATH in every shell on every machine, so it is looked
    up in the usual install locations too.

Usage:
    python render.py INPUT.d2 [-o OUT] [--layout dagre|elk] [--theme N] [--dark-theme N]
                              [--sketch] [--pad N] [--center] [--scale F]
                              [--animate-interval MS] [--] [extra d2 flags...]

Exit code is 0 only when d2 itself succeeded.
"""

from __future__ import annotations

import argparse
import os
import re
import shutil
import subprocess
import sys
from pathlib import Path

# Locations to try when `d2` is not on PATH. Covers the portable tarball install
# (~/.local/bin), the Windows MSI, Homebrew, and `go install`.
FALLBACK_BINARIES = [
    Path.home() / ".local" / "bin" / "d2.exe",
    Path.home() / ".local" / "bin" / "d2",
    Path("C:/Program Files/D2/bin/d2.exe"),
    Path.home() / "go" / "bin" / "d2.exe",
    Path.home() / "go" / "bin" / "d2",
    Path("/opt/homebrew/bin/d2"),
    Path("/usr/local/bin/d2"),
]


def find_d2() -> str:
    found = shutil.which("d2")
    if found:
        return found
    for candidate in FALLBACK_BINARIES:
        if candidate.is_file():
            return str(candidate)
    sys.exit(
        "d2 not found. Install it, then re-run:\n"
        "  macOS/Linux : curl -fsSL https://d2lang.com/install.sh | sh -s --\n"
        "  Windows     : download d2-vX.Y.Z-windows-amd64.tar.gz from\n"
        "                https://github.com/d2lang/d2/releases and put bin/d2.exe on PATH"
    )


def main() -> int:
    p = argparse.ArgumentParser(add_help=True)
    p.add_argument("input", help="path to the .d2 source file")
    p.add_argument("-o", "--out", help="output path (default: INPUT with .svg extension)")
    p.add_argument("--layout", choices=["dagre", "elk", "tala"])
    p.add_argument("--theme")
    p.add_argument("--dark-theme")
    p.add_argument("--sketch", action="store_true")
    p.add_argument("--pad")
    p.add_argument("--center", action="store_true")
    p.add_argument("--scale")
    p.add_argument("--animate-interval")
    p.add_argument(
        "--ascii-preview", action="store_true",
        help="also render an ASCII (.txt) copy and print it. Only shows topology -- it "
             "cannot show icons, markdown blocks or overlap. Rasterize and LOOK at the "
             "render for anything visual (see scripts/rasterize.py)",
    )
    p.add_argument(
        "--check", action="store_true",
        help="decode the shape and connection IDs back out of the rendered SVG and print "
             "an inventory. Catches phantom nodes -- a mistyped label or a renamed "
             "reference silently CREATES a shape, and d2 still exits 0",
    )
    p.add_argument("--expect-shapes", type=int,
                   help="fail if --check finds a different number of shapes")
    p.add_argument("--expect-edges", type=int,
                   help="fail if --check finds a different number of connections")
    p.add_argument(
        "--compare-layouts", action="store_true",
        help="render with dagre and elk, keep both as <out>.dagre/.elk .svg and .png beside "
             "the output, and report their sizes. It does not pick one: aspect ratio chose "
             "the worse layout on both diagrams it was tried on. Open both and choose by eye",
    )
    # parse_known_args rather than an argparse.REMAINDER catch-all: REMAINDER swallows
    # everything after the first positional, so `render.py in.d2 -o out.svg` would send
    # `-o out.svg` to d2 instead of honouring it here.
    args, extra = p.parse_known_args()

    src = Path(args.input)
    if not src.is_file():
        sys.exit(f"input not found: {src}")

    out = Path(args.out) if args.out else src.with_suffix(".svg")
    out.parent.mkdir(parents=True, exist_ok=True)

    d2 = find_d2()
    cmd: list[str] = [d2]
    if args.layout:
        cmd += [f"--layout={args.layout}"]
    if args.theme:
        cmd += [f"--theme={args.theme}"]
    if args.dark_theme:
        cmd += [f"--dark-theme={args.dark_theme}"]
    if args.sketch:
        cmd += ["--sketch"]
    if args.pad:
        cmd += [f"--pad={args.pad}"]
    if args.center:
        cmd += ["--center"]
    if args.scale:
        cmd += [f"--scale={args.scale}"]
    if args.animate_interval:
        cmd += [f"--animate-interval={args.animate_interval}"]
    cmd += [a for a in extra if a != "--"]

    # RELATIVE IMPORTS RESOLVE AGAINST THE WORKING DIRECTORY, not the importing file.
    #
    # A file containing `...@_classes` compiles when you are cd'd into its folder and
    # fails from anywhere else with:
    #     failed to import "_classes.d2": open _classes.d2: The system cannot find the
    #     file specified
    #
    # An earlier version of this comment claimed forward slashes fixed it. They do not --
    # isolated by test on Windows with and without spaces in the path, all four
    # combinations of slash direction and spaces FAIL from a foreign cwd and SUCCEED from
    # the file's own directory. The only reliable fix is to run d2 from there, so that is
    # what happens here: cwd is the source's folder and the source is passed by bare name.
    # Output is made absolute first, or it would land next to the source instead.
    src_arg = src.name
    out_abs = out if out.is_absolute() else (Path.cwd() / out)
    out_arg = out_abs.as_posix()
    cmd += [src_arg, out_arg]

    proc = subprocess.run(cmd, capture_output=True, text=True, errors="replace",
                          cwd=str(src.parent) if str(src.parent) else None)
    stderr = (proc.stderr or "").strip()
    stdout = (proc.stdout or "").strip()

    # The exit status is the ONLY authority on success -- see module docstring.
    if proc.returncode != 0:
        print(f"RENDER FAILED (d2 exit {proc.returncode})")
        print(f"cmd: {' '.join(cmd)}")
        if stderr:
            print("--- d2 stderr ---")
            print(stderr)
        if stdout:
            print("--- d2 stdout ---")
            print(stdout)
        return proc.returncode

    # Multi-board sources write a directory of boards, not the single file requested.
    board_dir = out.with_suffix("")
    if not out.exists() and board_dir.is_dir():
        boards = sorted(
            str(f.relative_to(board_dir)) for f in board_dir.rglob("*") if f.is_file()
        )
        print("RENDER OK (multi-board)")
        print(f"source : {src}")
        print(f"output : {board_dir}{os.sep}  (directory, {len(boards)} boards)")
        for b in boards:
            print(f"  - {board_dir / b}")
        print(
            "note   : this diagram uses layers/scenarios/steps, so d2 wrote a board "
            "directory instead of one file. For a single animated SVG, re-run with "
            "--animate-interval=1200."
        )
        if args.compare_layouts:
            # Each engine would write a folder of boards, and two folders cannot be laid side
            # by side. This used to return without a word (2026-10-18), so say how to compare.
            targets = sorted({board_target(b) for b in boards if b.endswith(".svg")})
            print("--- layout comparison ---")
            print("  not run: a multi-board diagram writes a folder per engine. Compare one board:")
            print("  re-run with --target=<board>. Boards here: "
                  + ", ".join("'' (the root board)" if t == "" else t for t in targets))
        return 0

    if not out.exists():
        print(f"RENDER REPORTED SUCCESS BUT NO OUTPUT AT {out}")
        if stderr:
            print(stderr)
        return 1

    size = out.stat().st_size
    print("RENDER OK")
    print(f"source : {src}")
    print(f"output : {out}  ({size:,} bytes)")

    dims = svg_dimensions(out)
    if dims:
        w, h = dims
        print(f"canvas : {w} x {h} px")
        # A very lopsided canvas usually means the diagram wants a different `direction`
        # or a different layout engine -- worth flagging rather than silently shipping.
        if w and h:
            ratio = max(w, h) / min(w, h)
            if ratio > 6:
                longer = "wide" if w > h else "tall"
                print(
                    f"warn   : aspect ratio {ratio:.1f}:1 -- unusually {longer}. "
                    "Consider changing `direction`, grouping shapes into containers, "
                    "or switching layout engine."
                )

    # d2 writes its own "success: ..." line to stderr; only genuine warnings (an icon it
    # could not fetch, say) are worth surfacing.
    notices = [ln for ln in stderr.splitlines() if not ln.startswith("success:")]
    if notices:
        print("--- d2 notices ---")
        print("\n".join(notices))

    if args.ascii_preview:
        txt = out.with_suffix(".txt")
        # ASCII rendering requires ELK; d2 falls back to it silently, but being explicit
        # keeps the preview consistent with what is printed.
        acmd = [d2, "--layout=elk", src_arg, txt.as_posix()]
        aproc = subprocess.run(acmd, capture_output=True, text=True, errors="replace")
        if aproc.returncode == 0 and txt.exists():
            body = txt.read_text(encoding="utf-8", errors="replace")
            print(f"--- ascii preview ({txt}) ---")
            print(body if len(body) <= 6000 else body[:6000] + "\n... [truncated]")
        else:
            print(f"ascii preview unavailable: {(aproc.stderr or '').strip()}")

    if args.compare_layouts:
        # everything except the layout flag, which compare_layouts sets itself
        passthrough = [c for c in cmd[1:-2] if not c.startswith("--layout")]
        compare_layouts(d2, src, passthrough, out_abs)

    if args.check or args.expect_shapes is not None or args.expect_edges is not None:
        if not run_check(out, args.expect_shapes, args.expect_edges):
            return 1

    return 0


def decode_id(token: str) -> str | None:
    """Return the d2 object ID a CSS class token encodes, but only if it really is base64.

    Round-tripping is the discriminator: any D2 `class:` name the user applied also
    appears in this attribute and would otherwise decode to plausible-looking junk.

    d2 0.7.1 uses the URL-safe alphabet (`-` and `_`) and HTML-escapes the ID before
    encoding it. The standard alphabet alone silently skipped any ID whose encoding holds
    `-` or `_`: the cloud-merge note `pr."Not happy? ..."` vanished from the inventory, which
    counted 11 shapes for 12 (found 2026-10-19). The ID comes back unescaped, so `&#34;`
    reads `"`.
    """
    import base64
    import html

    if not re.fullmatch(r"[A-Za-z0-9+/=_-]+", token):
        return None
    url_safe = "+" not in token and "/" not in token
    if not url_safe and ("-" in token or "_" in token):  # one token, two alphabets: not base64
        return None
    try:
        raw = (base64.urlsafe_b64decode if url_safe else base64.b64decode)(token + "=" * (-len(token) % 4))
        dec = raw.decode("utf-8")
    except Exception:
        return None
    if not dec.isprintable() or not dec:
        return None
    again = (base64.urlsafe_b64encode if url_safe else base64.b64encode)(raw).decode("ascii")
    if again.rstrip("=") != token.rstrip("="):
        return None
    return html.unescape(dec)


def svg_inventory(path: Path) -> tuple[list[str], list[str]]:
    """Recover the shape and connection IDs from a rendered SVG.

    d2 writes every element's ID into its CSS class as base64 (documented under
    "Technical details on SVG exports"), so the rendered file can be read back as an
    inventory of what was actually drawn -- which is the only way to catch a phantom
    node. Connections encode as `(src -> dst)[n]`; everything else is a shape.
    """
    try:
        svg = path.read_text(encoding="utf-8", errors="replace")
    except OSError:
        return [], []

    decode = decode_id
    shapes: list[str] = []
    conns: list[str] = []
    # A classed element carries BOTH its base64 id and the user's class names, space
    # separated -- e.g. class="Y2xpZW50cw== tier". Split before decoding, or every shape
    # that uses `class:` is silently skipped and the counts come out far too low.
    for m in re.finditer(r'<g class="([^"]+)"', svg):
        for token in m.group(1).split():
            if token == "shape":
                continue
            dec = decode(token)
            if dec is None:
                continue
            (conns if re.search(r"\[\d+\]$", dec) else shapes).append(dec)
            break
    return shapes, conns


def sequence_notes(shapes: list[str], conns: list[str]) -> set[str]:
    """Shapes that are sequence-diagram notes: `actor."text"` on an actor that has a lifeline.

    A note's ID is its text, so it reads like prose by design. Flagging them made `--check`
    exit 1 on a correct diagram (cloud-session-merge, 2026-10-19). Only sequence diagrams
    have lifelines -- `(actor -- )[0]` -- so a quoted prose child anywhere else is still
    flagged.
    """
    actors = set()
    for c in conns:
        m = re.match(r"^(?:(.*)\.)?\((.+?) -- \)\[\d+\]$", c)
        if m:
            actors.add(f"{m.group(1)}.{m.group(2)}" if m.group(1) else m.group(2))
    notes = set()
    for s in shapes:
        if not s.endswith('"'):
            continue
        quote, cut = None, -1  # the last dot outside quotes separates the parent from the note
        for i, ch in enumerate(s):
            if quote:
                if ch == quote and s[i - 1] != "\\":
                    quote = None
            elif ch in "\"'":
                quote = ch
            elif ch == ".":
                cut = i
        if cut > 0 and s[:cut] in actors:
            notes.add(s)
    return notes


def run_check(out: Path, expect_shapes: int | None, expect_edges: int | None) -> bool:
    """Print the inventory and flag anything that smells like an accident."""
    shapes, conns = svg_inventory(out)
    print(f"--- check: {len(shapes)} shapes, {len(conns)} connections ---")
    for s in sorted(shapes):
        print(f"  shape  {s}")

    ok = True

    # A label that got parsed as a key is the classic phantom: it keeps the prose.
    # Tuned against real cases -- "admin-panel slot exposed for future 3-tier" and
    # "not called in current build" must fire, while legitimate prose keys such as
    # "Write Replica Canada" (20 chars, 2 spaces) must not.
    notes = sequence_notes(shapes, conns)
    suspicious = [s for s in shapes if s not in notes
                  and (re.search(r":\s", s) or "  " in s or (len(s) > 25 and s.count(" ") >= 4))]
    if suspicious:
        ok = False
        print("warn   : these IDs read like prose, not keys -- a label probably got")
        print("         parsed as a new shape (check for a literal newline in a label):")
        for s in suspicious:
            print(f"           {s}")

    endpoints = set()
    for c in conns:
        m = re.match(r"\((.+?) -> (.+?)\)\[\d+\]$", c)
        if m:
            endpoints.update(m.groups())
    orphans = [s for s in shapes
               if s not in endpoints
               and not any(e.startswith(s + ".") for e in endpoints)
               and "." not in s]
    if orphans:
        # Titles and legends are legitimately unconnected, so this is a nudge not a fault.
        print(f"note   : unconnected shapes (fine for titles/notes): {', '.join(sorted(orphans))}")

    if expect_shapes is not None and len(shapes) != expect_shapes:
        ok = False
        print(f"FAIL   : expected {expect_shapes} shapes, found {len(shapes)}")
    if expect_edges is not None and len(conns) != expect_edges:
        ok = False
        print(f"FAIL   : expected {expect_edges} connections, found {len(conns)}")
    return ok


def compare_layouts(d2: str, src: Path, base_flags: list[str], out: Path) -> None:
    """Render under both bundled engines, keep both candidates, and pick neither.

    Neither engine is reliably better, and no number tells them apart. This used to
    recommend the less lopsided canvas, and on 2026-10-17 that pointed at the WORSE layout
    on both diagrams it was tried on: a skills map (dagre 2.9:1 recommended, ELK read
    better) and a Bitly architecture (ELK 2.6:1 recommended, it sent the redirect round
    the whole canvas; dagre drew a clean round trip). So the candidates are written next
    to the output, rasterized, and the choice is left to someone looking at them.

    d2 runs from the source's own folder for the same reason as the main render: relative
    imports resolve against the working directory.
    """
    print("--- layout comparison ---")
    made = []
    for engine in ("dagre", "elk"):
        probe = out.with_name(f"{out.stem}.{engine}.svg")
        cmd = [d2, f"--layout={engine}", *base_flags, src.name, probe.as_posix()]
        proc = subprocess.run(cmd, capture_output=True, text=True, errors="replace",
                              cwd=str(src.parent) if str(src.parent) else None)
        if proc.returncode != 0 or not probe.is_file():
            print(f"  {engine:6s} failed (a multi-board diagram writes a folder; compare one board)")
            continue
        dims = svg_dimensions(probe)
        if dims and min(dims):
            w, h = dims
            print(f"  {engine:6s} {int(w):5d} x {int(h):5d}   ratio {max(w, h) / min(w, h):.1f}:1")
        made.append(probe)
    if not made:
        return
    raster = Path(__file__).resolve().parent / "rasterize.py"
    rproc = subprocess.run([sys.executable, str(raster), *[p.as_posix() for p in made], "--scale", "1"],
                           capture_output=True, text=True, errors="replace")
    pngs = [p.with_suffix(".png") for p in made if p.with_suffix(".png").is_file()]
    if len(pngs) == 2 and pngs[0].read_bytes() == pngs[1].read_bytes():
        # sequence_diagram and grid place their own shapes, so both engines draw the same
        # picture, and "OPEN BOTH" sent the reader to compare two copies of it (2026-10-18).
        # Identical bytes is a fact, not a judgement, so this still picks nothing.
        print(f"  layout has no effect on {layout_kind(src)}: the two PNGs are byte-identical, so there")
        print("  is nothing to choose. Keep the default. The render:")
        print(f"    {pngs[0]}")
        return
    print("  Aspect ratio does not pick the better layout -- it chose the worse one on both")
    print("  diagrams it was tried on. OPEN BOTH and choose by eye, then pin the winner with")
    print("  `layout-engine` in d2-config:")
    for p in (pngs if pngs else made):
        print(f"    {p}")
    if not pngs:
        print("  (no PNGs: rasterize.py failed, so open the SVGs)")
        if rproc.stdout.strip() or rproc.stderr.strip():
            print("  " + (rproc.stdout + rproc.stderr).strip().splitlines()[-1])


def layout_kind(src: Path) -> str:
    """Name the genre for the 'no effect' message: the two that place their own shapes, else generic."""
    text = src.read_text(encoding="utf-8", errors="replace")
    if re.search(r"shape\s*:\s*sequence_diagram\b", text):
        return "sequence_diagram"
    if re.search(r"\bgrid-(?:rows|columns)\s*:", text):
        return "grid"
    return "this diagram"


def board_target(rel: str) -> str:
    """The --target value for a board file in a multi-board output folder.

    `index.svg` is the root board (''); `queue_down.svg` is `queue_down`; a nested
    `layers/x/index.svg` is `layers.x`. Verified 2026-10-18: --target accepts both
    `queue_down` and `scenarios.queue_down` for a board of a one-keyword file.
    """
    parts = list(Path(rel).with_suffix("").parts)
    if parts and parts[-1] == "index":
        parts = parts[:-1]
    return ".".join(parts)


def svg_dimensions(path: Path) -> tuple[float, float] | None:
    """Pull width/height out of the SVG root tag without a full XML parse."""
    import re

    try:
        head = path.read_text(encoding="utf-8", errors="replace")[:2000]
    except OSError:
        return None
    w = re.search(r'\bwidth="([\d.]+)', head)
    h = re.search(r'\bheight="([\d.]+)', head)
    if w and h:
        return float(w.group(1)), float(h.group(1))
    return None


if __name__ == "__main__":
    sys.exit(main())
