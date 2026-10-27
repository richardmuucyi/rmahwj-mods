#!/usr/bin/env python3
"""Render every diagram genre in light and dark and lay them out as contact sheets.

Usage:
    python gallery.py --out DIR [--corpus DIR]

Renders each `.d2` in the corpus (default tests/all-types/, one sample per genre the skill
proposes) through render.py, then rasterizes every board twice through rasterize.py: once
light, once with --color-scheme dark. PNGs land in DIR/light/<stem>/ and DIR/dark/<stem>/,
one per board (a multi-board source gives several). Then it writes DIR/sheets/gallery-N.png:
one row per board, light and dark side by side.

Each pair is checked at the canvas corner: the light PNG must be light and the dark PNG dark.
A source with no dark theme fails that check on purpose. rasterize.py cannot invent a dark
set, so its "dark" PNG is light, and a reader in dark mode would get a white slab.

Why it exists: on 2026-10-18 a Mermaid theme broke nine of twenty-two diagram types while
every flowchart looked fine, because flowcharts were the only type anyone looked at. Render
the lot after any change to themes, classes or the shared palette, then OPEN EVERY SHEET:
a render that exits 0 says nothing about whether its labels can be read.

Exit 0 when every source rendered and every corner was right, 1 otherwise.
"""

from __future__ import annotations

import argparse
import subprocess
import sys
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

HERE = Path(__file__).resolve().parent
SKILL = HERE.parent

ROWS_PER_SHEET = 4
THUMB = (640, 480)


def corner(png: Path) -> str:
    """LIGHT or DARK from a canvas-corner pixel; BLANK when nothing was drawn."""
    from PIL import Image

    img = Image.open(png).convert("RGB")
    lo, hi = img.convert("L").getextrema()
    if hi - lo < 60:
        return "BLANK"
    r, g, b = img.getpixel((2, 2))
    return "LIGHT" if 0.299 * r + 0.587 * g + 0.114 * b > 128 else "DARK"


def _reason(proc: subprocess.CompletedProcess) -> str:
    lines = [l.strip() for l in (proc.stdout + proc.stderr).splitlines() if l.strip() and not l.startswith("---")]
    return next((l for l in lines if l.startswith("err:")), lines[-1] if lines else "no output")[:200]


def render_one(src: Path, out: Path) -> tuple[list[str], list[str]]:
    """Render one source; return (board names, failures)."""
    svg = out / "svg" / f"{src.stem}.svg"
    svg.parent.mkdir(parents=True, exist_ok=True)
    proc = subprocess.run([sys.executable, str(HERE / "render.py"), str(src), "-o", str(svg)],
                          capture_output=True, text=True, errors="replace", cwd=src.parent)
    if proc.returncode != 0:
        return [], [f"{src.stem}: render failed: {_reason(proc)}"]
    # A multi-board source writes a directory named after the output, without the extension.
    boards = [svg] if svg.is_file() else sorted(svg.with_suffix("").rglob("*.svg"))
    if not boards:
        return [], [f"{src.stem}: render exited 0 and wrote no SVG"]
    failures = []
    for scheme in ("light", "dark"):
        proc = subprocess.run([sys.executable, str(HERE / "rasterize.py"), *map(str, boards), "--scale", "1",
                               "--color-scheme", scheme, "--out-dir", str(out / scheme / src.stem)],
                              capture_output=True, text=True, errors="replace")
        if proc.returncode != 0:
            failures.append(f"{src.stem}: {scheme} rasterize failed: {_reason(proc)}")
    names = []
    for board in boards:
        name = board.stem
        names.append(f"{src.stem}/{name}")
        for scheme, want in (("light", "LIGHT"), ("dark", "DARK")):
            png = out / scheme / src.stem / f"{name}.png"
            got = corner(png) if png.is_file() else "NO PNG"
            if got != want:
                label = src.stem if name == src.stem else f"{src.stem}/{name}"
                hint = " (no dark theme? set dark-theme-id)" if scheme == "dark" and got == "LIGHT" else ""
                failures.append(f"{label}: {scheme} PNG is {got}, expected {want}{hint}")
    return names, failures


def contact_sheets(boards: list[str], out: Path) -> list[Path]:
    from PIL import Image, ImageDraw, ImageFont

    font = ImageFont.load_default()
    sheets = []
    for n, start in enumerate(range(0, len(boards), ROWS_PER_SHEET), 1):
        cells = []
        for board in boards[start:start + ROWS_PER_SHEET]:
            thumbs = []
            for scheme in ("light", "dark"):
                try:
                    im = Image.open(out / scheme / f"{board}.png").convert("RGBA")
                    under = Image.new("RGBA", im.size, (128, 128, 128, 255))  # grey shows a missing ground
                    under.alpha_composite(im)
                    im = under.convert("RGB")
                    im.thumbnail(THUMB)
                except OSError:
                    im = Image.new("RGB", (THUMB[0], 120), (255, 180, 180))
                thumbs.append(im)
            cell = Image.new("RGB", (2 * (THUMB[0] + 10) + 10, max(t.height for t in thumbs) + 30), (90, 90, 90))
            ImageDraw.Draw(cell).text((8, 7), f"{board}   light | dark", fill=(255, 255, 255), font=font)
            for i, t in enumerate(thumbs):
                cell.paste(t, (10 + i * (THUMB[0] + 10), 26))
            cells.append(cell)
        sheet = Image.new("RGB", (max(c.width for c in cells), sum(c.height for c in cells)), (60, 60, 60))
        y = 0
        for c in cells:
            sheet.paste(c, (0, y))
            y += c.height
        path = out / "sheets" / f"gallery-{n}.png"
        path.parent.mkdir(parents=True, exist_ok=True)
        sheet.save(path)
        sheets.append(path)
    return sheets


def main(argv: list[str]) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--out", required=True)
    ap.add_argument("--corpus", default=str(SKILL / "tests" / "all-types"))
    args = ap.parse_args(argv)
    corpus, out = Path(args.corpus).resolve(), Path(args.out).resolve()
    sources = sorted(corpus.glob("*.d2"))
    with ThreadPoolExecutor(4) as ex:
        results = list(ex.map(lambda s: render_one(s, out), sources))
    boards = [b for names, _ in results for b in names]
    failures = [f for _, fails in results for f in fails]
    sheets = contact_sheets(boards, out) if boards else []
    print(f"rendered {sum(1 for names, _ in results if names)}/{len(sources)} sources, {len(boards)} boards")
    for f in failures:
        print(f"FAIL  {f}")
    print("Exit 0 says every genre rendered with the right ground, not that it reads well. OPEN EVERY SHEET:")
    for s in sheets:
        print(f"  {s}")
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
