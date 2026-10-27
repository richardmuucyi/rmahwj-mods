#!/usr/bin/env python3
"""Prove render.py --compare-layouts tells the truth about what the layout engine changes.

--compare-layouts renders under dagre and ELK, keeps both and picks neither. On 2026-10-18 a
render of every genre showed two ways it misled:

  * sequence_diagram and grid came out pixel-identical under both engines (those genres
    place their own shapes), and the helper still said "OPEN BOTH", sending the reader to
    compare two copies of one picture;
  * a multi-board source (layers / scenarios / steps) printed no comparison at all, because
    render.py returned before reaching it, and nothing said to compare one board.

Five cases, each with a known outcome, on the genre gallery in tests/all-types/:

    01-plain                      must say OPEN BOTH and not "no effect"   the control: ELK moves it
    02-sequence                   must say "layout has no effect on sequence_diagram"
    05-grid                       must say "layout has no effect on grid"
    07-scenarios                  must say to compare one board with --target, naming queue_down
    07-scenarios --target=''      must write both candidates for the root board

01-plain is the negative control. A helper that printed "no effect" for everything would
pass the two middle cases and still be wrong.

Usage:
    python tests/eval_layouts.py
    python tests/eval_layouts.py --verbose

Exit 0 only when every case produced exactly its expected outcome.
"""

from __future__ import annotations

import argparse
import shutil
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
CORPUS = HERE / "all-types"
OUT = HERE / "_out" / "layouts"
RENDER = HERE.parent / "scripts" / "render.py"

# (case label, source stem, extra flags, phrases that must appear, phrases that must not)
CASES = [
    ("01-plain", "01-plain", [], ["open both"], ["no effect"]),
    ("02-sequence", "02-sequence", [], ["layout has no effect on sequence_diagram"], ["open both"]),
    ("05-grid", "05-grid", [], ["layout has no effect on grid"], ["open both"]),
    ("07-scenarios", "07-scenarios", [], ["--target", "queue_down"], ["open both"]),
    ("07-scenarios --target=''", "07-scenarios", ["--target="], [], []),
]


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--verbose", action="store_true")
    args = ap.parse_args()
    shutil.rmtree(OUT, ignore_errors=True)
    bad = 0
    for label, stem, flags, must, must_not in CASES:
        case_dir = OUT / label.replace(" ", "_").replace("=", "-").replace("'", "")
        case_dir.mkdir(parents=True, exist_ok=True)
        out = case_dir / f"{stem}.svg"
        proc = subprocess.run([sys.executable, str(RENDER), str(CORPUS / f"{stem}.d2"), "-o", str(out),
                               "--compare-layouts", *flags], capture_output=True, text=True, errors="replace")
        text = (proc.stdout + proc.stderr).lower()
        problems = [f"exit {proc.returncode}"] if proc.returncode != 0 else []
        problems += [f"missing {p!r}" for p in must if p.lower() not in text]
        problems += [f"says {p!r}" for p in must_not if p.lower() in text]
        if flags:
            problems += [f"no {e} candidate" for e in ("dagre", "elk")
                         if not (case_dir / f"{stem}.{e}.png").is_file()]
        bad += bool(problems)
        print("%-5s %-28s %s" % ("WRONG" if problems else "OK", label, "; ".join(problems)))
        if args.verbose or problems:
            section = text[text.find("--- layout comparison"):] if "--- layout comparison" in text else text
            print("        " + section.strip().replace("\n", "\n        "))
    print()
    if bad:
        print("%d case(s) behaved unexpectedly -- --compare-layouts misleads" % bad)
        return 1
    print("--compare-layouts said 'no effect' only where the engine changed nothing, and said how to compare one board")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
