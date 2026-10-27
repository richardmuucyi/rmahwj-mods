"""Every theme in themes/*.json must hold the contrast floors a reader needs.

Borders and lines need 3:1 against what they sit on; text needs 4.5:1. Until
2026-10-18 both zinc themes drew node and group borders at 1.4-2.0:1 (zinc-light
`#d3d3d5`, zinc-dark `#52525B`) and zinc-light's muted text at 4.19:1. The
fresh-eyes reviewer flagged the faint group borders on its own, and they vanish
when an SVG is scaled down to a note pane.

Each colour is judged against the surface it is actually drawn on: a node border
against the node fill, a group border against the group fill, edges and free text
against the page ground. The ground comes from the theme's `kind` through
`merge_theme.ground_for`, the same function render.sh uses, so the test and the
render cannot disagree about it.
"""

import json
import math
import re
import sys
from pathlib import Path

import pytest

SKILL = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(SKILL / "scripts"))
from merge_theme import ground_for  # noqa: E402

THEMES = sorted((SKILL / "themes").glob("*.json"))
LINE = 3.0
TEXT = 4.5
PACKET_BLOCK_FILL = "#efefef"  # mermaid's packet default; themeVariables cannot change it in 11.16.1


def luminance(colour: str) -> float:
    h = colour.lstrip("#")
    if len(h) == 3:
        h = "".join(c * 2 for c in h)
    channels = []
    for i in (0, 2, 4):
        c = int(h[i:i + 2], 16) / 255
        channels.append(c / 12.92 if c <= 0.03928 else ((c + 0.055) / 1.055) ** 2.4)
    return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2]


def contrast(a: str, b: str) -> float:
    hi, lo = sorted([luminance(a), luminance(b)], reverse=True)
    return (hi + 0.05) / (lo + 0.05)


def pairs(theme: dict) -> list:
    """(what, colour, surface, floor) for every themed colour a reader has to see."""
    v = theme["themeVariables"]
    ground = ground_for(theme)
    return [
        ("primaryBorderColor on primaryColor", v["primaryBorderColor"], v["primaryColor"], LINE),
        ("secondaryBorderColor on secondaryColor", v["secondaryBorderColor"], v["secondaryColor"], LINE),
        ("tertiaryBorderColor on tertiaryColor", v["tertiaryBorderColor"], v["tertiaryColor"], LINE),
        ("clusterBorder on clusterBkg", v["clusterBorder"], v["clusterBkg"], LINE),
        ("noteBorderColor on noteBkgColor", v["noteBorderColor"], v["noteBkgColor"], LINE),
        ("lineColor on ground", v["lineColor"], ground, LINE),
        ("primaryTextColor on primaryColor", v["primaryTextColor"], v["primaryColor"], TEXT),
        ("secondaryTextColor on secondaryColor", v["secondaryTextColor"], v["secondaryColor"], TEXT),
        ("tertiaryTextColor on tertiaryColor", v["tertiaryTextColor"], v["tertiaryColor"], TEXT),
        ("noteTextColor on noteBkgColor", v["noteTextColor"], v["noteBkgColor"], TEXT),
        ("textColor on ground", v["textColor"], ground, TEXT),
        ("textColor on edgeLabelBackground", v["textColor"], v["edgeLabelBackground"], TEXT),
        ("titleColor on ground", v["titleColor"], ground, TEXT),
    ]


def failures(theme: dict) -> list:
    return [f"{what}: {colour} on {surface} is {contrast(colour, surface):.2f}, needs {floor}"
            for what, colour, surface, floor in pairs(theme) if contrast(colour, surface) < floor]


def test_there_are_themes_to_check():
    assert len(THEMES) >= 2, f"expected the zinc themes in {SKILL / 'themes'}"


@pytest.mark.parametrize("path", THEMES, ids=lambda p: p.stem)
def test_theme_holds_the_contrast_floors(path):
    theme = json.loads(path.read_text(encoding="utf-8"))
    assert failures(theme) == []


def test_the_check_catches_the_old_faint_zinc_light():
    """Negative control: zinc-light as it stood before 2026-10-18 must fail, on exactly
    the borders and the muted text, and on nothing else."""
    old = {"kind": "light", "themeVariables": {
        "mainBkg": "#f8f8f9", "primaryColor": "#f8f8f9", "primaryBorderColor": "#d3d3d5",
        "primaryTextColor": "#27272A", "secondaryColor": "#f6f6f7", "secondaryBorderColor": "#d3d3d5",
        "secondaryTextColor": "#27272A", "tertiaryColor": "#f6f6f7", "tertiaryBorderColor": "#d3d3d5",
        "tertiaryTextColor": "#76767a", "lineColor": "#939394", "textColor": "#27272A",
        "titleColor": "#27272A", "edgeLabelBackground": "#FFFFFF", "clusterBkg": "#f6f6f7",
        "clusterBorder": "#d3d3d5", "noteBkgColor": "#f6f6f7", "noteBorderColor": "#d3d3d5",
        "noteTextColor": "#27272A"}}
    failed = {f.split(":")[0] for f in failures(old)}
    assert failed == {
        "primaryBorderColor on primaryColor", "secondaryBorderColor on secondaryColor",
        "tertiaryBorderColor on tertiaryColor", "clusterBorder on clusterBkg",
        "noteBorderColor on noteBkgColor", "tertiaryTextColor on tertiaryColor"}


def type_pairs(theme: dict) -> list:
    """(what, colour, surface, floor) for surfaces outside the flowchart family.

    Each key is one the pinned mermaid (11.16.1) actually reads, confirmed in its source on
    2026-10-18: ER rows from `rowOdd`/`rowEven` (unified renderer), kanban cards filled with
    `background`, the `packet` object, `archGroupBorderColor`. A missing key is a failure,
    because mermaid then derives the colour -- and its derivations produced the white ER rows,
    blank kanban cards and invisible packet title seen in zinc-dark.
    """
    v = theme["themeVariables"]
    g = ground_for(theme)
    packet = v.get("packet") or {}
    return [
        ("textColor on rowOdd (ER rows)", v.get("textColor"), v.get("rowOdd"), TEXT),
        ("textColor on rowEven (ER rows)", v.get("textColor"), v.get("rowEven"), TEXT),
        ("textColor on background (kanban cards)", v.get("textColor"), v.get("background"), TEXT),
        # mermaid's directive sanitizer drops packet.blockFillColor and friends, so
        # the block fill is #efefef unless the theme's themeCSS paints it: judge the label on that.
        ("packet labelColor on the drawn block fill", packet.get("labelColor"), packet_block_fill(theme), TEXT),
        ("packet titleColor on ground", packet.get("titleColor"), g, TEXT),
        ("archGroupBorderColor on ground", v.get("archGroupBorderColor"), g, LINE),
    ]


def css_value(theme: dict, selector: str, prop: str) -> str | None:
    """The value `prop` ends up with for `selector` in the theme's themeCSS, or None.

    Every rule whose selector list names `selector` is read and the LAST declaration wins, as in
    the CSS cascade -- reading only the first matching rule missed `.treemapLeaf{stroke:...}`
    declared after `.treemapLeaf,.treemapSection{fill-opacity:1;}`.
    """
    value = None
    for m in re.finditer(r"([^{}]+)\{([^}]*)\}", theme.get("themeCSS") or ""):
        if selector not in [s.strip() for s in m.group(1).split(",")]:
            continue
        for p in re.finditer(r"(?:^|;)\s*" + re.escape(prop) + r"\s*:\s*([^;]+)", m.group(2)):
            value = p.group(1).strip()
    return value


def packet_block_fill(theme: dict) -> str:
    return css_value(theme, ".packetBlock", "fill") or PACKET_BLOCK_FILL


def type_failures(theme: dict) -> list:
    out = []
    for what, colour, surface, floor in type_pairs(theme):
        if not colour or not surface:
            out.append(f"{what}: missing")
        elif contrast(colour, surface) < floor:
            out.append(f"{what}: {colour} on {surface} is {contrast(colour, surface):.2f}, needs {floor}")
    return out


@pytest.mark.parametrize("path", THEMES, ids=lambda p: p.stem)
def test_theme_covers_the_other_diagram_types(path):
    theme = json.loads(path.read_text(encoding="utf-8"))
    assert type_failures(theme) == []


@pytest.mark.parametrize("path", THEMES, ids=lambda p: p.stem)
def test_background_is_the_page_ground(path):
    """`background` feeds xychart's chart fill and kanban's cards. Unset, mermaid uses #f4f4f4 --
    a light chart under light text in zinc-dark. It must equal the ground render.sh paints."""
    theme = json.loads(path.read_text(encoding="utf-8"))
    assert theme["themeVariables"].get("background", "").lower() == ground_for(theme).lower()


@pytest.mark.parametrize("path", THEMES, ids=lambda p: p.stem)
def test_dark_mode_flag_matches_the_kind(path):
    """Without `darkMode: true`, mermaid derives a dark theme's git and cScale colours with its
    light-mode rules (darken 25%), which drew black branch lines on the zinc-dark ground."""
    theme = json.loads(path.read_text(encoding="utf-8"))
    assert bool(theme["themeVariables"].get("darkMode")) is (theme["kind"] == "dark")


def test_the_type_check_catches_zinc_dark_as_it_stood():
    """Negative control: zinc-dark before step 1 (flowchart surfaces only) must fail on every
    type surface -- and a packet left at mermaid's defaults must fail on contrast, not just absence."""
    old = {"kind": "dark", "themeVariables": {"textColor": "#E4E4E7", "mainBkg": "#27272A"}}
    failed = {f.split(":")[0] for f in type_failures(old)}
    assert failed == {what for what, *_ in type_pairs(old)}
    defaults = {"kind": "dark", "themeVariables": {"textColor": "#E4E4E7", "rowOdd": "#2E2E31",
        "rowEven": "#27272A", "background": "#27272A", "archGroupBorderColor": "#78787f",
        "packet": {"labelColor": "#000000", "titleColor": "#000000"}}}  # mermaid's "black" defaults
    failed = {f.split(":")[0] for f in type_failures(defaults)}
    assert failed == {"packet titleColor on ground"}
    light_label = {"kind": "dark", "themeVariables": {**defaults["themeVariables"],
        "packet": {"labelColor": "#E4E4E7", "titleColor": "#F4F4F5"}}}  # light label, no block CSS
    assert {f.split(":")[0] for f in type_failures(light_label)} == {"packet labelColor on the drawn block fill"}


def test_ground_comes_from_the_kind():
    assert ground_for({"kind": "light"}) == "#FFFFFF"
    assert ground_for({"kind": "dark"}) == "#27272A"
    for bad in ({"kind": "sepia"}, {}):
        with pytest.raises(ValueError):
            ground_for(bad)


# --- categorical colours: pie, cScale (mindmap, timeline, kanban, radar, journey), git, xyChart --------
# Before 2026-10-18 the zinc themes set none of these, so mermaid derived them from the grey node
# fill: every pie slice and radar curve one grey, black git lines in dark, pale cream xychart bars.
# The palette is Tableau 10, lightness tuned per theme (picked from three candidates).

DISTINCT = 15.0  # minimum CIEDE2000 between any two of the first six categorical hues
XY_TEXT = ["titleColor", "dataLabelColor", "xAxisTitleColor", "xAxisLabelColor", "yAxisTitleColor", "yAxisLabelColor"]
XY_LINES = ["xAxisTickColor", "xAxisLineColor", "yAxisTickColor", "yAxisLineColor"]


def _lab(colour: str) -> tuple:
    h = colour.lstrip("#")
    c = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    c = [x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4 for x in c]
    x = (c[0] * 0.4124 + c[1] * 0.3576 + c[2] * 0.1805) / 0.95047
    y = c[0] * 0.2126 + c[1] * 0.7152 + c[2] * 0.0722
    z = (c[0] * 0.0193 + c[1] * 0.1192 + c[2] * 0.9505) / 1.08883
    f = lambda t: t ** (1 / 3) if t > 0.008856 else 7.787 * t + 16 / 116
    return 116 * f(y) - 16, 500 * (f(x) - f(y)), 200 * (f(y) - f(z))


def de2000(c1: str, c2: str) -> float:
    """CIEDE2000 colour difference -- how different two colours look, not how they differ in RGB."""
    L1, a1, b1 = _lab(c1)
    L2, a2, b2 = _lab(c2)
    Cb = (math.hypot(a1, b1) + math.hypot(a2, b2)) / 2
    G = 0.5 * (1 - math.sqrt(Cb ** 7 / (Cb ** 7 + 25 ** 7)))
    a1p, a2p = (1 + G) * a1, (1 + G) * a2
    C1p, C2p = math.hypot(a1p, b1), math.hypot(a2p, b2)
    h1p, h2p = math.degrees(math.atan2(b1, a1p)) % 360, math.degrees(math.atan2(b2, a2p)) % 360
    dh = 0 if C1p * C2p == 0 else (h2p - h1p if abs(h2p - h1p) <= 180 else
                                   h2p - h1p - 360 if h2p > h1p else h2p - h1p + 360)
    dH = 2 * math.sqrt(C1p * C2p) * math.sin(math.radians(dh / 2))
    Lb, Cbp = (L1 + L2) / 2, (C1p + C2p) / 2
    hb = (h1p + h2p) / 2 if abs(h1p - h2p) <= 180 else ((h1p + h2p + 360) / 2 if h1p + h2p < 360 else (h1p + h2p - 360) / 2)
    T = (1 - 0.17 * math.cos(math.radians(hb - 30)) + 0.24 * math.cos(math.radians(2 * hb))
         + 0.32 * math.cos(math.radians(3 * hb + 6)) - 0.20 * math.cos(math.radians(4 * hb - 63)))
    Rc = 2 * math.sqrt(Cbp ** 7 / (Cbp ** 7 + 25 ** 7))
    Sl = 1 + 0.015 * (Lb - 50) ** 2 / math.sqrt(20 + (Lb - 50) ** 2)
    Sc, Sh = 1 + 0.045 * Cbp, 1 + 0.015 * Cbp * T
    Rt = -math.sin(math.radians(60 * math.exp(-(((hb - 275) / 25) ** 2)))) * Rc
    dL, dC = L2 - L1, C2p - C1p
    return math.sqrt((dL / Sl) ** 2 + (dC / Sc) ** 2 + (dH / Sh) ** 2 + Rt * (dC / Sc) * (dH / Sh))


def _shift_lightness(colour: str, points: float) -> str:
    """khroma's lighten/darken as mermaid uses them: HSL lightness +/- `points` percentage points."""
    import colorsys
    h = colour.lstrip("#")
    r, g, b = (int(h[k:k + 2], 16) / 255 for k in (0, 2, 4))
    hh, ll, ss = colorsys.rgb_to_hls(r, g, b)
    ll = max(0.0, min(1.0, ll + points / 100))
    return "#%02X%02X%02X" % tuple(round(x * 255) for x in colorsys.hls_to_rgb(hh, ll, ss))


def _blend(colour: str, ground: str, alpha: float) -> str:
    """`colour` at `alpha` opacity over `ground`, as the browser composites it in sRGB."""
    a, b = colour.lstrip("#"), ground.lstrip("#")
    return "#%02X%02X%02X" % tuple(round(int(a[k:k + 2], 16) * alpha + int(b[k:k + 2], 16) * (1 - alpha))
                                   for k in (0, 2, 4))


def categorical_failures(theme: dict) -> list:
    v = theme["themeVariables"]
    g = ground_for(theme)
    out = []

    def need(what, colour, surface, floor):
        if not colour or not surface:
            out.append(f"{what}: missing")
        elif contrast(colour, surface) < floor:
            out.append(f"{what}: {colour} on {surface} is {contrast(colour, surface):.2f}, needs {floor}")

    for i in range(12):
        need(f"cScaleLabel{i} on cScale{i}", v.get(f"cScaleLabel{i}"), v.get(f"cScale{i}"), TEXT)
    for i in range(1, 9):
        need(f"pie{i} on ground", v.get(f"pie{i}"), g, LINE)
        need(f"pieSectionTextColor on pie{i}", v.get("pieSectionTextColor"), v.get(f"pie{i}"), TEXT)
    if str(v.get("pieOpacity")) not in ("1", "1.0"):
        out.append(f"pieOpacity: {v.get('pieOpacity')!r} blends every slice into the ground; must be 1")
    for i in range(8):
        need(f"git{i} on ground", v.get(f"git{i}"), g, LINE)
        need(f"gitBranchLabel{i} on git{i}", v.get(f"gitBranchLabel{i}"), v.get(f"git{i}"), TEXT)
    xy = v.get("xyChart") or {}
    if (xy.get("backgroundColor") or "").lower() != g.lower():
        out.append(f"xyChart.backgroundColor: {xy.get('backgroundColor')!r} is not the ground {g} "
                   "(a partial xyChart object drops mermaid's derived background)")
    for k in XY_TEXT:
        need(f"xyChart.{k} on its background", xy.get(k), xy.get("backgroundColor"), TEXT)
    for k in XY_LINES:
        need(f"xyChart.{k} on its background", xy.get(k), xy.get("backgroundColor"), LINE)
    palette = [c.strip() for c in (xy.get("plotColorPalette") or "").split(",") if c.strip()]
    if len(palette) < 6:
        out.append("xyChart.plotColorPalette: fewer than 6 colours")
    for c in palette:
        need(f"xyChart plot colour {c} on ground", c, g, LINE)
    hues = [v.get(f"cScale{i}") for i in range(6)]
    if all(hues):
        worst = min(de2000(a, b) for i, a in enumerate(hues) for b in hues[i + 1:])
        if worst < DISTINCT:
            out.append(f"distinctness: two of cScale0-5 are only dE2000 {worst:.1f} apart, needs {DISTINCT}")
    # Timeline event boxes carry `filter: brightness(120%)` in mermaid's CSS: the fill is each sRGB
    # channel x1.2 (measured: #DB3437 drew as rgb(255,62,66)), which dropped zinc-light's white
    # event labels to 3.49:1. Judge the label on the brightened fill unless themeCSS turns it off.
    brightened = css_value(theme, ".eventWrapper", "filter") != "none"
    for i in range(12):
        fill, label = v.get(f"cScale{i}"), v.get(f"cScaleLabel{i}")
        if fill and label and brightened:
            h = fill.lstrip("#")
            fill = "#%02X%02X%02X" % tuple(min(255, round(int(h[k:k + 2], 16) * 1.2)) for k in (0, 2, 4))
        need(f"cScaleLabel{i} on timeline event box", label, fill, TEXT)
    # Kanban column headers: mermaid fills `.section-N rect` with cScale lightened 10% (darkened in
    # darkMode) -- measured 3.05-3.45:1 for zinc-light's white labels. Treemap leaves: cScale at
    # fill-opacity 0.3 over the ground -- measured 2.29-2.80:1. Judge the label on what is drawn,
    # unless themeCSS pins the exact colour / full opacity.
    dark = bool(v.get("darkMode"))
    for i in range(12):
        fill, label = v.get(f"cScale{i}"), v.get(f"cScaleLabel{i}")
        if not (fill and label):
            continue
        pinned = (css_value(theme, f".section-{i - 1} rect", "fill") or "").lower() == fill.lower()
        # the header text is an HTML label styled `.cluster-label{color:textColor}` -- not cScaleLabel
        header_text = css_value(theme, "[class*=section-] .cluster-label", "color") or v.get("textColor")
        need(f"kanban header text on cScale{i} header", header_text,
             fill if pinned else _shift_lightness(fill, -10 if dark else 10), TEXT)
        if css_value(theme, ".treemapLeaf", "fill-opacity") != "1":
            # leaf at 0.3 over its section at 0.6 over the ground: 0.3 + 0.7 x 0.6 = 0.72 of the colour
            # (reproduces the measured rgb(128,157,191) from #4E78A6 on white)
            need(f"cScaleLabel{i} on treemap leaf", label, _blend(fill, g, 0.72), TEXT)
    if css_value(theme, ".treemapLeaf", "fill-opacity") == "1" and \
            (css_value(theme, ".treemapLeaf", "stroke") or "").lower() != g.lower():
        out.append("treemap leaves: opaque leaves stroked in their own colour merge into one block; "
                   "stroke them with the ground")
    need("timeline axis (.lineWrapper line in themeCSS) on ground", css_value(theme, ".lineWrapper line", "stroke"), g, LINE)
    need("packet block stroke (themeCSS) on ground", css_value(theme, ".packetBlock", "stroke"), g, LINE)
    need("packet byte numbers (themeCSS) on ground", css_value(theme, ".packetByte.start", "fill"), g, TEXT)
    return out


@pytest.mark.parametrize("path", THEMES, ids=lambda p: p.stem)
def test_theme_categorical_colours_hold(path):
    theme = json.loads(path.read_text(encoding="utf-8"))
    assert categorical_failures(theme) == []


def test_the_categorical_check_catches_todays_failures():
    """Negative controls, each from a real failure seen 2026-10-18."""
    good = json.loads((SKILL / "themes" / "zinc-light.json").read_text(encoding="utf-8"))
    assert categorical_failures(good) == []

    def broken(**changes):
        t = json.loads(json.dumps(good))
        for k, val in changes.items():
            if k == "themeCSS":
                t["themeCSS"] = val
            else:
                t["themeVariables"][k] = val
        return {f.split(":")[0] for f in categorical_failures(t)}

    # mermaid's own xyChart palette starts with #FFF4DD: the pale cream bars on near-white.
    assert any("xyChart plot colour #FFF4DD" in f for f in broken(
        xyChart={**good["themeVariables"]["xyChart"], "plotColorPalette": "#FFF4DD,#FFD8B1,#FFA07A,#ECEFF1,#D6DBDF,#C3E0A8"}))
    # a partial xyChart object: the dark-mode white chart in the palette preview.
    assert "xyChart.backgroundColor" in broken(xyChart={"plotColorPalette": good["themeVariables"]["xyChart"]["plotColorPalette"]})
    # Okabe-Ito tuned for white labels: its blue and sky blue land dE2000 3.5 apart.
    okabe = ["#0072B2", "#9C6C00", "#008561", "#C05500", "#BB4D8A", "#177BB4"]
    assert "distinctness" in broken(**{f"cScale{i}": c for i, c in enumerate(okabe)})
    # mermaid's default pie opacity, and a theme without the timeline-axis CSS.
    assert "pieOpacity" in broken(pieOpacity="0.7")
    assert "timeline axis (.lineWrapper line in themeCSS) on ground" in broken(themeCSS="")


# --- colours mermaid hard-codes, which only the theme's themeCSS can repaint --------------
#
# Probed 2026-10-18 on 11.16.1 while reading the genre gallery's dark sheets. None of these
# has a themeVariable, so a theme that sets every variable still ships them broken:
#   * C4 draws every relationship line, label and arrowhead in "#444444" (c4Diagram source,
#     `rel.textColor ? ... : "#444444"`), as SVG attributes. Fine on white (9.74:1), 1.92:1 on
#     the zinc-dark ground. Any CSS rule outranks an attribute, so themeCSS can repaint it.
#   * sankey links carry an inline `mix-blend-mode: multiply`. On white that is the link
#     colour; on a dark ground it multiplies every link towards black. An inline style yields
#     only to an !important stylesheet rule.
#   * gantt grid lines get d3's `stroke="currentColor"` attribute, which beats mermaid's own
#     `.grid .tick{stroke:lightgrey}`, so they are black in both themes.

C4_HARDCODED = "#444444"
# C4 box fills, from the pinned config's c4 defaults; every C4 box draws its text #FFFFFF. Five of
# them are too light for white text (2.0 to 3.6:1), so the theme gives those boxes dark text.
C4_BOX_FILLS = {"person": "#08427B", "external person": "#686868", "system": "#1168BD",
                "external system": "#999999", "container": "#438DD5", "external container": "#B3B3B3",
                "component": "#85BBF0", "external component": "#CCCCCC"}


def hardcoded_failures(theme: dict) -> list:
    g = ground_for(theme)
    out = []
    label = css_value(theme, 'text[fill="#444444"]', "fill") or C4_HARDCODED
    line = css_value(theme, '[stroke="#444444"]', "stroke") or C4_HARDCODED
    for what, colour, floor in (("C4 relationship label on ground", label, TEXT),
                                ("C4 relationship line on ground", line, LINE)):
        if contrast(colour, g) < floor:
            out.append(f"{what}: {colour} on {g} is {contrast(colour, g):.2f}, needs {floor}")
    for kind, fill in C4_BOX_FILLS.items():
        text = css_value(theme, f'.person-man:has([fill="{fill}"]) text', "fill") or "#FFFFFF"
        if contrast(text, fill) < TEXT:
            out.append(f"C4 {kind} text on its box: {text} on {fill} is {contrast(text, fill):.2f}, needs {TEXT}")
    blend = css_value(theme, ".link", "mix-blend-mode") or "multiply"
    if theme["kind"] == "dark" and not (blend.startswith("normal") and "!important" in blend):
        out.append(f"sankey link blend: {blend!r} multiplies links to black on a dark ground; "
                   "themeCSS needs .link{{mix-blend-mode:normal !important;}}")
    if not css_value(theme, ".grid .tick line", "stroke"):
        out.append("gantt grid lines: no .grid .tick line stroke in themeCSS, so d3 draws them black")
    return out


@pytest.mark.parametrize("path", THEMES, ids=lambda p: p.stem)
def test_theme_repaints_what_mermaid_hard_codes(path):
    theme = json.loads(path.read_text(encoding="utf-8"))
    assert hardcoded_failures(theme) == []


def test_the_hard_coded_check_catches_the_themes_as_they_stood():
    """Negative control: both themes without the repaints. zinc-dark must fail on every surface;
    zinc-light only on the gantt grid and the five light C4 boxes, because #444444 holds on white
    and multiply is harmless there -- a check that also failed those would demand rules for nothing.
    The three C4 boxes dark enough for white text must pass without a rule in both."""
    def without(name):
        t = json.loads((SKILL / "themes" / f"{name}.json").read_text(encoding="utf-8"))
        t["themeCSS"] = re.sub(r'\s*(?:text)?\[(?:fill|stroke)="#444444"\]\{[^}]*\}|\s*\.link\{[^}]*\}'
                               r'|\s*\.grid \.tick line\{[^}]*\}|\s*[^{}]*\.person-man:has[^{}]*\{[^}]*\}',
                               "", t["themeCSS"])
        return {f.split(":")[0] for f in hardcoded_failures(t)}
    boxes = {f"C4 {k} text on its box" for k in ("external system", "container", "external container",
                                                  "component", "external component")}
    assert without("zinc-dark") == {"C4 relationship label on ground", "C4 relationship line on ground",
                                    "sankey link blend", "gantt grid lines"} | boxes
    assert without("zinc-light") == {"gantt grid lines"} | boxes
