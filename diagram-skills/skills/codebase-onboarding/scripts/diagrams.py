"""Diagrams for the report: drafts to start from, a draw.io copy of each, and a check that no fact went missing.

  python -I diagrams.py draft  --workspace W     # write and render the four drafts
  python -I diagrams.py drawio --workspace W     # an editable .drawio beside each final .svg
  python -I diagrams.py check  --workspace W     # exit 3 on a missing fact, a stale render or a missing .drawio

The drafts are a starting point, not a house style. The model running the skill restyles them for the repo in
front of it with the d2-diagram skill (shapes, icons, layout, themes, one theme or two). `check` holds only the
contract: every fact the scripts found is still named in the .d2, the .svg is newer than its .d2, and the
.drawio (made by d2-diagram's to_drawio.py from the light .svg) is newer than the .svg.

Drafts:

Reads W/map.json, W/infra.json, W/services.json and W/arch.json (a missing file skips its diagram) and writes
W/out/diagrams/<name>.d2, <name>.svg, <name>-dark.d2 and <name>-dark.svg for:
  * module-map    folders (two levels) and how many imports run between them; the top 25 by imports in, then
                  "+N more folders"; layout elk;
  * infra         the runtime pieces from infra.py, shaped by kind (cylinder = database or cache, queue, …);
  * services      this code and each outside account, grouped by kind (llm, payments, email …);
  * architecture  one node per deploy unit with its layout verdict.
Colours come from references/section-colours.json, the same palette the HTML report uses, so a node's colour
says which report section explains it. Rendering goes through the sibling skill's render.py
(../../d2-diagram/scripts/render.py, beside this skill in the vault and in the plugin): exit 3 if any render fails.
"""
import argparse
import collections
import json
import os
import re
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
RENDER = HERE.parents[1] / "d2-diagram" / "scripts" / "render.py"
TO_DRAWIO = HERE.parents[1] / "d2-diagram" / "scripts" / "to_drawio.py"
NAMES = [("module-map", "map.json"), ("infra", "infra.json"), ("services", "services.json"), ("architecture", "arch.json")]
COLOURS = json.loads((HERE.parent / "references" / "section-colours.json").read_text(encoding="utf-8"))
BG = {"light": "#ffffff", "dark": "#1b211f"}
SHAPES = {"database": "cylinder", "cache": "cylinder", "queue": "queue", "storage": "stored_data",
          "proxy": "hexagon", "external": "cloud", "service": "rectangle"}
TOP = 25


NL = "\\" + "n"          # D2's line-break escape inside a quoted label


def q(s):
    return '"' + str(s).replace('"', "'") + '"'


def mix(hex_colour, bg, amount):
    a = [int(hex_colour[i:i + 2], 16) for i in (1, 3, 5)]
    b = [int(bg[i:i + 2], 16) for i in (1, 3, 5)]
    return "#" + "".join(f"{round(x * (1 - amount) + y * amount):02x}" for x, y in zip(a, b))


FG = {"light": "#1c2321", "dark": "#e2e7e3"}
ZONE = {"light": "#55615c", "dark": "#a0aca6"}


def classes(mode, used, zone):
    lines = ["classes: {"]
    for name in used:
        c = COLOURS[name][mode]
        lines.append(f"  {name}: {{style: {{fill: \"{mix(c, BG[mode], 0.82)}\"; stroke: \"{c}\"; "
                     f"stroke-width: 2; font-color: \"{FG[mode]}\"}}}}")
    if zone:        # a grouping box: quieter than the nodes inside it (d2-diagram quality criterion 11)
        lines.append(f"  zone: {{style: {{fill: \"{mix(ZONE[mode], BG[mode], 0.93)}\"; stroke: \"{ZONE[mode]}\"; "
                     f"stroke-dash: 3; font-size: 14; font-color: \"{ZONE[mode]}\"}}}}")
    lines.append("}")
    return lines


def folder_of(path):
    path = path.rstrip("/")
    parts = path.split("/")[:-1] if not path.endswith("/") and "." in path.split("/")[-1] else path.split("/")
    return "/".join(parts[:2]) or "(root)"


def folder_counts(map_json):
    counts = collections.Counter()
    for a, b in map_json.get("edges", []):
        fa, fb = folder_of(a), folder_of(b)
        if fa != fb:
            counts[(fa, fb)] += 1
    incoming = collections.Counter()
    for (fa, fb), n in counts.items():
        incoming[fb] += n
        incoming[fa] += 0
    return counts, sorted(incoming, key=lambda f: (-incoming[f], f))


def tree_folders(map_json, top=TOP):
    """Folders with files, largest first, when there is no import data (a language map_repo cannot scan)."""
    rows = [f for f in map_json.get("folders", []) if f["path"] != "(root)" and f.get("files")]
    return [f["path"] for f in sorted(rows, key=lambda f: (-f["files"], f["path"]))[:top]]


def folder_tree(map_json, top=TOP):
    keep = tree_folders(map_json, top)
    files = {f["path"]: f["files"] for f in map_json.get("folders", [])}
    lines = ["direction: down", "title: Where things live (no import data for this language) "
             "{near: top-center; shape: text; style.font-size: 20}"]
    lines += [f"{q(f)}: {{class: structure; label: {q(f + NL + str(files[f]) + ' files')}}}" for f in keep]
    lines += [f"{q(f.rsplit('/', 1)[0])} -> {q(f)}" for f in keep if "/" in f and f.rsplit("/", 1)[0] in keep]
    return "\n".join(lines) + "\n"


def module_map(map_json, top=TOP):
    counts, ranked = folder_counts(map_json)
    if not counts:
        return folder_tree(map_json, top)
    keep, rest = ranked[:top], len(ranked) - top
    lines = ["direction: right", "title: Where the code imports from {near: top-center; shape: text; style.font-size: 20}"]
    lines += [f"{q(f)}: {{class: structure}}" for f in keep]
    lines += [f"{q(a)} -> {q(b)}: {q(n)}" for (a, b), n in sorted(counts.items()) if a in keep and b in keep]
    if rest > 0:
        lines.append(f"more: {q(f'+{rest} more folders')} {{shape: text}}")
    return "\n".join(lines) + "\n"


def infra_map(infra):
    lines = ["direction: right", "title: What runs, and what it talks to {near: top-center; shape: text; style.font-size: 20}"]
    for n in infra.get("nodes", []):
        cls = "services" if n["kind"] == "external" else "infrastructure"
        label = n["id"] + (NL + n["image"] if n.get("image") else "")
        lines.append(f"{q(n['id'])}: {{class: {cls}; label: {q(label)}; shape: {SHAPES.get(n['kind'], 'rectangle')}}}")
    for e in infra.get("edges", []):
        lines.append(f"{q(e['from'])} -> {q(e['to'])}")
    return "\n".join(lines) + "\n"


def services_map(services):
    lines = ["direction: right", "title: Outside accounts the code needs {near: top-center; shape: text; style.font-size: 20}",
             'app: "This code" {class: structure}']
    by_kind = collections.defaultdict(list)
    for s in services.get("services", []):
        by_kind[s["kind"]].append(s["name"])
    for kind in sorted(by_kind):
        lines.append(f"{q(kind)}: {{class: zone")
        lines += [f"  {q(name)}: {{class: services}}" for name in sorted(by_kind[kind])]
        lines.append("}")
        lines += [f"app -> {q(kind)}.{q(name)}" for name in sorted(by_kind[kind])]
    return "\n".join(lines) + "\n"


def arch_map(arch):
    lines = ["direction: right", f"title: {q('Architecture: ' + arch.get('verdict', 'not determined'))} "
             "{near: top-center; shape: text; style.font-size: 20}"]
    for u in arch.get("units", []):
        lines.append(f"{q(u['path'])}: {{class: architecture; label: {q(u['path'] + NL + u['verdict'])}}}")
    return "\n".join(lines) + "\n"


def with_style(body, mode):
    used = [n for n in COLOURS if not n.startswith("_") and f"class: {n}" in body]
    return "\n".join(classes(mode, used, "class: zone" in body)) + "\n" + body


def render(src, out, mode, layout):
    args = [sys.executable, str(RENDER), str(src), "-o", str(out), "--theme", "0" if mode == "light" else "200"]
    if layout:
        args += ["--layout", layout]
    return subprocess.run(args, capture_output=True, text=True).returncode == 0


def make(w):
    w = Path(w)
    out = w / "out" / "diagrams"
    out.mkdir(parents=True, exist_ok=True)
    jobs = [("module-map", "map.json", module_map, "elk"), ("infra", "infra.json", infra_map, None),
            ("services", "services.json", services_map, None), ("architecture", "arch.json", arch_map, None)]
    svgs, failed = [], []
    for name, src, build, layout in jobs:
        if not (w / src).is_file():
            continue
        body = build(json.loads((w / src).read_text(encoding="utf-8")))
        for mode, suffix in (("light", ""), ("dark", "-dark")):
            d2 = out / f"{name}{suffix}.d2"
            d2.write_text(with_style(body, mode), encoding="utf-8")
            svg = out / f"{name}{suffix}.svg"
            (svgs if render(d2, svg, mode, layout) else failed).append(str(svg))
    if failed:
        raise RuntimeError("render failed: " + ", ".join(failed))
    return svgs


def facts(name, data):
    """The labels a diagram must name, whatever its style."""
    if name == "module-map":
        return folder_counts(data)[1][:TOP] or tree_folders(data)
    if name == "infra":
        return [n["id"] for n in data.get("nodes", [])]
    if name == "services":
        return [s["name"] for s in data.get("services", [])]
    return [u["path"] if u["path"] != "." else u["verdict"] for u in data.get("units", [])]


def drawio(w):
    d = Path(w) / "out" / "diagrams"
    out = []
    for name, _ in NAMES:
        svg = d / f"{name}.svg"
        if svg.is_file():
            r = subprocess.run([sys.executable, str(TO_DRAWIO), str(svg), "-o", str(d / f"{name}.drawio")],
                               capture_output=True, text=True)
            if r.returncode != 0:
                raise RuntimeError(f"to_drawio failed on {svg.name}: {r.stderr.strip()[-200:]}")
            out.append(str(d / f"{name}.drawio"))
    return out


def check(w):
    w, problems = Path(w), []
    d = w / "out" / "diagrams"
    for name, src in NAMES:
        if not (w / src).is_file():
            continue
        need = facts(name, json.loads((w / src).read_text(encoding="utf-8")))
        d2, svg, dio = d / f"{name}.d2", d / f"{name}.svg", d / f"{name}.drawio"
        if not d2.is_file() or not svg.is_file():
            problems.append(f"{name}: no .d2 or no .svg (run draft, or render your own)")
            continue
        if svg.stat().st_mtime < d2.stat().st_mtime:
            problems.append(f"{name}: the render is older than its .d2: render it again")
        if not dio.is_file() or dio.stat().st_mtime < svg.stat().st_mtime:
            problems.append(f"{name}: no current .drawio: run diagrams.py drawio")
        dark_svg, dark_d2 = d / f"{name}-dark.svg", d / f"{name}-dark.d2"
        if dark_svg.is_file() and (not dark_d2.is_file() or dark_svg.stat().st_mtime < d2.stat().st_mtime
                                   or dark_svg.stat().st_mtime < dark_d2.stat().st_mtime):
            problems.append(f"{name}: the dark render is older than the .d2: render the dark one again or delete it")
        for src_d2 in (d2, dark_d2):                  # each theme names every fact on its own
            if not src_d2.is_file():
                continue
            text = src_d2.read_text(encoding="utf-8")
            for f in need:
                if not re.search(r"(?<![\w.-])" + re.escape(f) + r"(?![\w-])", text):
                    problems.append(f"{src_d2.stem}: missing fact {f!r} (the scripts found it; the diagram must name it)")
    return problems


def main():
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("cmd", choices=["draft", "drawio", "check"])
    p.add_argument("--workspace", required=True)
    a = p.parse_args()
    if not RENDER.is_file() or not TO_DRAWIO.is_file():
        print(f"d2-diagram's scripts not found beside this skill ({RENDER.parent}): install the diagram-skills plugin")
        sys.exit(3)
    if a.cmd == "check":
        problems = check(a.workspace)
        for x in problems:
            print(x)
        print("diagram check: " + ("ok" if not problems else f"{len(problems)} problems"))
        sys.exit(3 if problems else 0)
    try:
        out = make(a.workspace) if a.cmd == "draft" else drawio(a.workspace)
    except RuntimeError as e:
        print(e)
        sys.exit(3)
    for s in out:
        print(s)


if __name__ == "__main__":
    main()
