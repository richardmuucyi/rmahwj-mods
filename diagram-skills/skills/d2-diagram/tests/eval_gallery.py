#!/usr/bin/env python3
"""Prove scripts/gallery.py renders every genre in light and dark, and catches what it should.

tests/all-types/ holds one small diagram per genre the skill proposes: plain, sequence,
ERD, class, grid, C4-style containers and scenarios. On 2026-10-18 the Mermaid half of this
work found a theme that broke nine of twenty-two diagram types while every flowchart looked
fine, because flowcharts were the only type anyone looked at. This layer keeps the D2 genres
rendering in both colour sets; looking at the contact sheets it writes stays the agent's job.

Two runs with known outcomes:

    shipped corpus   must exit 0, draw EXPECTED_BOARDS boards, and give every board a light
                     PNG with a light corner and a dark PNG with a dark corner
    control corpus   must exit 1 and name both planted faults:
                       light-only  a copy of 01-plain with no dark theme, so its "dark" PNG
                                   is light -- the corner check has to say so
                       broken      `a.shape: bogus_shape`, which `d2 validate` passes and the
                                   render refuses -- the render check has to say so

The control is the point. A gallery that printed "all good" for everything would pass the
first run; only the second shows its checks can fail.

The corners are judged here, from the PNGs, not taken from the gallery's own report, so a
gallery that checked nothing and printed nothing wrong still fails the first run.

Usage:
    python tests/eval_gallery.py
    python tests/eval_gallery.py --verbose

Exit 0 only when both runs behaved exactly as expected.
"""

from __future__ import annotations

import argparse
import re
import shutil
import subprocess
import sys
from pathlib import Path

from PIL import Image

HERE = Path(__file__).resolve().parent
CORPUS = HERE / "all-types"
OUT = HERE / "_out" / "gallery"
SCRIPT = HERE.parent / "scripts" / "gallery.py"

# Seven sources; 07-scenarios draws two boards (the base and queue_down). A declared
# count, not a glob: a board that silently stops rendering must fail here.
EXPECTED_BOARDS = 8


def corner(png: Path) -> str:
    """LIGHT or DARK from a canvas-corner pixel; BLANK when nothing was drawn."""
    img = Image.open(png).convert("RGB")
    lo, hi = img.convert("L").getextrema()
    if hi - lo < 60:
        return "BLANK"
    r, g, b = img.getpixel((2, 2))
    return "LIGHT" if 0.299 * r + 0.587 * g + 0.114 * b > 128 else "DARK"


def run(corpus: Path, out: Path) -> subprocess.CompletedProcess:
    shutil.rmtree(out, ignore_errors=True)
    return subprocess.run([sys.executable, str(SCRIPT), "--corpus", str(corpus), "--out", str(out)],
                          capture_output=True, text=True, errors="replace")


def shipped(verbose: bool) -> int:
    out = OUT / "shipped"
    proc = run(CORPUS, out)
    bad = 0
    if verbose or proc.returncode != 0:
        print("        " + (proc.stdout + proc.stderr).strip().replace("\n", "\n        "))
    if proc.returncode != 0:
        print("WRONG shipped corpus: gallery exited %d, expected 0" % proc.returncode)
        bad += 1
    lights = sorted((out / "light").rglob("*.png"))
    if len(lights) != EXPECTED_BOARDS:
        print("WRONG shipped corpus: %d light boards, expected %d" % (len(lights), EXPECTED_BOARDS))
        bad += 1
    for light in lights:
        dark = out / "dark" / light.relative_to(out / "light")
        name = str(light.relative_to(out / "light").with_suffix("")).replace("\\", "/")
        got = (corner(light), corner(dark) if dark.is_file() else "NO PNG")
        ok = got == ("LIGHT", "DARK")
        bad += not ok
        print("%-5s %-28s light=%-5s dark=%s" % ("OK" if ok else "WRONG", name, *got))
    sheets = sorted((out / "sheets").glob("gallery-*.png"))
    if not sheets:
        print("WRONG shipped corpus: no contact sheets written")
        bad += 1
    if "open every sheet" not in proc.stdout.lower():
        print("WRONG shipped corpus: the report does not tell the reader to open the sheets")
        bad += 1
    return bad


def control(verbose: bool) -> int:
    src = OUT / "control-src"
    shutil.rmtree(src, ignore_errors=True)  # best effort: a process holding it as cwd keeps the folder
    src.mkdir(parents=True, exist_ok=True)
    for stale in src.glob("*.d2"):
        stale.unlink()
    plain = (CORPUS / "01-plain.d2").read_text(encoding="utf-8")
    light_only = re.sub(r"dark-theme-id:\s*\d+;?\s*", "", plain)
    assert light_only != plain, "01-plain.d2 no longer sets a dark theme; rebuild the control"
    (src / "light-only.d2").write_text(light_only, encoding="utf-8")
    shutil.copy(CORPUS / "actor-outline.svg", src)  # 01-plain's icon; without it the render fails first
    (src / "broken.d2").write_text("a.shape: bogus_shape\n", encoding="utf-8")
    proc = run(src, OUT / "control")
    text = proc.stdout + proc.stderr
    if verbose:
        print("        " + text.strip().replace("\n", "\n        "))
    bad = 0
    for want, label in ((proc.returncode == 1, "exits 1"),
                        (re.search(r"FAIL\s+light-only\b.*dark", text) is not None, "names light-only's dark PNG"),
                        (re.search(r"FAIL\s+broken\b", text) is not None, "names the broken source")):
        bad += not want
        print("%-5s control: %s" % ("OK" if want else "WRONG", label))
    if bad and not verbose:
        print("        " + text.strip().replace("\n", "\n        "))
    return bad


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--verbose", action="store_true")
    args = ap.parse_args()
    if not SCRIPT.is_file():
        print("WRONG scripts/gallery.py does not exist")
        return 1
    bad = shipped(args.verbose) + control(args.verbose)
    print()
    if bad:
        print("%d check(s) behaved unexpectedly -- the gallery cannot be trusted" % bad)
        return 1
    print("every genre rendered in both colour sets, and both planted faults were caught")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
