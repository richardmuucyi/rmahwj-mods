#!/usr/bin/env python3
"""Render a mermaid diagram with the default layout (dagre) and with elk; keep both; pick neither.

Usage:
    python compare_layouts.py <source.mmd> [--out-dir DIR] [--theme themes/<name>.json]

Writes <stem>.dagre.png/.svg and <stem>.elk.png/.svg (into --out-dir, default beside the
source), prints both canvas sizes, and tells you to open both PNGs. It never recommends one.
When the two PNGs are byte-identical it says "layout has no effect on <type>" instead: elk
moves only flowchart, class, state, er, requirement and mindmap diagrams (measured
on 11.16.1), and "open both" on the other sixteen types sent the reader to
compare two copies of one picture. Identical bytes is a fact, not a judgement, so this does
not break the rule below.

Why it never recommends: no number picks the better layout. On a Bitly architecture
review elk gave the better canvas (2.2:1 against 4.6:1) and still sent
the redirect edge on a detour round the whole diagram, while dagre drew the request
as a clean round trip. The d2-diagram skill learnt the same thing the hard way: its
aspect-ratio recommendation chose the worse layout on both diagrams it was tried on.

How: the layout is set in the source's YAML frontmatter (`config: layout:`), the form
mermaid 11 reads, in a temporary copy of the source. Each copy renders through
render.sh, so a --theme gets exactly the theme merge and page ground a normal render
gets. The pinned toolchain ships @mermaid-js/layout-elk; an app's bundled mermaid (Obsidian's,
for one) may not, so check a chosen elk layout with compat_check.py before relying on it there.

Exit codes: 0 both rendered · 1 a render failed · 2 bad arguments.
"""

from __future__ import annotations

import argparse
import re
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE / "toolchain"))
from versions import resolve_bash  # noqa: E402
sys.path.insert(0, str(HERE))
from extract_blocks import detect_diagram_type  # noqa: E402

RENDER = HERE / "render.sh"
ENGINES = ("dagre", "elk")
FRONTMATTER = re.compile(r"\A---\n(.*?\n)---\n", re.DOTALL)


def with_layout(src: str, engine: str) -> str:
    """The source with `config: layout: <engine>` in its frontmatter; any old layout replaced."""
    m = FRONTMATTER.match(src)
    if not m:
        return f"---\nconfig:\n  layout: {engine}\n---\n{src}"
    lines = m.group(1).splitlines(keepends=True)
    body = src[m.end():]
    out, i, placed = [], 0, False
    while i < len(lines):
        line = lines[i]
        out.append(line)
        if re.match(r"config\s*:\s*$", line):
            # Children of config: the following lines indented deeper than it.
            j = i + 1
            children = []
            while j < len(lines) and re.match(r"[ \t]+\S", lines[j]):
                children.append(lines[j])
                j += 1
            indent = re.match(r"[ \t]+", children[0]).group(0) if children else "  "
            kept = [c for c in children if not re.match(rf"{indent}layout\s*:", c)]
            out.append(f"{indent}layout: {engine}\n")
            out.extend(kept)
            placed = True
            i = j
            continue
        i += 1
    if not placed:
        out.append(f"config:\n  layout: {engine}\n")
    return "---\n" + "".join(out) + "---\n" + body


def png_size(path: Path) -> tuple[int, int] | None:
    data = path.read_bytes()[:24]
    if data[:8] != b"\x89PNG\r\n\x1a\n":
        return None
    return int.from_bytes(data[16:20], "big"), int.from_bytes(data[20:24], "big")


def main(argv: list[str]) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("source")
    ap.add_argument("--out-dir", default=None)
    ap.add_argument("--theme", default=None, help="a themes/<name>.json to render both candidates with")
    args = ap.parse_args(argv)

    src = Path(args.source).resolve()
    if not src.is_file():
        print(f"not a file: {src}", file=sys.stderr)
        return 2
    out_dir = Path(args.out_dir).resolve() if args.out_dir else src.parent
    out_dir.mkdir(parents=True, exist_ok=True)
    theme = [str(Path(args.theme).resolve())] if args.theme else []
    text = src.read_text(encoding="utf-8")
    if "defaultRenderer" in text:
        print("note  the source sets flowchart.defaultRenderer in an init block, which may override "
              "the layout set here; remove it to compare cleanly")

    bash = resolve_bash()
    made = []
    for engine in ENGINES:
        variant = out_dir / f"{src.stem}.layout-{engine}.mmd"
        png = out_dir / f"{src.stem}.{engine}.png"
        variant.write_text(with_layout(text, engine), encoding="utf-8")
        try:
            proc = subprocess.run([bash, str(RENDER), str(variant), str(png), *theme],
                                  capture_output=True, text=True)
        finally:
            variant.unlink(missing_ok=True)
        if proc.returncode != 0 or not png.is_file():
            print(f"FAIL  {engine}: {(proc.stderr or proc.stdout).strip()[:300]}")
            return 1
        made.append((engine, png, png_size(png)))

    print("--- layout comparison ---")
    for engine, png, size in made:
        if size:
            w, h = size
            print(f"  {engine:6s} {w:5d} x {h:5d}   ratio {max(w, h) / min(w, h):.1f}:1")
    if made[0][1].read_bytes() == made[1][1].read_bytes():
        print(f"  layout has no effect on {detect_diagram_type(text)}: the two PNGs are byte-identical, so")
        print("  there is nothing to choose. Keep the default. elk moves only flowchart, class, state,")
        print("  er, requirement and mindmap diagrams (mermaid 11.16.1). The render:")
        print(f"    {made[0][1]}")
        return 0
    print("  Aspect ratio does not pick the better layout -- elk won it on the Bitly review and")
    print("  still detoured an edge round the whole diagram. OPEN BOTH and choose by eye, then set")
    print("  `config: layout:` in the source's frontmatter if the winner is not the default:")
    for _, png, _ in made:
        print(f"    {png}")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
