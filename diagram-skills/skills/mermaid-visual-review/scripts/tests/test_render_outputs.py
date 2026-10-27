"""render.sh must produce BOTH a PNG (for the agent to inspect) and an SVG
(the artefact written into the note). Same source, one invocation."""

from __future__ import annotations

import os
import re
import shutil
import subprocess
import sys
from pathlib import Path

import pytest

SKILL = Path(__file__).resolve().parents[2]
RENDER = SKILL / "scripts" / "render.sh"

DIAGRAM = "flowchart LR\n  A[Start] --> B[End]\n"


def _bash() -> str:
    """Git Bash, explicitly -- NOT whatever `bash` resolves to first.

    On Windows, subprocess's implicit interpreter search for a bare "bash"
    can resolve to C:\\Windows\\System32\\bash.exe -- the WSL launcher --
    ahead of Git Bash, even though `shutil.which("bash")` alone reports Git
    Bash (CreateProcess's own search order does not match PATH order). WSL
    mounts the C: drive at /mnt/c, so it reads the Windows-style path we hand
    it as nonexistent and exits 127 with "No such file or directory" naming
    a file that is plainly there. Identical failure signature already hit
    and fixed in another script's `_bash()`. Git Bash is
    checked first so the working interpreter wins; System32 is rejected
    outright rather than used as a fallback, because it fails in a way that
    looks like a missing file.
    """
    if os.name != "nt":
        return shutil.which("bash") or "bash"
    for c in (r"C:\Program Files\Git\bin\bash.exe",
              r"C:\Program Files\Git\usr\bin\bash.exe",
              shutil.which("bash")):
        if c and os.path.exists(c) and "system32" not in c.lower():
            return c
    raise RuntimeError(
        "Git Bash not found; render.sh needs it on Windows "
        "(WSL bash cannot resolve Windows-style paths)")


BASH = _bash()


def test_render_emits_png_and_svg(tmp_path):
    src = tmp_path / "d.mmd"
    src.write_text(DIAGRAM, encoding="utf-8")
    png = tmp_path / "d.png"
    result = subprocess.run(
        [BASH, str(RENDER), str(src), str(png)],
        capture_output=True,
        text=True,
    )
    assert result.returncode == 0, result.stderr
    assert png.exists() and png.stat().st_size > 0
    svg = png.with_suffix(".svg")
    assert svg.exists() and svg.stat().st_size > 0, "sibling SVG was not written"


def test_emitted_svg_has_transparent_background(tmp_path):
    src = tmp_path / "d.mmd"
    src.write_text(DIAGRAM, encoding="utf-8")
    png = tmp_path / "d.png"
    subprocess.run([BASH, str(RENDER), str(src), str(png)], check=True)
    checker = SKILL / "evals" / "assertions" / "check_no_white_bg.py"
    result = subprocess.run(
        [sys.executable, str(checker), str(png.with_suffix(".svg"))],
        capture_output=True,
        text=True,
    )
    assert result.returncode == 0, result.stdout


ROOT_BG = re.compile(r"<svg\b[^>]*?style\s*=\s*([\"'])[^\"']*?background-color:\s*([^;\"']+)", re.I)


@pytest.mark.parametrize("theme, ground", [("zinc-light", "#ffffff"), ("zinc-dark", "#27272a")])
def test_themed_render_takes_its_ground_from_the_theme_kind(tmp_path, theme, ground):
    """A themed render must carry its theme's ground, in the SVG and the PNG alike.

    Transparent themed renders were claimed to "adapt to whatever page they land
    on". They do not: zinc-light on a dark page lost its title (dark ink on a dark
    ground) and turned every edge label into a white patch (measured 2026-10-18).
    The ground follows the theme's `kind`, so a dark theme can never get white.
    """
    src = tmp_path / "d.mmd"
    src.write_text(DIAGRAM, encoding="utf-8")
    png = tmp_path / "d.png"
    result = subprocess.run(
        [BASH, str(RENDER), str(src), str(png), str(SKILL / "themes" / f"{theme}.json")],
        capture_output=True,
        text=True,
    )
    assert result.returncode == 0, result.stderr
    svg_text = png.with_suffix(".svg").read_text(encoding="utf-8", errors="replace")
    m = ROOT_BG.search(svg_text)
    assert m, "themed SVG root declares no background-color"
    # mmdc rewrites the -b value as rgb(r, g, b) in the SVG, so compare as hex.
    value = m.group(2).strip().lower()
    rgb = re.fullmatch(r"rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)", value)
    if rgb:
        value = "#%02x%02x%02x" % tuple(int(n) for n in rgb.groups())
    assert value == ground
    from PIL import Image
    r, g, b, a = Image.open(png).convert("RGBA").getpixel((1, 1))
    assert a == 255, "themed PNG corner is still transparent"
    assert "#%02x%02x%02x" % (r, g, b) == ground


TYPE_SAMPLES = {
    "er": "erDiagram\n  LINK ||--o{ CLICK : receives\n  LINK {\n    string code PK\n    string long_url\n  }\n",
    "xychart": 'xychart-beta\n  x-axis [Mon, Tue]\n  y-axis "Clicks" 0 --> 10\n  bar [3, 7]\n',
    "kanban": "kanban\n  todo[To do]\n    t1[Custom domains]\n",
    "radar": 'radar-beta\n  axis s["Scale"], c["Cost"], l["Latency"]\n  curve a["A"]{3, 2, 4}\n',
    "packet": "---\ntitle: probe\n---\npacket-beta\n  0-15: \"Source port\"\n",
}


@pytest.mark.parametrize("kind, theme, pattern", [
    ("er", "zinc-dark", r'class="row-rect-odd"><path[^>]*fill="#2E2E31"'),
    ("xychart", "zinc-dark", r'class="background" fill="#27272A"'),
    ("xychart", "zinc-light", r'class="background" fill="#FFFFFF"'),
    ("kanban", "zinc-dark", r"\.node path\{fill:#27272A"),
    ("kanban", "zinc-light", r"\.node path\{fill:#FFFFFF"),
    ("radar", "zinc-dark", r"\.radarGraticule\{fill:#78787f"),
    ("packet", "zinc-dark", r"\.packetTitle\{fill:#F4F4F5"),
])
def test_type_theme_variables_reach_the_render(tmp_path, kind, theme, pattern):
    """Each type-specific theme variable must change the SVG, not just sit in the JSON.

    Probed 2026-10-18 on mermaid 11.16.1. Before these keys, zinc-dark drew ER rows
    hsl(240,3.7%,90.9%) under light text, kanban cards and the xychart background #f4f4f4,
    radar rings #DEDEDE and the packet title black on the dark ground. A mermaid upgrade that
    stops honouring one of them fails here instead of shipping a broken dark render.
    """
    src = tmp_path / f"{kind}.mmd"
    src.write_text(TYPE_SAMPLES[kind], encoding="utf-8")
    png = tmp_path / f"{kind}.png"
    result = subprocess.run(
        [BASH, str(RENDER), str(src), str(png), str(SKILL / "themes" / f"{theme}.json")],
        capture_output=True, text=True)
    assert result.returncode == 0, result.stderr
    svg = png.with_suffix(".svg").read_text(encoding="utf-8", errors="replace").replace("\n", "")
    assert re.search(pattern, svg), f"{kind} in {theme}: {pattern!r} not in the render"


PALETTE_SAMPLES = {
    "pie": 'pie title Sources\n  "Social" : 45\n  "Email" : 25\n',
    "timeline": "timeline\n  title Storage\n  For years : MySQL\n  2023 : Bigtable\n",
    "packet": TYPE_SAMPLES["packet"],
    "xychart": TYPE_SAMPLES["xychart"],
}


def _themed_svg(tmp_path, kind, theme):
    src = tmp_path / f"{kind}-{theme}.mmd"
    src.write_text(PALETTE_SAMPLES[kind], encoding="utf-8")
    png = tmp_path / f"{kind}-{theme}.png"
    result = subprocess.run([BASH, str(RENDER), str(src), str(png), str(SKILL / "themes" / f"{theme}.json")],
                            capture_output=True, text=True)
    assert result.returncode == 0, result.stderr
    return png.with_suffix(".svg").read_text(encoding="utf-8", errors="replace").replace("\n", "")


@pytest.mark.parametrize("theme, first", [("zinc-light", "#4E78A6"), ("zinc-dark", "#5B86B3")])
def test_palette_reaches_pie_and_xychart(tmp_path, theme, first):
    """Slices and bars take the theme's palette, and a full xyChart object keeps the ground
    (a partial one drew a white chart in zinc-dark during the palette preview)."""
    assert f'fill="{first}"' in _themed_svg(tmp_path, "pie", theme)
    xy = _themed_svg(tmp_path, "xychart", theme)
    assert f'fill="{first}"' in xy
    ground = "#FFFFFF" if theme == "zinc-light" else "#27272A"
    assert f'class="background" fill="{ground}"' in xy


@pytest.mark.parametrize("theme", ["zinc-light", "zinc-dark"])
def test_theme_css_wins_the_timeline_axis_and_packet_blocks(tmp_path, theme):
    """Mermaid emits twelve `.lineWrapper line` rules in the section label colour (white in
    zinc-light: an invisible axis). The theme's themeCSS comes last, so the axis is lineColor."""
    rules = re.findall(r"\.lineWrapper line\{[^}]*\}", _themed_svg(tmp_path, "timeline", theme))
    assert rules and rules[-1] == ".lineWrapper line{stroke:rgb(147, 147, 148);}", rules[-1:]
    blocks = re.findall(r"\.packetBlock\{[^}]*\}", _themed_svg(tmp_path, "packet", theme))
    fill = "rgb(248, 248, 249)" if theme == "zinc-light" else "rgb(46, 46, 49)"
    assert blocks and f"fill:{fill}" in blocks[-1], blocks


PNG_MAGIC = b"\x89PNG\r\n\x1a\n"


def test_forwarded_format_flag_cannot_corrupt_the_svg(tmp_path):
    """`-e png` forwarded via "$@" must not make the .svg deliverable a PNG.

    mmdc's -e/--outputFormat overrides extension inference, and "$@" reaches
    both invocations. Without an explicit `-e svg` on the SVG render this
    silently produced a PNG named .svg, exit 0, no warning.
    """
    src = tmp_path / "d.mmd"
    src.write_text(DIAGRAM, encoding="utf-8")
    png = tmp_path / "d.png"
    result = subprocess.run(
        [BASH, str(RENDER), str(src), str(png), "-e", "png"],
        capture_output=True,
        text=True,
    )
    assert result.returncode == 0, result.stderr
    svg = png.with_suffix(".svg")
    assert svg.exists(), "sibling SVG was not written"
    head = svg.read_bytes()[:8]
    assert head != PNG_MAGIC, "the .svg deliverable is actually a PNG"
    assert b"<svg" in svg.read_bytes()[:512] or b"<?xml" in svg.read_bytes()[:512]


def test_failed_render_leaves_no_stray_svg(tmp_path):
    """A broken source must fail at the first render under `set -euo pipefail`
    and never leave a half-produced .svg behind for a later step to pick up."""
    src = tmp_path / "broken.mmd"
    src.write_text("this is not valid mermaid at all\n", encoding="utf-8")
    png = tmp_path / "broken.png"
    result = subprocess.run(
        [BASH, str(RENDER), str(src), str(png)],
        capture_output=True,
        text=True,
    )
    assert result.returncode != 0, "broken source should not render successfully"
    assert not png.with_suffix(".svg").exists(), "stray SVG left behind after failure"


HARDCODED_SAMPLES = {
    "c4": ('C4Context\n  Person(user, "User")\n  System(svc, "Link service")\n  System_Ext(ext, "Analytics")\n'
           '  Rel(user, svc, "opens link")\n'),
    "sankey": "sankey-beta\n\nSocial,Clicks,45\nEmail,Clicks,25\n",
    "gantt": "gantt\n  dateFormat YYYY-MM-DD\n  section A\n    One :a1, 2023-01-02, 7d\n",
}


def test_dark_theme_css_repaints_c4_sankey_and_gantt(tmp_path):
    """The repaints must reach the render, last, where they win the cascade (test_theme_contrast
    holds their colours). Probed 2026-10-18: before them, zinc-dark drew C4 relationship text
    #444444 on #27272A (1.92:1), sankey links multiplied to near-black and gantt grid lines black,
    and in both themes the external-system box carried white text on #999999 (2.85:1)."""
    PALETTE_SAMPLES.update(HARDCODED_SAMPLES)
    c4 = _themed_svg(tmp_path, "c4", "zinc-dark")
    rules = re.findall(r'text\[fill="#444444"\]\{([^}]*)\}', c4)
    assert rules and "fill" in rules[-1], "no C4 relationship-label repaint in the dark render"
    for theme in ("zinc-light", "zinc-dark"):
        boxes = re.findall(r'person-man:has\(\[fill="#999999"\]\) text[^{]*\{([^}]*)\}', _themed_svg(tmp_path, "c4", theme))
        assert boxes and "fill" in boxes[-1], f"no dark text for the external-system box in {theme}"
    sankey = _themed_svg(tmp_path, "sankey", "zinc-dark")
    links = re.findall(r"\.link\{([^}]*)\}", sankey)
    assert links and re.search(r"mix-blend-mode:\s*normal\s*!important", links[-1]), links[-1:]
    for theme in ("zinc-light", "zinc-dark"):
        grid = re.findall(r"\.grid \.tick line\{([^}]*)\}", _themed_svg(tmp_path, "gantt", theme))
        assert grid and "stroke" in grid[-1], f"no gantt grid repaint in {theme}"
