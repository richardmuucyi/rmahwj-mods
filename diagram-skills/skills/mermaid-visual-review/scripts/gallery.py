#!/usr/bin/env python3
"""Render every diagram type in every zinc theme and lay them out as contact sheets.

Usage:
    python gallery.py --out DIR [--corpus DIR] [--themes zinc-light zinc-dark]

Renders each `.mmd` in the corpus (default lab/corpus/all-types/, one sample per mermaid
diagram type) through render.sh with each theme, into DIR/<theme>/<stem>.png and .svg, then
writes DIR/sheets/gallery-N.png: one row per type, the themes side by side.

Why it exists: on 2026-10-18 the zinc themes broke nine of the twenty-two types -- white ER rows,
blank kanban cards, one-grey pies and radars, an invisible light timeline axis -- while every
flowchart looked fine, because flowcharts were the only type anyone looked at. Render the lot
after any theme change, then OPEN EVERY SHEET: a render that exits 0 says nothing about whether
its labels can be read.

Exit 0 when every render succeeded, 1 otherwise.
"""

from __future__ import annotations

import argparse
import subprocess
import sys
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

HERE = Path(__file__).resolve().parent
SKILL = HERE.parent
sys.path.insert(0, str(HERE / "toolchain"))
from versions import resolve_bash  # noqa: E402

ROWS_PER_SHEET = 4
THUMB = (640, 480)


def render_all(corpus: Path, out: Path, themes: list[str]) -> list[str]:
    bash = resolve_bash()
    jobs = [(src, theme) for src in sorted(corpus.glob("*.mmd")) for theme in themes]

    def one(job):
        src, theme = job
        png = out / theme / f"{src.stem}.png"
        png.parent.mkdir(parents=True, exist_ok=True)
        r = subprocess.run([bash, str(HERE / "render.sh"), str(src), str(png), str(SKILL / "themes" / f"{theme}.json")],
                           capture_output=True, text=True)
        if r.returncode == 0 and png.is_file():
            return None
        lines = (r.stderr or r.stdout).strip().splitlines()
        reason = next((l.strip() for l in lines if "rror" in l), lines[-1] if lines else "no output")
        return f"{src.stem} [{theme}]: {reason[:200]}"

    with ThreadPoolExecutor(4) as ex:
        return [f for f in ex.map(one, jobs) if f]


def contact_sheets(corpus: Path, out: Path, themes: list[str]) -> list[Path]:
    from PIL import Image, ImageDraw, ImageFont

    font = ImageFont.load_default()
    stems = [p.stem for p in sorted(corpus.glob("*.mmd"))]
    sheets = []
    for n, start in enumerate(range(0, len(stems), ROWS_PER_SHEET), 1):
        cells = []
        for stem in stems[start:start + ROWS_PER_SHEET]:
            thumbs = []
            for theme in themes:
                try:
                    im = Image.open(out / theme / f"{stem}.png").convert("RGBA")
                    under = Image.new("RGBA", im.size, (128, 128, 128, 255))  # grey shows a missing ground
                    under.alpha_composite(im)
                    im = under.convert("RGB")
                    im.thumbnail(THUMB)
                except OSError:
                    im = Image.new("RGB", (THUMB[0], 120), (255, 180, 180))
                thumbs.append(im)
            cell = Image.new("RGB", (len(themes) * (THUMB[0] + 10) + 10, max(t.height for t in thumbs) + 30), (90, 90, 90))
            ImageDraw.Draw(cell).text((8, 7), f"{stem}   " + " | ".join(themes), fill=(255, 255, 255), font=font)
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
    ap.add_argument("--corpus", default=str(SKILL / "lab" / "corpus" / "all-types"))
    ap.add_argument("--themes", nargs="+", default=["zinc-light", "zinc-dark"])
    args = ap.parse_args(argv)
    corpus, out = Path(args.corpus).resolve(), Path(args.out).resolve()
    failures = render_all(corpus, out, args.themes)
    sheets = contact_sheets(corpus, out, args.themes)
    total = len(list(corpus.glob("*.mmd"))) * len(args.themes)
    print(f"rendered {total - len(failures)}/{total}")
    for f in failures:
        print(f"FAIL  {f}")
    print("Exit 0 says every type rendered, not that it reads well. OPEN EVERY SHEET:")
    for s in sheets:
        print(f"  {s}")
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
