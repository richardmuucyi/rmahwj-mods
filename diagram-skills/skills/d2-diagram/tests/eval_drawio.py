#!/usr/bin/env python3
"""Prove to_drawio.py carries every d2 object into draw.io, where d2 put it.

Four checks per board, each against the SVG d2 wrote rather than the converter's own notes:

    inventory    every object ID in the SVG appears exactly once as a cell's d2_id
    geometry     every single-rectangle shape keeps d2's box, to 0.5 px, after parent offsets
    endpoints    every line starts and ends within 6 px of d2's path (arrowhead tips move it)
    attachment   an attached end's exitX/exitY/exitDx/exitDy rebuild that point to 0.5 px
                 (2-decimal fractions tilted the ERD's straight lines by 1.4 px on 2026-10-19)

Then, when the draw.io desktop app is installed, each file is exported to PNG: an export that
fails means draw.io could not read the file (a stencil it cannot decode, broken XML).

A negative control runs last. It plants three faults in a converted file -- a shape moved
30 px, an ID dropped, an attach point nudged -- and the same checks must report all three. A
checker that passes the planted file is checking nothing.

Usage:
    python tests/eval_drawio.py              # all cases
    python tests/eval_drawio.py --no-render  # skip the draw.io export

Exit 0 only when every case passes and the control is caught.
"""

from __future__ import annotations

import argparse
import base64
import hashlib
import html
import math
import re
import shutil
import subprocess
import sys
from collections import Counter
from pathlib import Path
from xml.etree import ElementTree as ET

HERE = Path(__file__).resolve().parent
SKILL = HERE.parent
OUT = HERE / "_out" / "drawio"
sys.path.insert(0, str(SKILL / "scripts"))
from to_drawio import find_drawio  # noqa: E402
from render import board_target, find_d2  # noqa: E402

SVG = "{http://www.w3.org/2000/svg}"
CASES = [
    HERE / "all-types" / "01-plain.d2",
    HERE / "all-types" / "02-sequence.d2",
    HERE / "all-types" / "03-erd.d2",
    HERE / "all-types" / "04-class.d2",
    HERE / "all-types" / "05-grid.d2",
    HERE / "all-types" / "06-c4.d2",
    HERE / "all-types" / "07-scenarios.d2",
    HERE / "cases" / "03-inkwell-signup" / "reference.d2",
    HERE / "cases" / "06-library-loans-schema" / "reference.d2",
    HERE / "cases" / "07-shop-integration-legend" / "reference.d2",
    HERE / "fixtures" / "reviewer" / "cloud-merge" / "clean.d2",
    HERE / "drawio" / "every-shape.d2",
]


def _code(work: Path, xml: str) -> list[str]:
    labels = re.findall(r'label="([^"]*func[^"]*)"', xml)
    if len(labels) != 1:
        return [f"{len(labels)} labels hold the code (the dark copy doubles it)"]
    p = [] if "&lt;br&gt;" in labels[0] and "func" in labels[0] and "main" in labels[0] else ["lines or tokens lost"]
    return p + ([] if "font color" in labels[0] else ["token colours lost"])


def _steps(work: Path, xml: str) -> list[str]:
    names = [d.get("name") for d in ET.fromstring(xml).findall("diagram")]
    p = [] if names == ["root", "start", "middle", "end"] else [f"pages in order {names}"]
    pngs = sorted(work.glob("out.page*.png"))
    if pngs and len({hashlib.md5(png.read_bytes()).hexdigest() for png in pngs}) != len(pngs):
        p.append("--png exported the same page twice")
    return p


def _quoted(work: Path, xml: str) -> list[str]:
    edge = re.search(r'd2_id="\(&quot;x -&gt; y&quot; -&gt; z\)\[0\]">\s*<mxCell[^>]*>', xml)
    return [] if edge and 'source="' in edge.group(0) and 'target="' in edge.group(0) else ["the line is not attached"]


REVIEW_CASES = [  # (name, d2 source, d2 flags, check(work folder, drawio xml) -> problems)
    ("review: code block", "code: |go\nfunc main() {\n  x := 1\n}\n|\n", [], _code),
    ("review: step order", "a -> b\nsteps: {\n  start: { c }\n  middle: { d }\n  end: { e }\n}\n", [], _steps),
    ("review: dark-theme hollow heads", "a -> b: t {target-arrowhead: {shape: triangle; style.filled: false}}\n",
     ["--theme=200"], lambda w, x: [] if "endFill=0" in x and "endFill=1" not in x else ["drawn filled"]),
    ("review: underline", "b: u {style.underline: true}\n", [],
     lambda w, x: [] if "fontStyle=5" in x else ["underline lost"]),
    ("review: a class named big", "classes: {hot: {style.fill: red}; big: {style.font-size: 30}}\n"
     "k: {class: [hot; big]}\n", [], lambda w, x: [] if 'd2_class="hot big"' in x else ["a class was dropped"]),
    ("review: quoted key with arrow", '"x -> y" -> z\n', [], _quoted),
]


def decode(token: str) -> str | None:
    """Independent of the converter's decoder on purpose: URL-safe base64 of the escaped ID."""
    if not re.fullmatch(r"[A-Za-z0-9_\-=]{2,}", token):
        return None
    try:
        raw = base64.urlsafe_b64decode(token + "=" * (-len(token) % 4))
        text = raw.decode("utf-8")
    except Exception:
        return None
    if not text.isprintable() or base64.urlsafe_b64encode(raw).decode().rstrip("=") != token.rstrip("="):
        return None
    return html.unescape(text)


def svg_facts(svg: Path):
    """IDs, plain-rectangle boxes and line ends, read straight from d2's SVG."""
    root = ET.parse(svg).getroot()
    inner = root.find(SVG + "svg")
    inner = inner if inner is not None else root
    vb = [float(v) for v in inner.get("viewBox").split()]
    ids, rects, ends = [], {}, {}
    for g in inner.iter(SVG + "g"):
        d2id = next((d for d in (decode(t) for t in (g.get("class") or "").split()) if d), None)
        if d2id is None:
            continue
        ids.append(d2id)
        if g not in list(inner):  # geometry only for top-level objects: no transform above them
            continue
        body = next((c for c in g if c.tag == SVG + "g" and "shape" in (c.get("class") or "").split()), None)
        if body is not None and len(body) == 1 and body[0].tag == SVG + "rect":
            r = body[0]
            rects[d2id] = (float(r.get("x")) - vb[0], float(r.get("y")) - vb[1], float(r.get("width")),
                           float(r.get("height")))
        path = next((p for p in g if p.tag == SVG + "path" and "connection" in (p.get("class") or "")), None)
        if path is not None:
            nums = [float(v) for v in re.findall(r"-?\d+\.?\d*", path.get("d"))]
            ends[d2id] = ((nums[0] - vb[0], nums[1] - vb[1]), (nums[-2] - vb[0], nums[-1] - vb[1]))
    return ids, rects, ends


def drawio_facts(diagram: ET.Element):
    """Cells by d2_id, with absolute boxes and points (draw.io stores them parent-relative)."""
    cells, objs = {}, {}
    for el in diagram.iter():
        if el.tag == "UserObject":
            cell = el.find("mxCell")
            cells[el.get("id")] = cell
            objs[el.get("id")] = el
        elif el.tag == "mxCell" and el.get("id"):
            cells[el.get("id")] = el

    def origin(cid: str | None) -> tuple[float, float]:
        if cid in (None, "0", "1") or cid not in cells:
            return 0.0, 0.0
        g = cells[cid].find("mxGeometry")
        px, py = origin(cells[cid].get("parent"))
        return px + float(g.get("x", 0)), py + float(g.get("y", 0))

    boxes, edges = {}, {}
    ids = []
    for oid, obj in objs.items():
        d2id = obj.get("d2_id")
        if d2id is None:
            continue
        ids.append(d2id)
        cell = cells[oid]
        g = cell.find("mxGeometry")
        if cell.get("vertex") == "1":
            x, y = origin(oid)
            boxes[d2id] = (x, y, float(g.get("width")), float(g.get("height")))
        else:
            ox, oy = origin(cell.get("parent"))
            pts = {p.get("as"): (float(p.get("x")) + ox, float(p.get("y")) + oy) for p in g.findall("mxPoint")}
            style = dict(kv.split("=", 1) for kv in cell.get("style", "").split(";") if "=" in kv)
            ends = {}
            for side, key in (("source", "exit"), ("target", "entry")):
                if cell.get(side) and f"{key}X" in style:
                    bx, by = origin(cell.get(side))
                    sg = cells[cell.get(side)].find("mxGeometry")
                    w, h = float(sg.get("width")), float(sg.get("height"))
                    ends[side] = (bx + float(style[f"{key}X"]) * w + float(style.get(f"{key}Dx", 0)),
                                  by + float(style[f"{key}Y"]) * h + float(style.get(f"{key}Dy", 0)))
            edges[d2id] = (pts.get("sourcePoint"), pts.get("targetPoint"), ends)
    return ids, boxes, edges


def check(svg: Path, diagram: ET.Element) -> list[str]:
    s_ids, rects, s_ends = svg_facts(svg)
    d_ids, boxes, edges = drawio_facts(diagram)
    problems = []
    missing = Counter(s_ids) - Counter(d_ids)
    extra = Counter(d_ids) - Counter(s_ids)
    problems += [f"missing {k!r}" for k in missing]
    problems += [f"extra {k!r}" for k in extra]
    for d2id, want in rects.items():
        got = boxes.get(d2id)
        if got and max(abs(a - b) for a, b in zip(got, want)) > 0.5:
            problems.append(f"{d2id!r} box {tuple(round(v, 1) for v in got)} != d2 {want}")
    for d2id, (start, end) in s_ends.items():
        if d2id not in edges:
            continue
        sp, tp, attached = edges[d2id]
        for name, want, got in (("start", start, sp), ("end", end, tp)):
            if got is None or math.dist(want, got) > 6:
                problems.append(f"{d2id!r} {name} {got} is not d2's {want}")
        for side, point in (("source", sp), ("target", tp)):
            if side in attached and math.dist(attached[side], point) > 0.5:
                problems.append(f"{d2id!r} {side} attach point {tuple(round(v, 2) for v in attached[side])} "
                                f"!= {point}")
    return problems


def board_svgs(src: Path, work: Path) -> dict[str, Path]:
    """Board name -> SVG, named the way the converter names pages (paired by name, not position:
    the converter orders pages as the source declares the boards)."""
    out = work / (src.stem + ".svg")
    proc = subprocess.run([find_d2(), str(src), str(out)], capture_output=True, text=True, errors="replace")
    if proc.returncode != 0:
        raise RuntimeError(proc.stderr.strip())
    folder = out.with_suffix("")
    if not folder.is_dir():
        return {src.stem: out}
    return {board_target(str(p.relative_to(folder))) or "root": p for p in folder.rglob("*.svg")}


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--no-render", action="store_true", help="skip the draw.io desktop export")
    args = ap.parse_args()
    shutil.rmtree(OUT, ignore_errors=True)
    OUT.mkdir(parents=True)
    drawio = None if args.no_render else find_drawio()
    bad = 0
    control_file = None

    for src in CASES:
        label = src.parent.name if src.stem in ("reference", "clean") else src.stem
        work = OUT / label
        work.mkdir()
        try:
            svgs = board_svgs(src, work)
        except RuntimeError as e:
            print("WRONG %-28s d2 failed: %s" % (label, e))
            bad += 1
            continue
        target = work / f"{label}.drawio"
        conv = subprocess.run([sys.executable, str(SKILL / "scripts" / "to_drawio.py"), str(src), "-o", str(target)],
                              capture_output=True, text=True, errors="replace")
        problems = [] if conv.returncode == 0 else [f"converter exit {conv.returncode}: {conv.stderr.strip()[-300:]}"]
        if not problems:
            pages = ET.parse(target).getroot().findall("diagram")
            if sorted(p.get("name") for p in pages) != sorted(svgs):
                problems.append(f"pages {[p.get('name') for p in pages]} for boards {sorted(svgs)}")
            for page in pages:
                if page.get("name") in svgs:
                    problems += check(svgs[page.get("name")], page)
            if drawio:
                png = work / f"{label}.png"
                exp = subprocess.run([drawio, "-x", "-f", "png", "-o", str(png), str(target)],
                                     capture_output=True, text=True, errors="replace", timeout=180)
                if exp.returncode != 0 or not png.is_file() or png.stat().st_size < 1000:
                    problems.append(f"draw.io export failed: {(exp.stderr or exp.stdout).strip()[-200:]}")
        if label == "cloud-merge":
            control_file = (next(iter(svgs.values())), target)
        bad += bool(problems)
        print("%-5s %-28s %s" % ("WRONG" if problems else "OK", label, "; ".join(problems[:4])))

    # Cases from the 2026-10-19 adversarial review of to_drawio.py, each a defect it showed.
    for name, source, flags, check_case in REVIEW_CASES:
        work = OUT / re.sub(r"\W+", "-", name).strip("-")
        work.mkdir()
        (work / "in.d2").write_text(source, encoding="utf-8")
        args = [sys.executable, str(SKILL / "scripts" / "to_drawio.py"), str(work / "in.d2"), "-o",
                str(work / "out.drawio")] + (["--png"] if drawio and "steps" in source else []) + \
               (["--", *flags] if flags else [])
        conv = subprocess.run(args, capture_output=True, text=True, errors="replace", timeout=300)
        problems = [f"converter exit {conv.returncode}: {conv.stderr.strip()[-200:]}"] if conv.returncode else []
        if not problems:
            problems = check_case(work, (work / "out.drawio").read_text(encoding="utf-8"))
        bad += bool(problems)
        print("%-5s %-28s %s" % ("WRONG" if problems else "OK", name, "; ".join(problems[:3])))
    hang = subprocess.run([sys.executable, "-c", "import sys; sys.path.insert(0, sys.argv[1]); from to_drawio import "
                           "parse_path as p; print(len(p('M0 0 L10 0 Z 5 5')), len(p('M0 0 a5 5 0 0110 0')))",
                           str(SKILL / "scripts")], capture_output=True, text=True, timeout=20)
    problems = [] if hang.returncode == 0 and hang.stdout.split() == ["3", "2"] else [f"got {hang.stdout.strip()!r}"]
    bad += bool(problems)
    print("%-5s %-28s %s" % ("WRONG" if problems else "OK", "review: path parser", "; ".join(problems)))

    # Negative control: plant three faults and require the checks to see each of them.
    caught = False
    if control_file:
        svg, target = control_file
        tree = ET.parse(target)
        page = tree.getroot().find("diagram")
        objs = [o for o in page.iter("UserObject") if o.get("d2_id")]
        rect_obj = next(o for o in objs if o.find("mxCell").get("vertex") == "1"
                        and "rounded=1" in o.find("mxCell").get("style", ""))
        geo = rect_obj.find("mxCell").find("mxGeometry")
        geo.set("x", str(float(geo.get("x")) + 30))
        dropped = next(o for o in objs if o.find("mxCell").get("edge") == "1")
        del dropped.attrib["d2_id"]
        # a different line from the dropped one: the checks skip a line with no ID
        nudged = next((o.find("mxCell") for o in objs if o is not dropped
                       and "exitY=" in o.find("mxCell").get("style", "")), None)
        if nudged is not None:
            nudged.set("style", re.sub(r"exitY=([\d.]+)", lambda m: f"exitY={float(m.group(1)) + 0.01:g}",
                                       nudged.get("style")))
        found = check(svg, page)
        kinds = {"box": any(" box " in p for p in found), "missing": any(p.startswith("missing") for p in found),
                 "attach": nudged is None or any("attach point" in p for p in found)}
        caught = all(kinds.values())
        print("%-5s %-28s planted 3 faults, checks reported: %s" % (
            "OK" if caught else "WRONG", "negative control", ", ".join(k for k, v in kinds.items() if v) or "none"))
    print()
    if not drawio:
        print("draw.io desktop not found or --no-render: the export check did not run")
    if bad or not caught:
        print("%d case(s) failed%s" % (bad, "" if caught else "; the negative control was NOT caught"))
        return 1
    print("every d2 object reached draw.io where d2 drew it, and the checks caught the planted faults")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
