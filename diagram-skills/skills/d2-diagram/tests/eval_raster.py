#!/usr/bin/env python3
"""Prove rasterize.py pins the colour set -- light by default -- and invents nothing.

A d2 SVG rendered with a dark theme carries BOTH colour sets: the light one as the
base, the dark one behind `@media (prefers-color-scheme:dark)`. A browser picks one
from the operating system, so on a machine in dark mode a "light" PNG came out dark,
and nothing in the output said so. rasterize.py now always pins the answer, light
unless `--color-scheme dark` is passed, so the OS setting never reaches the PNG.

Four cases with known outcomes, judged by the canvas corner pixel:

    dual-theme  (no flag)             must be LIGHT  the default; this failed on a dark-mode OS
    dual-theme  --color-scheme light  must be LIGHT  explicit light matches the default
    dual-theme  --color-scheme dark   must be DARK   the flag works in both directions
    light-only  --color-scheme dark   must be LIGHT  no dark set exists, so none is faked

`light-only` is the negative control. A flag that darkened every PNG it touched would
pass the first three cases and still be wrong. The source SVG must also come out of every
run byte-identical, because the rewrite belongs on a temporary copy, never the file the
user keeps.

Known limit: on a machine whose OS is in light mode, the no-flag case passes even if
the default regresses, because the browser would pick light anyway. So one more check
does not depend on the machine: pinning the dual-theme SVG must leave no
prefers-color-scheme query for any OS to answer.

Usage:
    python tests/eval_raster.py
    python tests/eval_raster.py --verbose

Exit 0 only when every case produced exactly its expected outcome.
"""

from __future__ import annotations

import argparse
import hashlib
import shutil
import subprocess
import sys
from pathlib import Path

from PIL import Image

HERE = Path(__file__).resolve().parent
FIXTURES = HERE / "raster"
OUT = HERE / "_out" / "raster"
SCRIPTS = HERE.parent / "scripts"

sys.path.insert(0, str(SCRIPTS))
from rasterize import SCHEME_QUERY, pin_scheme  # noqa: E402

# (fixture, --color-scheme value or None for the default, expected corner)
CASES = [
    ("dual-theme", None, "LIGHT"),
    ("dual-theme", "light", "LIGHT"),
    ("dual-theme", "dark", "DARK"),
    ("light-only", "dark", "LIGHT"),
]


def render(name: str) -> Path:
    svg = OUT / (name + ".svg")
    proc = subprocess.run([sys.executable, str(SCRIPTS / "render.py"),
                           str(FIXTURES / (name + ".d2")), "-o", str(svg)],
                          capture_output=True, text=True)
    if proc.returncode != 0 or not svg.is_file():
        sys.exit("could not render %s:\n%s" % (name, (proc.stdout + proc.stderr).strip()))
    return svg


def corner(png: Path) -> str:
    """LIGHT or DARK from the luma of a canvas-corner pixel; BLANK if nothing was drawn.

    The corner alone would pass an empty white page as LIGHT, so a picture whose
    brightest and darkest pixels sit close together counts as a failed render.
    """
    img = Image.open(png).convert("RGB")
    lo, hi = img.convert("L").getextrema()
    if hi - lo < 60:
        return "BLANK"
    r, g, b = img.getpixel((2, 2))
    luma = 0.299 * r + 0.587 * g + 0.114 * b
    return "LIGHT" if luma > 128 else "DARK"


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--verbose", action="store_true")
    args = ap.parse_args()

    shutil.rmtree(OUT, ignore_errors=True)
    OUT.mkdir(parents=True)
    svgs = {name: render(name) for name in {c[0] for c in CASES}}
    before = {n: hashlib.sha256(p.read_bytes()).hexdigest() for n, p in svgs.items()}

    bad = 0
    for name, scheme, want in CASES:
        label = "%s --color-scheme %s" % (name, scheme or "(default)")
        case_dir = OUT / ("%s-%s" % (name, scheme or "default"))
        cmd = [sys.executable, str(SCRIPTS / "rasterize.py"), str(svgs[name]),
               "--scale", "1", "--out-dir", str(case_dir)]
        if scheme:
            cmd += ["--color-scheme", scheme]
        proc = subprocess.run(cmd, capture_output=True, text=True)
        png = case_dir / (name + ".png")
        got = corner(png) if proc.returncode == 0 and png.is_file() else "NO PNG"
        ok = got == want
        bad += not ok
        print("%-5s %-34s expected=%-5s got=%s" % ("OK" if ok else "WRONG", label, want, got))
        if args.verbose or not ok:
            print("        %s" % (proc.stdout + proc.stderr).strip().replace("\n", "\n        "))

    text = svgs["dual-theme"].read_text(encoding="utf-8")
    pinned, n = pin_scheme(text, "light")
    left = len(SCHEME_QUERY.findall(pinned))
    ok = n > 0 and left == 0
    bad += not ok
    print("%-5s %-34s replaced=%d left=%d" % ("OK" if ok else "WRONG",
                                             "no query left for the OS", n, left))

    for name, svg in svgs.items():
        if hashlib.sha256(svg.read_bytes()).hexdigest() != before[name]:
            bad += 1
            print("WRONG %s.svg was modified -- the rewrite must go on a temporary copy" % name)
    leftovers = sorted(p.name for p in OUT.glob(".raster_*"))
    if leftovers:
        bad += 1
        print("WRONG temporary files left behind: %s" % ", ".join(leftovers))

    print()
    if bad:
        print("%d check(s) behaved unexpectedly -- the colour scheme is not pinned" % bad)
        return 1
    print("all colour-scheme controls behaved as expected")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
