"""Every diagram type renders in both zinc themes, on its theme's ground: scripts/gallery.py.

The corpus in lab/corpus/all-types/ holds one small sample per mermaid diagram type. On
2026-10-18 rendering it showed the zinc themes broke nine of the twenty-two types (white ER rows,
blank kanban cards, one-grey pies and radars, an invisible light timeline axis ...) while every
flowchart looked fine -- the only type anyone had checked. This test keeps all of them rendering;
looking at the contact sheets it writes is still the agent's job.
"""

import re
import subprocess
import sys
from pathlib import Path

SKILL = Path(__file__).resolve().parents[2]
SCRIPT = SKILL / "scripts" / "gallery.py"
CORPUS = SKILL / "lab" / "corpus" / "all-types"
ROOT_BG = re.compile(r"<svg\b[^>]*?style\s*=\s*([\"'])[^\"']*?background-color:\s*([^;\"']+)", re.I)
GROUND = {"zinc-light": "#ffffff", "zinc-dark": "#27272a"}


def _hex(value: str) -> str:
    value = value.strip().lower()
    m = re.fullmatch(r"rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)", value)
    return "#%02x%02x%02x" % tuple(int(n) for n in m.groups()) if m else value


def test_corpus_has_one_sample_per_type():
    assert len(list(CORPUS.glob("*.mmd"))) >= 22


def test_every_type_renders_in_both_themes_on_its_ground(tmp_path):
    result = subprocess.run([sys.executable, str(SCRIPT), "--out", str(tmp_path)], capture_output=True, text=True)
    assert result.returncode == 0, result.stdout[-1500:] + result.stderr[-500:]
    problems = []
    for src in sorted(CORPUS.glob("*.mmd")):
        for theme, ground in GROUND.items():
            png = tmp_path / theme / f"{src.stem}.png"
            svg = png.with_suffix(".svg")
            if not (png.is_file() and svg.is_file()):
                problems.append(f"{src.stem} [{theme}]: missing render")
                continue
            m = ROOT_BG.search(svg.read_text(encoding="utf-8", errors="replace"))
            if not m or _hex(m.group(2)) != ground:
                problems.append(f"{src.stem} [{theme}]: ground {m.group(2) if m else None}, expected {ground}")
    assert problems == []
    sheets = sorted((tmp_path / "sheets").glob("gallery-*.png"))
    assert sheets, "no contact sheets written"
    assert "open every sheet" in result.stdout.lower()
