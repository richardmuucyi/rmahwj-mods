#!/usr/bin/env python3
"""Deterministic regression harness for the d2-diagram skill.

Runs every case under tests/cases/ and asserts what a render is actually allowed to
claim. The point is not "did d2 exit 0" -- that is the weakest possible signal in this
language, because D2's worst failure modes all exit 0:

  * a label parsed as a key silently CREATES a shape
  * a dead icon URL renders as nothing
  * a grid declared column-first scrambles a row-major table

So each case declares its expected shape and connection inventory, and the harness reads
those back out of the rendered SVG (via render.svg_inventory) rather than trusting the
exit code. A case that compiles but drew the wrong graph FAILS here.

Negative cases (expect.compile == false) are the control. A harness where nothing can
fail is not testing anything, so the corpus deliberately contains diagrams that MUST be
rejected -- including ones that are valid D2 but the wrong graph.

Usage:
    python tests/run_harness.py                 # run everything
    python tests/run_harness.py --only 03 07    # cases whose dir name starts with these
    python tests/run_harness.py --max-level 4   # only rungs 0-4 of the ladder
    python tests/run_harness.py --rasterize     # also write PNGs for eyeballing
    python tests/run_harness.py --json          # machine-readable report

Exit 0 only when every gate on every case passed.
"""

from __future__ import annotations

import argparse
import json
import re
import shutil
import subprocess
import sys
import time
from pathlib import Path

HERE = Path(__file__).resolve().parent
SKILL = HERE.parent
sys.path.insert(0, str(SKILL / "scripts"))

import render  # noqa: E402  -- reuse the verified d2 lookup and SVG inventory readers

OUT = HERE / "_out"


class Gate:
    """One assertion about one case, carrying the evidence that settled it."""

    def __init__(self, name: str, ok: bool, detail: str = ""):
        self.name = name
        self.ok = ok
        self.detail = detail

    def line(self) -> str:
        mark = "pass" if self.ok else "FAIL"
        return f"    [{mark}] {self.name}" + (f" -- {self.detail}" if self.detail else "")


def load_cases(root: Path) -> list:
    cases = []
    if not root.is_dir():
        return cases
    for d in sorted(root.iterdir()):
        if not d.is_dir():
            continue
        spec = d / "expect.json"
        if not spec.is_file():
            continue
        data = json.loads(spec.read_text(encoding="utf-8"))
        data["_dir"] = d
        data["_id"] = d.name
        cases.append(data)
    return cases


def compile_case(d2_bin: str, src: Path, out: Path, spec: dict):
    """Run d2 and return (returncode, combined output, elapsed seconds).

    Paths go in posix form deliberately: given a backslash input path on Windows, d2
    resolves relative imports against the CWD instead of the importing file's directory,
    so a case using `@_classes` would pass or fail depending on where the harness ran
    from. render.py takes the same precaution for the same reason.
    """
    cmd = [d2_bin]
    if spec.get("layout"):
        cmd.append("--layout=" + str(spec["layout"]))
    if spec.get("theme") is not None:
        cmd.append("--theme=" + str(spec["theme"]))
    if spec.get("sketch"):
        cmd.append("--sketch")
    for extra in spec.get("extra_flags", []):
        cmd.append(extra)
    cmd += [src.as_posix(), out.as_posix()]

    t0 = time.time()
    proc = subprocess.run(cmd, capture_output=True, text=True)
    return proc.returncode, (proc.stdout + proc.stderr).strip(), time.time() - t0


def first_line(text: str) -> str:
    return text.splitlines()[0] if text.strip() else "(silent)"


def run_case(case: dict, d2_bin: str, rasterize: bool) -> dict:
    cid = case["_id"]
    src = case["_dir"] / case.get("source", "reference.d2")
    expect_compile = case.get("compile", True)
    multiboard = case.get("multiboard", False)

    outdir = OUT / cid
    if outdir.exists():
        shutil.rmtree(outdir, ignore_errors=True)
    outdir.mkdir(parents=True, exist_ok=True)
    out = outdir / "out.svg"

    gates = []
    base = {"id": cid, "level": case.get("complexity"), "scenario": case.get("scenario", "")}

    if not src.is_file():
        gates.append(Gate("source-exists", False, "missing " + src.name))
        return dict(base, gates=gates, ok=False)

    rc, log, elapsed = compile_case(d2_bin, src, out, case)
    base["seconds"] = round(elapsed, 2)

    # Gate 1 -- the compile gate, in whichever direction this case declares.
    if not expect_compile:
        want = case.get("fails_with", "")
        hit = rc != 0 and (want.lower() in log.lower() if want else True)
        detail = ("exit " + str(rc)) if hit else (
            "expected error containing " + repr(want) + "; got exit " + str(rc) + ": " + first_line(log))
        gates.append(Gate("fails-as-expected", hit, detail))
        # A negative case stops here: there is nothing legitimate to inventory.
        return dict(base, gates=gates, ok=all(g.ok for g in gates))

    gates.append(Gate("compiles", rc == 0, "" if rc == 0 else first_line(log)))
    if rc != 0:
        return dict(base, gates=gates, ok=False, log=log)

    # Gate 2 -- multi-board diagrams write a DIRECTORY, not the file you asked for, and
    # the directory drops the extension: ask for `out.svg` and you get `out/`, never
    # `out.svg/`. Checking the path you passed is therefore always wrong here.
    board_dir = out.with_suffix("")
    wrote_dir = board_dir.is_dir()
    gates.append(Gate("board-shape", wrote_dir == multiboard,
                      "expected " + ("directory of boards" if multiboard else "single file")
                      + ", got " + ("directory " + board_dir.name + "/" if wrote_dir else "file")))

    index = (board_dir / "index.svg") if wrote_dir else out
    if multiboard and wrote_dir and case.get("boards") is not None:
        # Boards nest under layers/ scenarios/ steps/ ONLY when the diagram uses more
        # than one board KEYWORD; a single-keyword diagram writes them flat at the root
        # (verified). rglob covers both without caring which shape it got.
        boards = sorted(p.relative_to(board_dir).as_posix() for p in board_dir.rglob("*.svg"))
        gates.append(Gate("board-count", len(boards) == case["boards"],
                          str(boards) if len(boards) == case["boards"] else
                          "expected " + str(case["boards"]) + ", got " + str(len(boards))
                          + ": " + str(boards)))

    if not index.is_file():
        gates.append(Gate("render-readable", False, "no SVG at " + str(index)))
        return dict(base, gates=gates, ok=False)

    # Gate 3 -- the inventory. This is the gate that catches phantom shapes.
    shapes, conns = render.svg_inventory(index)
    base["shapes"] = len(shapes)
    base["edges"] = len(conns)
    if case.get("shapes") is not None:
        ok = len(shapes) == case["shapes"]
        gates.append(Gate("shape-count", ok, str(len(shapes)) if ok else
                          "expected " + str(case["shapes"]) + ", drew " + str(len(shapes))
                          + ": " + str(sorted(shapes))))
    if case.get("edges") is not None:
        ok = len(conns) == case["edges"]
        gates.append(Gate("edge-count", ok, str(len(conns)) if ok else
                          "expected " + str(case["edges"]) + ", drew " + str(len(conns))))

    # Gate 4 -- named shapes that must exist, by exact id.
    required = case.get("must_contain_shapes", [])
    if required:
        missing = [s for s in required if s not in shapes]
        gates.append(Gate("required-shapes", not missing, "missing " + str(missing) if missing else ""))

    # Gate 5 -- no shape id may read like prose; that is the signature of a label
    # that got parsed as a key, which is D2's most common silent bug. Same heuristic as
    # render.py --check, deliberately: two different definitions of "phantom" would mean
    # the harness and the interactive tool disagree about the same diagram.
    # `allow_prose_shapes` exists for ONE legitimate case: a sequence-diagram note is
    # declared as `actor."the note text"`, so its id really is prose and the heuristic
    # cannot tell it from a mis-parsed label. The case must name each one explicitly --
    # a blanket "ignore prose ids in sequence diagrams" would switch the gate off for
    # exactly the diagrams where a stray label is hardest to spot by eye.
    allowed = set(case.get("allow_prose_shapes", []))
    phantom = [s for s in shapes
               if s not in allowed
               and (re.search(r":\s", s) or "  " in s
                    or (len(s) > 25 and s.count(" ") >= 4))]
    gates.append(Gate("no-phantom-shapes", not phantom, "prose-like ids: " + str(phantom) if phantom else ""))

    # Gate 6 -- geometry sanity. A runaway aspect ratio means the wrong `direction`.
    dims = render.svg_dimensions(index)
    if dims:
        w, h = dims
        ratio = max(w, h) / max(1.0, min(w, h))
        cap = case.get("max_aspect", 6.0)
        gates.append(Gate("aspect-ratio", ratio <= cap,
                          ("%.1f:1" % ratio) if ratio <= cap
                          else ("%.1f:1 exceeds %.1f:1" % (ratio, cap))))

    # Gate 7 -- text that must survive into the render. Labels land as SVG text, so an
    # absent string means the label was dropped, clipped out, or never parsed.
    if case.get("must_contain_text"):
        svg_text = index.read_text(encoding="utf-8", errors="replace")
        absent = [t for t in case["must_contain_text"] if t not in svg_text]
        gates.append(Gate("required-text", not absent, "absent " + str(absent) if absent else ""))

    if rasterize:
        subprocess.run([sys.executable, str(SKILL / "scripts" / "rasterize.py"),
                        str(index), "--scale", "1"], capture_output=True, text=True)

    # A gate that has never been seen to fire is a gate nobody has tested. Cases
    # declaring `expect_gate_failures` are inverted controls: they are valid D2 that
    # compiles happily and draws the WRONG graph, and they pass only when exactly the
    # named gates catch them. If one stops firing, this case turns red -- which is the
    # only way to notice that a check quietly stopped checking.
    inverted = case.get("expect_gate_failures")
    if inverted is not None:
        failed = sorted(g.name for g in gates if not g.ok)
        matched = failed == sorted(inverted)
        gates.append(Gate("control-fires-expected-gates", matched,
                          "expected exactly " + str(sorted(inverted)) + ", got " + str(failed)))
        return dict(base, gates=gates, ok=matched, svg=str(index), inverted=True)

    return dict(base, gates=gates, ok=all(g.ok for g in gates), svg=str(index))


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--only", nargs="*", help="run only cases whose dir name starts with one of these")
    ap.add_argument("--max-level", type=int, help="only run cases at or below this complexity level")
    ap.add_argument("--rasterize", action="store_true", help="also write a PNG per case")
    ap.add_argument("--json", action="store_true", help="machine-readable report on stdout")
    args = ap.parse_args()

    d2_bin = render.find_d2()
    cases = load_cases(HERE / "cases")
    if args.only:
        cases = [c for c in cases if any(c["_id"].startswith(p) for p in args.only)]
    if args.max_level is not None:
        cases = [c for c in cases if (c.get("complexity") or 0) <= args.max_level]

    if not cases:
        print("no cases matched", file=sys.stderr)
        return 2

    results = [run_case(c, d2_bin, args.rasterize) for c in cases]

    if args.json:
        payload = []
        for r in results:
            item = {k: v for k, v in r.items() if k != "gates"}
            item["gates"] = [{"name": g.name, "ok": g.ok, "detail": g.detail} for g in r["gates"]]
            payload.append(item)
        print(json.dumps(payload, indent=2))
    else:
        for r in results:
            head = "L" + str(r.get("level")) + "  " + r["id"]
            if r.get("scenario"):
                head += "  -- " + r["scenario"]
            print(("OK  " if r["ok"] else "FAIL") + "  " + head)
            if not r["ok"]:
                for g in r["gates"]:
                    print(g.line())
        passed = sum(1 for r in results if r["ok"])
        print("")
        print(str(passed) + "/" + str(len(results)) + " cases passed")
        controls = [r for r in results if r["id"].startswith("_neg")]
        if controls:
            good = sum(1 for c in controls if c["ok"])
            print("negative controls: " + str(good) + "/" + str(len(controls))
                  + " correctly refused")

    return 0 if all(r["ok"] for r in results) else 1


if __name__ == "__main__":
    sys.exit(main())
