"""Tests for scripts/compare_layouts.py: render with dagre and elk, keep both, pick neither.

No number picks the better layout. On a Bitly architecture review (2026-10-18) elk
gave the better canvas (2.2:1 against 4.6:1) and still sent the redirect edge on a
detour round the whole diagram -- the same thing elk did to the same diagram in D2,
where an aspect-ratio recommendation chose the worse layout twice. So the helper
keeps both candidates and says to open them; it must never recommend one.
"""

import subprocess
import sys
from pathlib import Path

SKILL = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(SKILL / "scripts"))
from compare_layouts import with_layout  # noqa: E402

SCRIPT = SKILL / "scripts" / "compare_layouts.py"

# A back-edge and a fan-out: enough structure that dagre and elk place it differently.
DIAGRAM = """---
title: Round trip
---
flowchart LR
  user([user]) -->|1 request| svc[service]
  svc -->|2 lookup| store[(store)]
  svc -->|3 reply| user
  svc -.->|publish| queue[[queue]]
  queue -.-> a[archive]
  queue -.-> b[analytics]
"""


def test_layout_is_added_to_a_source_without_frontmatter():
    out = with_layout("flowchart LR\n  A --> B\n", "elk")
    assert out.startswith("---\nconfig:\n  layout: elk\n---\n")
    assert out.endswith("flowchart LR\n  A --> B\n")


def test_layout_is_added_beside_an_existing_title():
    out = with_layout("---\ntitle: T\n---\nflowchart LR\n  A --> B\n", "elk")
    head = out.split("---\n")[1]
    assert "title: T\n" in head and "config:\n  layout: elk\n" in head


def test_layout_joins_an_existing_config_block_at_its_indent():
    src = "---\ntitle: T\nconfig:\n    theme: base\n---\nflowchart LR\n  A --> B\n"
    out = with_layout(src, "elk")
    assert "config:\n    layout: elk\n    theme: base\n" in out


def test_an_existing_layout_is_replaced_not_duplicated():
    src = "---\nconfig:\n  layout: elk\n---\nflowchart LR\n  A --> B\n"
    out = with_layout(src, "dagre")
    assert out.count("layout:") == 1 and "layout: dagre" in out


def test_both_candidates_are_kept_and_neither_is_recommended(tmp_path):
    src = tmp_path / "trip.mmd"
    src.write_text(DIAGRAM, encoding="utf-8")
    result = subprocess.run([sys.executable, str(SCRIPT), str(src)],
                            capture_output=True, text=True)
    assert result.returncode == 0, result.stdout + result.stderr
    pngs = {}
    for engine in ("dagre", "elk"):
        png = tmp_path / f"trip.{engine}.png"
        assert png.is_file() and png.stat().st_size > 0, f"{engine} PNG missing"
        assert png.with_suffix(".svg").is_file(), f"{engine} SVG missing"
        assert str(png) in result.stdout, f"{engine} PNG path not printed"
        pngs[engine] = png.read_bytes()
    assert pngs["dagre"] != pngs["elk"], "both candidates came out identical -- was elk applied?"
    out = result.stdout.lower()
    assert "open both" in out
    assert "no effect" not in out, "elk moved this diagram; 'no effect' would be a false claim"
    for verdict in ("recommend", "more balanced", "-> dagre", "-> elk"):
        assert verdict not in out, f"the helper must not pick a layout ({verdict!r} found)"
    assert not list(tmp_path.glob("*.layout-*.mmd")), "temporary variant sources left behind"


PIE = 'pie title Sources\n  "Social" : 45\n  "Email" : 25\n  "Other" : 30\n'


def test_identical_candidates_say_the_layout_has_no_effect(tmp_path):
    """elk changes six mermaid types (flowchart, class, state, er, requirement, mindmap;
    measured 2026-10-18 on 11.16.1). For the other sixteen, a pie among them, both candidates
    are the same picture, and "open both" sent the reader to compare two identical files."""
    src = tmp_path / "pie.mmd"
    src.write_text(PIE, encoding="utf-8")
    result = subprocess.run([sys.executable, str(SCRIPT), str(src)], capture_output=True, text=True)
    assert result.returncode == 0, result.stdout + result.stderr
    assert (tmp_path / "pie.dagre.png").read_bytes() == (tmp_path / "pie.elk.png").read_bytes()
    out = result.stdout.lower()
    assert "layout has no effect on pie" in out
    assert "open both" not in out
