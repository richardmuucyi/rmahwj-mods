#!/usr/bin/env python3
"""Prove criteria 9 and 11 still catch what they exist for -- and stay quiet otherwise.

A legend is the one part of a diagram that can be WRONG while everything else is
right: it compiles, the geometry is clean, the inventory matches, and the key still
advertises an encoding the body never uses. Nothing else in this skill can see that.

The failure has a specific cause, and the fixtures reproduce it: a legend copied
between diagrams that share a palette file. The classes travel with the import; the
usage does not. It was found the hard way -- flagged by a reviewer, fixed, then
reintroduced in the same session by pasting one legend into six diagrams.

Four fixtures with known verdicts:

    legend-honest         must PASS   rows and usage agree exactly
    legend-claims-unused  must FAIL   a row for a class the body never uses
    legend-missing-row    must FAIL   a class used with nothing decoding it
    no-legend             must SKIP   no legend at all -- must not invent a complaint

`no-legend` is not padding. A check that fires on every diagram without a key is a
check people mute, which is how criterion 4 nearly ended up condemning every
sequence diagram in the corpus.

Criterion 11 (container labels quieter than their nodes) has five more, added 2026-10-18
when the genre gallery showed d2's 28px container default on three of seven genres:

    hierarchy-inverted          must WARN  a 28px container label over 16px nodes
    hierarchy-zoned             must PASS  the same with the zone class: the named fix clears it
    hierarchy-wrapper-key       must WARN  a sequence_diagram wrapper showing its bare key "seq"
    hierarchy-wrapper-labelled  must PASS  the same wrapper with a real label, which is a title
    hierarchy-grid-blank        must PASS  a grid wrapper labelled "", which draws no label

`no-legend` has no container, so criterion 11 must SKIP there. In expect.json a bare
verdict means criterion 9; a map names the criteria, e.g. {"9": "SKIP", "11": "SKIP"}.

Usage:
    python tests/eval_quality.py
    python tests/eval_quality.py --verbose

Exit 0 only when every fixture produced exactly its expected verdict.
"""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
FIXTURES = HERE / "quality"
QUALITY = HERE.parent / "scripts" / "quality.py"


def verdict_for(src: Path, n: int = 9):
    """Criterion n's verdict for one fixture, or None if it could not be read."""
    proc = subprocess.run([sys.executable, str(QUALITY), src.name, "--json"],
                          capture_output=True, text=True, cwd=str(FIXTURES))
    try:
        report = json.loads(proc.stdout)
    except json.JSONDecodeError:
        return None, (proc.stdout + proc.stderr).strip()[:200]
    checks = report[0]["checks"] if isinstance(report, list) else report["checks"]
    for c in checks:
        if c["n"] == n:
            return c["verdict"], c["detail"]
    return None, "criterion %d absent from the report" % n


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--verbose", action="store_true")
    args = ap.parse_args()

    expect = json.loads((FIXTURES / "expect.json").read_text(encoding="utf-8"))
    bad = 0
    for name, wants in sorted(expect.items()):
        if isinstance(wants, str):
            wants = {"9": wants}
        for n, want in sorted(wants.items(), key=lambda kv: int(kv[0])):
            got, detail = verdict_for(FIXTURES / (name + ".d2"), int(n))
            ok = got == want
            if not ok:
                bad += 1
            print("%-5s %-28s c%-3s expected=%-5s got=%s" % ("OK" if ok else "WRONG", name, n, want, got))
            if args.verbose or not ok:
                print("        %s" % detail)

    print()
    if bad:
        print("%d fixture verdict(s) behaved unexpectedly -- a criterion has stopped checking" % bad)
        return 1
    print("all legend-honesty and label-hierarchy controls behaved as expected")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
