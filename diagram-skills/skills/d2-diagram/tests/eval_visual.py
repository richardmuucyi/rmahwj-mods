#!/usr/bin/env python3
"""Prove the visual reviewer still sees -- and still stays quiet when nothing is wrong.

`visual_review.py` measures geometry in a real browser. Geometry checks rot silently:
a selector stops matching, a tolerance drifts, an upstream renderer changes, and the
reviewer keeps printing "no geometric defects found" forever. That is strictly worse
than having no reviewer, because it reads as a clean bill of health.

So this corpus is three fixtures with known verdicts, each verified BY EYE when it was
written:

    clipped-heading   must raise markdown-clipped   (second line visibly sliced in half)
    icon-over-label   must raise icon-over-label    (icon visibly on top of the label)
    clean             must raise NOTHING            (guards against a trigger-happy probe)

The `clean` fixture is not padding. An earlier version of the probe treated stroke-only
connection paths as shape outlines and so reported every edge label as overflowing its
shape -- three false positives on a diagram with nothing wrong with it.

Usage:
    python tests/eval_visual.py
    python tests/eval_visual.py --verbose

Exit 0 only when every fixture produced exactly its expected verdict.
"""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
SKILL = HERE.parent
VISUAL = HERE / "visual"
WORK = HERE / "_out" / "_visual"


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--verbose", action="store_true")
    args = ap.parse_args()

    d2 = None
    sys.path.insert(0, str(SKILL / "scripts"))
    import render
    d2 = render.find_d2()

    expect = json.loads((VISUAL / "expect.json").read_text(encoding="utf-8"))
    WORK.mkdir(parents=True, exist_ok=True)

    ok = True
    for name, spec in expect.items():
        src = VISUAL / (name + ".d2")
        if not src.is_file():
            print("FAIL  " + name + " -- fixture missing")
            ok = False
            continue

        # Render into the fixture directory: `icon: ./github-mark.svg` is resolved
        # relative to the .d2 file, and posix paths avoid d2's Windows import bug.
        out = WORK / (name + ".svg")
        rc = subprocess.run([d2, src.as_posix(), out.as_posix()],
                            capture_output=True, text=True)
        if rc.returncode != 0:
            print("FAIL  " + name + " -- fixture did not compile: "
                  + (rc.stdout + rc.stderr).strip().splitlines()[0])
            ok = False
            continue

        proc = subprocess.run(
            [sys.executable, str(SKILL / "scripts" / "visual_review.py"),
             str(out), "--json", "--session", "d2evalvisual"],
            capture_output=True, text=True)
        try:
            report = json.loads(proc.stdout)
        except Exception:
            print("FAIL  " + name + " -- reviewer produced no report")
            if args.verbose:
                print("      " + (proc.stdout or proc.stderr)[:400])
            ok = False
            continue

        raised = sorted({f["check"] for f in report["findings"]})
        want = sorted(spec["must_raise"])
        missing = [c for c in want if c not in raised]
        # Only unexpected CRITICALs fail the clean fixture; a WARN is advisory.
        crit = sorted({f["check"] for f in report["findings"] if f["severity"] == "CRITICAL"})
        extra = [c for c in crit if c not in want]

        if missing or extra:
            ok = False
            print("FAIL  " + name)
            if missing:
                print("      did NOT raise " + str(missing) + " -- the check has stopped firing")
            if extra:
                print("      unexpectedly raised " + str(extra) + " -- false positive")
        else:
            print("OK    " + name + "  raised=" + (str(raised) if raised else "nothing"))
        if args.verbose:
            for f in report["findings"]:
                print("        [" + f["severity"] + "] " + f["check"] + ": " + f["detail"][:100])

    print("")
    print("all visual controls behaved as expected" if ok
          else "a visual control misbehaved -- the reviewer is not trustworthy until fixed")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
