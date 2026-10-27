#!/usr/bin/env python3
"""Eval the diagram-type advisor against the corpus's own natural-language requests.

Each case ships a `request.md` written the way a person would actually ask, and an
`expect.json` that declares the type the answer should be. Those two files were written
for the render harness, which means this eval costs nothing extra and cannot be tuned to
flatter the classifier -- the expected answers predate it.

Scoring is deliberately three-valued:

    top      the proposal was right
    runner   the right answer was offered as the runner-up -- acceptable, because the
             advisor always prints both and a human picks
    miss     the right answer was not offered at all -- the only real failure

A miss is a signal to add a trigger phrase, NOT to special-case the request. If widening
a signal fixes one case and breaks another, that is the eval doing its job.

Usage:
    python tests/eval_advisor.py            # table + score
    python tests/eval_advisor.py --verbose  # also print the matched signals
    python tests/eval_advisor.py --strict   # exit non-zero unless every case is `top`

Exit 0 when there are no misses (or, with --strict, no non-top results).
"""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
SKILL = HERE.parent
ADVISE = SKILL / "scripts" / "advise.py"

# expect.json states the type in prose, because it is also read by humans. This maps
# that prose onto the advisor's genre tokens. A case whose expected_type is missing here
# is reported as UNMAPPED rather than silently scored as a miss.
PROSE_TO_TYPE = {
    "plain shapes + connections": "plain",
    "plain shapes + containers": "plain",
    "plain shapes + scenarios": "scenarios",
    "flowchart (plain shapes + diamond)": "flowchart",
    "sequence_diagram": "sequence_diagram",
    "sql_table (erd)": "sql_table",
    "grid": "grid",
    "c4 via layers": "layers",
    "uml class": "class",
}


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--verbose", action="store_true")
    ap.add_argument("--strict", action="store_true",
                    help="require the top pick to be right on every case")
    args = ap.parse_args()

    rows, misses, non_top = [], 0, 0
    for d in sorted((HERE / "cases").iterdir()):
        if d.name.startswith("_") or not (d / "expect.json").is_file():
            continue
        spec = json.loads((d / "expect.json").read_text(encoding="utf-8"))
        req_file = d / "request.md"
        if not req_file.is_file():
            continue
        request = " ".join(req_file.read_text(encoding="utf-8").split())

        want = PROSE_TO_TYPE.get(spec.get("expected_type", "").lower())
        proc = subprocess.run([sys.executable, str(ADVISE), request, "--json"],
                              capture_output=True, text=True)
        if proc.returncode != 0:
            rows.append(("ERR", d.name, "-", "-", want or "?", proc.stderr.strip()[:60]))
            misses += 1
            continue

        r = json.loads(proc.stdout)
        top = r["proposed"]["type"]
        runner = (r["runner_up"] or {}).get("type")

        if want is None:
            verdict = "UNMAPPED"
        elif top == want:
            verdict = "top"
        elif runner == want:
            verdict = "runner"
            non_top += 1
        else:
            verdict = "MISS"
            misses += 1
            non_top += 1

        rows.append((verdict, d.name, top, runner or "-", want or "?",
                     ", ".join(r["proposed"]["matched"][:5])))

    width = max(len(r[1]) for r in rows) if rows else 20
    print("%-8s %-*s %-18s %-18s %s" % ("verdict", width, "case", "proposed", "runner-up", "expected"))
    print("-" * (width + 70))
    for verdict, name, top, runner, want, matched in rows:
        print("%-8s %-*s %-18s %-18s %s" % (verdict, width, name, top, runner, want))
        if args.verbose and matched:
            print(" " * 9 + "matched: " + matched)

    total = len(rows)
    tops = sum(1 for r in rows if r[0] == "top")
    print("\n%d/%d correct on the top pick, %d misses (right answer not offered at all)"
          % (tops, total, misses))

    if args.strict:
        return 0 if non_top == 0 else 1
    return 0 if misses == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
