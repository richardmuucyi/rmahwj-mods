#!/usr/bin/env python3
"""Convert a d2 diagram into an editable draw.io file, using the positions d2's SVG records.

d2 has no draw.io export (`d2 --help` lists svg, png, pdf, pptx, gif and txt only), and no
layout engine runs on the way across: every shape, line and label lands where d2's own
layout put it. Each d2 object becomes its own draw.io cell, so it can be moved, restyled and
re-labelled there.

How it reads the SVG, and why each rule exists:

1.  d2 writes every object's ID into its group's CSS class as URL-safe base64. That ID is the
    only thing that says which elements belong together, which connection joins which
    shapes, and which container holds what.
2.  A rectangle or ellipse becomes the matching native draw.io shape. Every other outline
    (cylinder, cloud, page, 3d, multiple, ...) becomes a custom stencil built from d2's own
    path, so it looks identical and still resizes and recolours. The SVG does not say which
    d2 shape drew a path, so guessing a native draw.io shape would be a guess.
3.  A connection keeps d2's route as waypoints. Its ends attach to the shapes they touch, so a
    shape moved in draw.io pulls its lines with it; ends that touch no shape (sequence
    messages meet lifelines, not actors) stay as free points.
4.  d2 cuts each line behind its label with a mask. draw.io cannot mask, so a label gets a
    background in the colour that lies behind it, composited from the shapes under it.
5.  Text widths come from the fonts embedded in the SVG, so labels and text cells sit where
    d2 drew them. Cells ask for Source Sans Pro (d2's font) from Google Fonts, then Helvetica
    and Arial, because the draw.io desktop export did not load the Google font.
6.  A multi-board diagram (layers, scenarios, steps) becomes one draw.io page per board.

Not carried across: d2's multiply blend (drawn as plain transparency, identical on a white
ground), masks, animation, sketch mode and the tooltip and link icons d2 adds to a render.
draw.io line heights are 1.2 x the font size, a little taller than d2's.

Usage:
    python to_drawio.py INPUT.d2|INPUT.svg|BOARD_FOLDER [-o OUT.drawio] [--png]
                        [--font NAME] [--] [extra d2 flags, for a .d2 input]

`--png` also exports OUT.png through the draw.io desktop app, when it is installed, so the
result can be looked at. Exit code is 0 when the file was written.
"""

from __future__ import annotations

import argparse
import base64
import hashlib
import html
import io
import math
import re
import shutil
import subprocess
import sys
import tempfile
import zlib
from dataclasses import dataclass, field
from pathlib import Path
from urllib.parse import quote
from xml.etree import ElementTree as ET

sys.path.insert(0, str(Path(__file__).resolve().parent))
from render import board_target, decode_id, find_d2  # noqa: E402

SVG = "{http://www.w3.org/2000/svg}"
XLINK = "{http://www.w3.org/1999/xlink}"
XHTML = "{http://www.w3.org/1999/xhtml}"
DRAWABLE = {"rect", "path", "polygon", "polyline", "line", "ellipse", "circle", "image"}

DRAWIO_BINARIES = [
    Path("C:/Program Files/draw.io/draw.io.exe"),
    Path("/Applications/draw.io.app/Contents/MacOS/draw.io"),
    Path("/usr/bin/drawio"),
    Path("/snap/bin/drawio"),
]

# d2's fonts, loaded from Google Fonts where draw.io can reach it. The fallbacks matter: the
# draw.io desktop export did not load the Google font (2026-10-19), and a bare family name
# then falls back to a serif.
FONT_STACKS = {
    "Source Sans Pro": ("Source Sans Pro,Helvetica,Arial,sans-serif",
                        "https://fonts.googleapis.com/css?family=Source+Sans+Pro"),
    "Source Code Pro": ("Source Code Pro,Courier New,monospace",
                        "https://fonts.googleapis.com/css?family=Source+Code+Pro"),
}

LINE_HEIGHT = 1.2  # draw.io's html label line height, as a multiple of the font size
BASELINE_TO_MIDDLE = 0.35  # a line's visual middle sits this many font sizes above its baseline
# Measured in a draw.io 29.3.6 export (2026-10-19): a top-aligned label lands 5 px lower than its
# spacing says, a bottom-aligned one 1 px higher.
TOP_PAD = 5
BOTTOM_PAD = 1


# --------------------------------------------------------------------------- geometry


Matrix = tuple[float, float, float, float, float, float]
IDENTITY: Matrix = (1.0, 0.0, 0.0, 1.0, 0.0, 0.0)


def mat_mul(m: Matrix, n: Matrix) -> Matrix:
    a, b, c, d, e, f = m
    a2, b2, c2, d2, e2, f2 = n
    return (a * a2 + c * b2, b * a2 + d * b2, a * c2 + c * d2, b * c2 + d * d2,
            a * e2 + c * f2 + e, b * e2 + d * f2 + f)


def apply(m: Matrix, x: float, y: float) -> tuple[float, float]:
    a, b, c, d, e, f = m
    return a * x + c * y + e, b * x + d * y + f


def mat_scale(m: Matrix) -> float:
    return math.sqrt(abs(m[0] * m[3] - m[1] * m[2])) or 1.0


def parse_transform(text: str | None) -> Matrix:
    m = IDENTITY
    for name, args in re.findall(r"(\w+)\s*\(([^)]*)\)", text or ""):
        v = [float(x) for x in re.split(r"[\s,]+", args.strip()) if x]
        if name == "translate":
            t = (1, 0, 0, 1, v[0], v[1] if len(v) > 1 else 0)
        elif name == "scale":
            t = (v[0], 0, 0, v[1] if len(v) > 1 else v[0], 0, 0)
        elif name == "matrix" and len(v) == 6:
            t = tuple(v)
        elif name == "rotate":
            r = math.radians(v[0])
            t = (math.cos(r), math.sin(r), -math.sin(r), math.cos(r), 0, 0)
            if len(v) == 3:
                t = mat_mul(mat_mul((1, 0, 0, 1, v[1], v[2]), t), (1, 0, 0, 1, -v[1], -v[2]))
        else:
            continue
        m = mat_mul(m, t)  # type: ignore[arg-type]
    return m


@dataclass
class Box:
    x: float
    y: float
    w: float
    h: float

    @property
    def cx(self) -> float:
        return self.x + self.w / 2

    @property
    def cy(self) -> float:
        return self.y + self.h / 2

    def contains(self, px: float, py: float, tol: float = 0.0) -> bool:
        return self.x - tol <= px <= self.x + self.w + tol and self.y - tol <= py <= self.y + self.h + tol

    def encloses(self, other: Box, tol: float = 1.0) -> bool:
        return (other.x >= self.x - tol and other.y >= self.y - tol
                and other.x + other.w <= self.x + self.w + tol
                and other.y + other.h <= self.y + self.h + tol)


def box_of(points: list[tuple[float, float]]) -> Box:
    xs = [p[0] for p in points]
    ys = [p[1] for p in points]
    return Box(min(xs), min(ys), max(xs) - min(xs), max(ys) - min(ys))


def union(boxes: list[Box]) -> Box:
    return box_of([(b.x, b.y) for b in boxes] + [(b.x + b.w, b.y + b.h) for b in boxes])


# --------------------------------------------------------------------------- SVG paths

Seg = tuple  # ("M", x, y) | ("L", x, y) | ("C", x1, y1, x2, y2, x, y, orig) | ("Q", ...) | ("A", ...) | ("Z",)

ARITY = {"M": 2, "L": 2, "H": 1, "V": 1, "C": 6, "S": 4, "Q": 4, "T": 2, "A": 7, "Z": 0}
NUMBER = re.compile(r"[-+]?(?:\d*\.\d+|\d+\.?)(?:[eE][-+]?\d+)?")
SEPARATORS = re.compile(r"[\s,]*")


def parse_path(d: str) -> list[Seg]:
    """Return the path as absolute segments: H/V become L, S becomes C, T becomes Q.

    A C segment records the command it came from, because d2 draws a rounded corner as an
    S after an L, and that is how a corner is told apart from a spline.
    """
    segs: list[Seg] = []
    pos, cmd = 0, None
    x = y = sx = sy = 0.0
    last_ctrl: tuple[float, float] | None = None
    last_q: tuple[float, float] | None = None

    def number() -> float | None:
        nonlocal pos
        pos = SEPARATORS.match(d, pos).end()
        m = NUMBER.match(d, pos)
        if not m:
            return None
        pos = m.end()
        return float(m.group())

    def flag() -> float | None:
        """An arc flag is one character: `a5 5 0 0110 0` packs large=0, sweep=1, x=10."""
        nonlocal pos
        pos = SEPARATORS.match(d, pos).end()
        if pos < len(d) and d[pos] in "01":
            pos += 1
            return float(d[pos - 1])
        return None

    while True:
        pos = SEPARATORS.match(d, pos).end()
        if pos >= len(d):
            break
        if d[pos].isalpha():
            if d[pos] not in ARITY and d[pos].upper() not in ARITY:
                break
            cmd = d[pos]
            pos += 1
            if cmd in "Zz":
                segs.append(("Z",))
                x, y = sx, sy
                last_ctrl = last_q = None
                continue
        elif cmd is None or cmd in "Zz":
            break  # numbers with no command to take them: invalid, and looping on them never ends
        up = cmd.upper()
        if up == "A":
            args = [number(), number(), number(), flag(), flag(), number(), number()]
        else:
            args = [number() for _ in range(ARITY[up])]
        if None in args:
            break
        rel = cmd.islower()
        up = cmd.upper()
        ox, oy = (x, y) if rel else (0.0, 0.0)
        if up == "M":
            x, y = args[0] + ox, args[1] + oy
            sx, sy = x, y
            segs.append(("M", x, y))
            cmd = "l" if rel else "L"  # extra pairs after a moveto are linetos
            last_ctrl = last_q = None
        elif up in "LHV":
            if up == "L":
                x, y = args[0] + ox, args[1] + oy
            elif up == "H":
                x = args[0] + (x if rel else 0.0)
            else:
                y = args[0] + (y if rel else 0.0)
            segs.append(("L", x, y))
            last_ctrl = last_q = None
        elif up in "CS":
            if up == "C":
                x1, y1 = args[0] + ox, args[1] + oy
                x2, y2, ex, ey = args[2] + ox, args[3] + oy, args[4] + ox, args[5] + oy
            else:
                x1, y1 = (2 * x - last_ctrl[0], 2 * y - last_ctrl[1]) if last_ctrl else (x, y)
                x2, y2, ex, ey = args[0] + ox, args[1] + oy, args[2] + ox, args[3] + oy
            segs.append(("C", x1, y1, x2, y2, ex, ey, up))
            last_ctrl, last_q = (x2, y2), None
            x, y = ex, ey
        elif up in "QT":
            if up == "Q":
                qx, qy, ex, ey = args[0] + ox, args[1] + oy, args[2] + ox, args[3] + oy
            else:
                qx, qy = (2 * x - last_q[0], 2 * y - last_q[1]) if last_q else (x, y)
                ex, ey = args[0] + ox, args[1] + oy
            segs.append(("Q", qx, qy, ex, ey))
            last_q, last_ctrl = (qx, qy), None
            x, y = ex, ey
        elif up == "A":
            ex, ey = args[5] + ox, args[6] + oy
            segs.append(("A", args[0], args[1], args[2], args[3], args[4], ex, ey))
            x, y = ex, ey
            last_ctrl = last_q = None
    return segs


def transform_segs(segs: list[Seg], m: Matrix) -> list[Seg]:
    if m == IDENTITY:
        return segs
    # an arc's radii scale per axis, its axis rotates with the matrix, and a mirror flips its sweep
    sx = math.hypot(m[0], m[1]) or 1.0
    det = m[0] * m[3] - m[1] * m[2]
    sy = abs(det) / sx
    turn = math.degrees(math.atan2(m[1], m[0]))
    out: list[Seg] = []
    for seg in segs:
        k = seg[0]
        if k in "ML":
            out.append((k, *apply(m, seg[1], seg[2])))
        elif k == "C":
            out.append(("C", *apply(m, seg[1], seg[2]), *apply(m, seg[3], seg[4]), *apply(m, seg[5], seg[6]), seg[7]))
        elif k == "Q":
            out.append(("Q", *apply(m, seg[1], seg[2]), *apply(m, seg[3], seg[4])))
        elif k == "A":
            sweep, axis = (seg[5], turn + seg[3]) if det > 0 else (1 - seg[5], turn - seg[3])  # a mirror flips both
            out.append(("A", seg[1] * sx, seg[2] * sy, axis, seg[4], sweep, *apply(m, seg[6], seg[7])))
        else:
            out.append(seg)
    return out


def arc_points(x1, y1, rx, ry, phi, large, sweep, x2, y2, n=16):
    """Sample an SVG endpoint arc (SVG 1.1 appendix F.6.5) for its bounding box."""
    if rx == 0 or ry == 0:
        return [(x2, y2)]
    rx, ry = abs(rx), abs(ry)
    p = math.radians(phi)
    cp, sp = math.cos(p), math.sin(p)
    dx, dy = (x1 - x2) / 2, (y1 - y2) / 2
    x1p, y1p = cp * dx + sp * dy, -sp * dx + cp * dy
    lam = (x1p ** 2) / (rx ** 2) + (y1p ** 2) / (ry ** 2)
    if lam > 1:
        rx, ry = rx * math.sqrt(lam), ry * math.sqrt(lam)
    num = rx ** 2 * ry ** 2 - rx ** 2 * y1p ** 2 - ry ** 2 * x1p ** 2
    den = rx ** 2 * y1p ** 2 + ry ** 2 * x1p ** 2
    co = math.sqrt(max(0.0, num / den)) if den else 0.0
    if bool(large) == bool(sweep):
        co = -co
    cxp, cyp = co * rx * y1p / ry, -co * ry * x1p / rx
    cx = cp * cxp - sp * cyp + (x1 + x2) / 2
    cy = sp * cxp + cp * cyp + (y1 + y2) / 2
    t1 = math.atan2((y1p - cyp) / ry, (x1p - cxp) / rx)
    t2 = math.atan2((-y1p - cyp) / ry, (-x1p - cxp) / rx)
    dt = t2 - t1
    if sweep and dt < 0:
        dt += 2 * math.pi
    elif not sweep and dt > 0:
        dt -= 2 * math.pi
    pts = []
    for i in range(1, n + 1):
        t = t1 + dt * i / n
        ex, ey = rx * math.cos(t), ry * math.sin(t)
        pts.append((cp * ex - sp * ey + cx, sp * ex + cp * ey + cy))
    return pts


def seg_points(segs: list[Seg]) -> list[tuple[float, float]]:
    """Points on the drawn outline, curves sampled, for a true bounding box."""
    pts: list[tuple[float, float]] = []
    x = y = 0.0
    for seg in segs:
        k = seg[0]
        if k in "ML":
            x, y = seg[1], seg[2]
            pts.append((x, y))
        elif k == "C":
            _, x1, y1, x2, y2, ex, ey, _o = seg
            for i in range(1, 13):
                t = i / 12
                u = 1 - t
                pts.append((u ** 3 * x + 3 * u * u * t * x1 + 3 * u * t * t * x2 + t ** 3 * ex,
                            u ** 3 * y + 3 * u * u * t * y1 + 3 * u * t * t * y2 + t ** 3 * ey))
            x, y = ex, ey
        elif k == "Q":
            _, qx, qy, ex, ey = seg
            for i in range(1, 9):
                t = i / 8
                u = 1 - t
                pts.append((u * u * x + 2 * u * t * qx + t * t * ex, u * u * y + 2 * u * t * qy + t * t * ey))
            x, y = ex, ey
        elif k == "A":
            pts.extend(arc_points(x, y, *seg[1:6], seg[6], seg[7]))
            x, y = seg[6], seg[7]
    return pts


# --------------------------------------------------------------------------- colours and CSS


@dataclass
class Css:
    colours: dict[tuple[str, str], str] = field(default_factory=dict)  # (property, class) -> colour
    font_classes: dict[str, str] = field(default_factory=dict)  # css class -> @font-face family
    fonts: dict[str, bytes] = field(default_factory=dict)  # family -> WOFF bytes
    blend_opacity: float = 0.5


def parse_css(root: ET.Element) -> Css:
    css = Css()
    text = "\n".join("".join(s.itertext()) for s in root.iter(SVG + "style"))
    # Only the light rules: a --dark-theme render repeats them inside @media blocks.
    light = re.split(r"@media", text)[0]
    for prop_cls, prop, colour in re.findall(r"\.((fill|stroke|color|background-color)-[\w-]+)\s*\{\s*[\w-]+\s*:\s*([^;}]+)", light):
        css.colours.setdefault((prop, prop_cls), colour.strip())
    for cls, family in re.findall(r"\.(text[\w-]*)\s*\{\s*font-family:\s*\"([^\"]+)\"", text):
        css.font_classes[cls] = family
    for family, data in re.findall(r"font-family:\s*([\w-]+);\s*src:\s*url\(\"data:application/font-woff;base64,([^\"]+)\"\)", text):
        css.fonts[family] = base64.b64decode(data)
    m = re.search(r"\.blend\s*\{[^}]*opacity:\s*([\d.]+)", text)
    if m:
        css.blend_opacity = float(m.group(1))
    return css


def style_props(el: ET.Element) -> dict[str, str]:
    out = {}
    for part in (el.get("style") or "").split(";"):
        if ":" in part:
            k, v = part.split(":", 1)
            out[k.strip()] = v.strip()
    return out


def paint(el: ET.Element, prop: str, css: Css) -> str | None:
    """The colour an element paints with: style, then attribute, then its theme class."""
    v = style_props(el).get(prop) or el.get(prop)
    if v is None:
        for cls in (el.get("class") or "").split():
            if cls.startswith(prop + "-"):
                v = css.colours.get((prop, cls))
                if v:
                    break
    if v is None or v in ("none", "transparent") or v.startswith("url("):
        return None
    return v


def to_rgb(colour: str) -> tuple[int, int, int] | None:
    c = colour.strip()
    if re.fullmatch(r"#[0-9a-fA-F]{6}", c):
        return int(c[1:3], 16), int(c[3:5], 16), int(c[5:7], 16)
    if re.fullmatch(r"#[0-9a-fA-F]{3}", c):
        return tuple(int(ch * 2, 16) for ch in c[1:])  # type: ignore[return-value]
    m = re.fullmatch(r"rgba?\(([^)]*)\)", c)
    if m:
        v = [float(x) for x in m.group(1).replace(",", " ").split()[:3]]
        return int(v[0]), int(v[1]), int(v[2])
    named = {"white": (255, 255, 255), "black": (0, 0, 0)}
    return named.get(c.lower())


def hexify(rgb: tuple[float, float, float]) -> str:
    return "#%02X%02X%02X" % tuple(max(0, min(255, round(v))) for v in rgb)


def stroke_width(el: ET.Element) -> float:
    v = style_props(el).get("stroke-width") or el.get("stroke-width") or "1"
    try:
        return float(re.sub(r"px$", "", v))
    except ValueError:
        return 1.0


def dash(el: ET.Element) -> list[float] | None:
    v = style_props(el).get("stroke-dasharray") or el.get("stroke-dasharray")
    if not v or v == "none":
        return None
    nums = [float(x) for x in re.split(r"[\s,]+", v.strip()) if x]
    return nums if any(nums) else None


# --------------------------------------------------------------------------- text


class Measure:
    """Width of a string in the fonts d2 embedded, so text sits where d2 drew it."""

    def __init__(self, css: Css):
        self.css = css
        self.cache: dict[str, object] = {}
        try:
            from fontTools.ttLib import TTFont  # type: ignore
            self.TTFont = TTFont
        except ImportError:
            self.TTFont = None

    def font(self, cls: str):
        family = self.css.font_classes.get(cls)
        if not family or self.TTFont is None or family not in self.css.fonts:
            return None
        if family not in self.cache:
            try:
                f = self.TTFont(io.BytesIO(self.css.fonts[family]))
                self.cache[family] = (f.getBestCmap(), f["hmtx"].metrics, f["head"].unitsPerEm)
            except Exception:
                self.cache[family] = None
        return self.cache[family]

    def width(self, s: str, size: float, cls: str) -> float:
        f = self.font(cls)
        if f is None:
            return len(s) * size * (0.6 if "mono" in cls else 0.53)
        cmap, hmtx, upem = f
        total = 0
        for ch in s:
            glyph = cmap.get(ord(ch))
            total += hmtx[glyph][0] if glyph in hmtx else upem * 0.5
        return total * size / upem


@dataclass
class Text:
    lines: list[str]
    x: float
    y0: float  # baseline of the first line
    pitch: float
    size: float
    anchor: str
    colour: str
    cls: str  # every text class, space-separated: bold, italic and underline can each be one
    width: float
    runs: list[str] | None = None  # per line, HTML with each run's colour (a code block's tokens)

    @property
    def font_cls(self) -> str:
        return self.cls.split()[0]

    @property
    def cy(self) -> float:
        return self.y0 + (len(self.lines) - 1) * self.pitch / 2 - BASELINE_TO_MIDDLE * self.size

    @property
    def left(self) -> float:
        return {"start": self.x, "end": self.x - self.width}.get(self.anchor, self.x - self.width / 2)

    @property
    def cx(self) -> float:
        return self.left + self.width / 2

    @property
    def drawio_height(self) -> float:
        return len(self.lines) * LINE_HEIGHT * self.size

    def font_style(self) -> int:
        return (1 if "bold" in self.cls else 0) | (2 if "italic" in self.cls else 0) | (4 if "underline" in self.cls else 0)

    def html(self) -> str:
        if self.runs:
            return "<br>".join(self.runs)
        return "<br>".join(html.escape(line, quote=False) for line in self.lines)


def length(value: str | None, size: float) -> float:
    """An SVG length: plain or px, or em (a code block places its lines at `1.3em`)."""
    v = (value or "0").strip()
    if v.endswith("em"):
        return float(v[:-2]) * size
    return float(re.sub(r"px$", "", v) or 0)


def runs_html(el: ET.Element, colour: str, css: Css) -> str | None:
    """One line's coloured runs as HTML, or None when every run looks the same."""
    parts, differs = [html.escape(el.text or "", quote=False)], False
    for span in el.findall(SVG + "tspan"):
        inner = html.escape("".join(span.itertext()), quote=False)
        if "bold" in (span.get("class") or ""):
            inner, differs = f"<b>{inner}</b>", True
        c = paint(span, "fill", css)
        if c and c.lower() != colour.lower():
            inner, differs = f'<font color="{c}">{inner}</font>', True
        parts += [inner, html.escape(span.tail or "", quote=False)]
    return "".join(parts) if differs else None


def read_text(el: ET.Element, m: Matrix, css: Css, measure: Measure) -> Text | None:
    props = style_props(el)
    base = length(props.get("font-size") or el.get("font-size") or "16", 16)
    size = base * mat_scale(m)
    anchor = props.get("text-anchor") or el.get("text-anchor") or "start"
    cls = " ".join(c for c in (el.get("class") or "").split() if c.startswith("text")) or "text"
    colour = paint(el, "fill", css) or "#000000"
    spans = el.findall(SVG + "tspan")
    runs = None
    if spans and all(s.get("x") is not None or s.get("dy") is not None for s in spans):
        # d2's multi-line label: one tspan per line, each placed with x and dy
        lines = ["".join(s.itertext()) for s in spans]
        dys = [length(s.get("dy"), base) for s in spans[1:]]
        pitch = (sum(dys) / len(dys) if dys else base * 1.15) * mat_scale(m)
        x0 = length(spans[0].get("x") or el.get("x"), base)
    else:  # one line; any tspans are runs within it (a code block's coloured tokens)
        lines = ["".join(el.itertext())]
        pitch = size * 1.15
        x0 = length(el.get("x"), base)
        line = runs_html(el, colour, css)
        runs = [line] if line else None
    if not any(line.strip() for line in lines):
        return None
    x, y0 = apply(m, x0, length(el.get("y"), base))
    font = cls.split()[0]
    width = max(measure.width(line, size, font) for line in lines)
    return Text(lines, x, y0, pitch, size, anchor, colour, cls, width, runs)


def merge_lines(texts: list[Text]) -> Text:
    """A code block's lines, one <text> each, as one left-aligned multi-line label."""
    first = texts[0]
    pitch = (texts[-1].y0 - first.y0) / (len(texts) - 1) if len(texts) > 1 else first.pitch
    lines = [line for t in texts for line in t.lines]
    runs = [r for t in texts for r in (t.runs or [html.escape(line, quote=False) for line in t.lines])]
    return Text(lines, min(t.left for t in texts), first.y0, pitch, first.size, "start", first.colour, first.cls,
                max(t.left + t.width for t in texts) - min(t.left for t in texts), runs)


# --------------------------------------------------------------------------- draw.io output


class Page:
    """Collects mxGraph cells for one board, in d2's paint order."""

    def __init__(self, name: str, font: str):
        self.name = name
        self.font = font
        self.cells: list[ET.Element] = []
        self.by_id: dict[str, ET.Element] = {}
        self.origin: dict[str, tuple[float, float]] = {"1": (0.0, 0.0)}
        self.boxes: dict[str, Box] = {}
        self.parents_used: set[str] = set()
        self.n = 0
        self.background = "#FFFFFF"
        self.stats = {"vertices": 0, "edges": 0, "stencils": 0, "texts": 0, "images": 0}
        self.notes: list[str] = []
        self.meta: dict[str, str] = {}  # written on the root cell; from_drawio.py reads it back

    def font_style(self, cls: str) -> str:
        family = "Source Code Pro" if "mono" in cls and self.font == "Source Sans Pro" else self.font
        if family in FONT_STACKS:
            stack, url = FONT_STACKS[family]
            return f"fontFamily={stack};fontSource={quote(url, safe='')};"
        return f"fontFamily={family};"

    def new_id(self) -> str:
        self.n += 1
        return f"d2c{self.n}"

    def add(self, *, value: str, style: str, parent: str, vertex: bool, box: Box | None = None,
            d2_id: str | None = None, tooltip: str | None = None, link: str | None = None,
            edge_geom: ET.Element | None = None, source: str | None = None, target: str | None = None) -> str:
        cid = self.new_id()
        attrs = {"id": cid}
        if d2_id is not None or tooltip or link:
            wrapper = ET.Element("UserObject", label=value, **attrs)
            if d2_id is not None:
                wrapper.set("d2_id", d2_id)
            if tooltip:
                wrapper.set("tooltip", tooltip)
            if link:
                wrapper.set("link", link)
            cell = ET.SubElement(wrapper, "mxCell", style=style, parent=parent)
            top = wrapper
        else:
            cell = ET.Element("mxCell", id=cid, value=value, style=style, parent=parent)
            top = cell
        if vertex:
            cell.set("vertex", "1")
            ox, oy = self.origin[parent]
            ET.SubElement(cell, "mxGeometry", x=num(box.x - ox), y=num(box.y - oy), width=num(box.w),
                          height=num(box.h), **{"as": "geometry"})
            self.origin[cid] = (box.x, box.y)
            self.boxes[cid] = box
            self.stats["vertices"] += 1
        else:
            cell.set("edge", "1")
            if source:
                cell.set("source", source)
            if target:
                cell.set("target", target)
            cell.append(edge_geom)
            self.stats["edges"] += 1
        if parent != "1":
            self.parents_used.add(parent)
        self.cells.append(top)
        self.by_id[cid] = cell
        return cid

    def finish(self) -> ET.Element:
        for pid in self.parents_used:
            cell = self.by_id[pid]
            if cell.get("vertex") == "1" and "container=1" not in cell.get("style", ""):
                cell.set("style", cell.get("style", "") + "container=1;collapsible=0;")
        diagram = ET.Element("diagram", id=re.sub(r"\W", "-", self.name) or "root", name=self.name)
        model = ET.SubElement(diagram, "mxGraphModel", dx="1200", dy="800", grid="0", gridSize="10",
                              guides="1", tooltips="1", connect="1", arrows="1", fold="1", page="0",
                              pageScale="1", math="0", shadow="0", background=self.background)
        root = ET.SubElement(model, "root")
        if self.meta:  # the diagram's own data (draw.io: Edit Data with nothing selected)
            ET.SubElement(ET.SubElement(root, "UserObject", id="0", label="", **self.meta), "mxCell")
        else:
            ET.SubElement(root, "mxCell", id="0")
        ET.SubElement(root, "mxCell", id="1", parent="0")
        root.extend(self.cells)
        return diagram


def num(v: float) -> str:
    r = round(v, 2)
    return str(int(r)) if r == int(r) else str(r)


def stencil(xml: str) -> str:
    """draw.io's inline stencil form: base64 of the raw-deflated, URI-encoded shape XML."""
    raw = quote(xml, safe="-_.!~*'()")
    c = zlib.compressobj(9, zlib.DEFLATED, -15)
    data = c.compress(raw.encode("ascii")) + c.flush()
    return "stencil(" + base64.b64encode(data).decode("ascii") + ")"


# --------------------------------------------------------------------------- markers

ER = {(True, False): "ERzeroToOne", (False, False): "ERmandOne", (True, True): "ERzeroToMany", (False, True): "ERoneToMany"}


def classify_marker(marker: ET.Element, css: Css) -> tuple[str, bool, float, float, float]:
    """(draw.io arrow, filled, size, refX, tip x) for a d2 arrowhead marker."""
    w = float(marker.get("markerWidth") or 10)
    ref = float(marker.get("refX") or 0)
    vb = [float(v) for v in (marker.get("viewBox") or f"0 0 {w} 10").replace(",", " ").split()]
    parts = [e for e in marker.iter() if e.tag.replace(SVG, "") in ("polygon", "circle", "path")]
    circles = [e for e in parts if e.tag == SVG + "circle"]
    polys = [e for e in parts if e.tag == SVG + "polygon"]
    paths = [e for e in parts if e.tag == SVG + "path"]
    far = vb[2] if ref >= vb[2] / 2 else 0.0  # an end marker reaches right, a start marker left

    def filled(e: ET.Element) -> bool:
        # d2 fills a solid head in the line's colour with no stroke, and outlines a hollow one,
        # filling it with the page colour -- white in a light theme, not in a dark one
        f, s = paint(e, "fill", css), paint(e, "stroke", css)
        return f is not None and (s is None or to_rgb(f) == to_rgb(s))

    if paths and not polys:  # crow's foot: a circle means "zero", three strokes from one point "many"
        # (d2's cross is a polygon plus a short path, so a polygon rules this out)
        many = any(len(re.findall(r"M", p.get("d") or "")) >= 3 for p in paths)
        return ER[(bool(circles), many)], False, 12.0, ref, far
    if circles and not polys:
        # draw.io centres an oval head on the line's end, so the end goes to d2's circle centre
        # (to its far edge, the head sat half inside the shape)
        centre_x = float(circles[0].get("cx") or far)
        return "oval", filled(circles[0]), 2 * float(circles[0].get("r") or w / 3), ref, centre_x
    if polys:
        pts = [float(v) for v in re.split(r"[\s,]+", polys[0].get("points", "").strip()) if v]
        xy = list(zip(pts[0::2], pts[1::2]))
        tip = max(p[0] for p in xy) if ref >= vb[2] / 2 else min(p[0] for p in xy)
        if len(xy) == 3:
            return "block", filled(polys[0]), w * 0.8, ref, tip
        if len(xy) == 4:
            xs, ys = {round(p[0], 1) for p in xy}, {round(p[1], 1) for p in xy}
            if len(xs) == 2 and len(ys) == 2:
                return "box", filled(polys[0]), w * 0.6, ref, tip
            if any(in_triangle(xy[i], *[q for j, q in enumerate(xy) if j != i]) for i in range(4)):
                return "classic", True, w * 0.8, ref, tip  # d2's "arrow": a triangle with a notch
            return "diamond", filled(polys[0]), w * 0.55, ref, tip
        if len(xy) >= 8:
            return "cross", False, w * 0.6, ref, tip
    return "block", True, w * 0.8, ref, far


def in_triangle(p, a, b, c) -> bool:
    def side(u, v, w):
        return (u[0] - w[0]) * (v[1] - w[1]) - (v[0] - w[0]) * (u[1] - w[1])
    d1, d2, d3 = side(p, a, b), side(p, b, c), side(p, c, a)
    return not ((d1 < 0 or d2 < 0 or d3 < 0) and (d1 > 0 or d2 > 0 or d3 > 0))


# --------------------------------------------------------------------------- the converter


@dataclass
class Prim:
    tag: str
    el: ET.Element
    segs: list[Seg]  # outline in absolute coordinates; empty for an image
    box: Box
    fill: str | None
    stroke: str | None
    sw: float
    dash: list[float] | None
    href: str | None = None
    scale: float = 1.0


def split_key(path: str) -> list[str]:
    """Split a d2 ID on the dots that separate keys, leaving quoted and bracketed text whole."""
    parts, cur, depth, quote_ch = [], "", 0, None
    for ch in path:
        if quote_ch:
            cur += ch
            if ch == quote_ch:
                quote_ch = None
            continue
        if ch in "\"'":
            quote_ch = ch
        elif ch == "(":
            depth += 1
        elif ch == ")":
            depth -= 1
        elif ch == "." and depth == 0:
            parts.append(cur)
            cur = ""
            continue
        cur += ch
    parts.append(cur)
    return parts


def parse_connection(d2id: str) -> tuple[str, str, str] | None:
    """(scope, source, target) for an ID like `scope.(a -> b)[0]`."""
    m = re.search(r"\[\d+\]$", d2id)
    if not m:
        return None
    body = d2id[:m.start()]
    if not body.endswith(")"):
        return None
    # Scan forward, outside quotes: the connection opens at the start or after the last
    # top-level `.(`, and its operator is the first one outside quotes. A key like
    # `"x -> y"` holds an operator inside its quotes (found 2026-10-19).
    opens, quote, depth = [], None, 0
    for i, ch in enumerate(body):
        if quote:
            quote = None if ch == quote and body[i - 1] != "\\" else quote
        elif ch in "\"'":
            quote = ch
        elif ch == "(":
            if depth == 0 and (i == 0 or body[i - 1] == "."):
                opens.append(i)
            depth += 1
        elif ch == ")":
            depth -= 1
    if not opens:
        return None
    i = opens[-1]
    scope = body[:i].rstrip(".")
    inner = body[i + 1:-1]
    quote = None
    for j, ch in enumerate(inner):
        if quote:
            quote = None if ch == quote and inner[j - 1] != "\\" else quote
        elif ch in "\"'":
            quote = ch
        else:
            op = next((o for o in (" <-> ", " -> ", " <- ", " -- ") if inner.startswith(o, j)), None)
            if op:
                return scope, inner[:j].strip(), inner[j + len(op):].strip()
    return None


class Converter:
    def __init__(self, svg_path: Path, page: Page):
        self.page = page
        raw = svg_path.read_text(encoding="utf-8", errors="replace")
        outer = ET.fromstring(raw)
        inner = outer.find(SVG + "svg")
        self.root = inner if inner is not None else outer
        self.css = parse_css(outer)
        self.measure = Measure(self.css)
        vb = [float(v) for v in (self.root.get("viewBox") or "0 0 0 0").replace(",", " ").split()]
        self.vb = vb
        self.base = (1.0, 0.0, 0.0, 1.0, -vb[0], -vb[1])  # put the d2 canvas at 0,0
        self.markers = {m.get("id"): m for m in outer.iter(SVG + "marker")}
        self.masks = [Box(float(r.get("x")) - vb[0], float(r.get("y")) - vb[1], float(r.get("width")),
                          float(r.get("height")))
                      for mk in outer.iter(SVG + "mask") for r in mk.findall(SVG + "rect")
                      if r.get("fill") == "black"]
        self.cells_by_key: dict[tuple[str, str], str] = {}
        self.fills: list[tuple[Box, tuple[int, int, int], float, bool]] = []  # backdrop for labels
        # every d2 SVG defines the sketch-overlay classes; only a sketch render uses them
        self.sketch = re.search(r'class="[^"]*sketch-overlay', raw) is not None

    # ---------------------------------------------------------------- walking

    def run(self) -> None:
        if self.sketch:
            self.page.notes.append("sketch mode: shapes are d2's hand-drawn paths; render without --sketch "
                                   "and use draw.io's Sketch option instead for an editable look")
        first_rect = True
        for el in list(self.root):
            tag = el.tag.replace(SVG, "")
            if tag == "rect" and first_rect:
                first_rect = False
                bg = paint(el, "fill", self.css)
                if bg:
                    self.page.background = bg
                continue
            self.walk(el, self.base, "", None, 1.0)

    def walk(self, el: ET.Element, m: Matrix, ns: str, link: str | None, opacity: float) -> None:
        tag = el.tag.replace(SVG, "")
        if tag in ("style", "defs", "mask", "marker", "filter", "title", "clipPath", "pattern"):
            return
        m = mat_mul(m, parse_transform(el.get("transform")))
        opacity *= float(style_props(el).get("opacity") or el.get("opacity") or 1)
        if tag == "a":
            link = el.get(XLINK + "href") or el.get("href") or link
        if tag in ("g", "a"):
            cls = (el.get("class") or "").split()
            if "appendix-icon" in cls:
                return
            d2id = next((d for d in (decode_id(t) for t in cls) if d), None) if tag == "g" else None
            if d2id is not None:
                self.object(el, d2id, m, ns, link, opacity)
                return
            if el.get("transform"):
                ns = f"{ns}#{id(el)}"  # a legend's sample shapes must not join the diagram's own
            for child in list(el):
                self.walk(child, m, ns, link, opacity)
            return
        self.loose(el, m, opacity)

    def loose(self, el: ET.Element, m: Matrix, opacity: float) -> None:
        """An element outside any d2 object -- a legend's frame and text, mostly."""
        tag = el.tag.replace(SVG, "")
        if tag == "text":
            t = read_text(el, m, self.css, self.measure)
            if t:
                self.text_cell(t, "1")
        elif tag in DRAWABLE:
            prim = self.prim(el, m)
            if prim:
                self.shape_cell([prim], "1", None, None, None, None, False, opacity, False)
        elif tag == "foreignObject":
            self.markdown(el, m, "1", None, None, None)

    # ---------------------------------------------------------------- objects

    def object(self, g: ET.Element, d2id: str, m: Matrix, ns: str, link: str | None, opacity: float) -> None:
        title = g.find(SVG + "title")
        tooltip = "".join(title.itertext()).strip() if title is not None else None
        for a in g.iter(SVG + "a"):
            link = a.get(XLINK + "href") or a.get("href") or link
        conn = parse_connection(d2id)
        path = next((p for p in iter_drawn(g) if p.tag == SVG + "path"
                     and "connection" in (p.get("class") or "").split()), None)
        before = len(self.page.cells)
        if conn is not None and path is not None:
            self.connection(g, d2id, conn, path, m, ns, tooltip, link)
        else:
            self.shape(g, d2id, m, ns, tooltip, link, opacity)
        # The group's other class tokens are the object's d2 classes; from_drawio.py writes a
        # re-declared line back with them rather than inlining the look they gave it.
        # every token after the ID: a class named `big` decodes as base64 too (found 2026-10-19)
        tokens = (g.get("class") or "").split()
        at = next((i for i, t in enumerate(tokens) if decode_id(t) is not None), -1)
        classes = tokens[at + 1:]
        if classes:
            for top in self.page.cells[before:]:
                if top.get("d2_id") == d2id:
                    top.set("d2_class", " ".join(classes))
                    break

    def prim(self, el: ET.Element, m: Matrix) -> Prim | None:
        tag = el.tag.replace(SVG, "")
        f = lambda k: float(el.get(k) or 0)  # noqa: E731
        href = None
        if tag == "rect":
            x, y, w, h = f("x"), f("y"), f("width"), f("height")
            rx = min(f("rx") or f("ry"), w / 2, h / 2)
            if rx > 0:
                d = (f"M {x + rx} {y} H {x + w - rx} A {rx} {rx} 0 0 1 {x + w} {y + rx} V {y + h - rx} "
                     f"A {rx} {rx} 0 0 1 {x + w - rx} {y + h} H {x + rx} A {rx} {rx} 0 0 1 {x} {y + h - rx} "
                     f"V {y + rx} A {rx} {rx} 0 0 1 {x + rx} {y} Z")
            else:
                d = f"M {x} {y} H {x + w} V {y + h} H {x} Z"
            segs = parse_path(d)
        elif tag in ("ellipse", "circle"):
            cx, cy = f("cx"), f("cy")
            rx, ry = (f("r"), f("r")) if tag == "circle" else (f("rx"), f("ry"))
            segs = parse_path(f"M {cx - rx} {cy} A {rx} {ry} 0 1 0 {cx + rx} {cy} A {rx} {ry} 0 1 0 {cx - rx} {cy} Z")
        elif tag == "path":
            segs = parse_path(el.get("d") or "")
        elif tag in ("polygon", "polyline"):
            pts = [float(v) for v in re.split(r"[\s,]+", (el.get("points") or "").strip()) if v]
            xy = list(zip(pts[0::2], pts[1::2]))
            if not xy:
                return None
            d = "M " + " L ".join(f"{a} {b}" for a, b in xy) + (" Z" if tag == "polygon" else "")
            segs = parse_path(d)
        elif tag == "line":
            segs = parse_path(f"M {f('x1')} {f('y1')} L {f('x2')} {f('y2')}")
        elif tag == "image":
            x, y, w, h = f("x"), f("y"), f("width"), f("height")
            segs = parse_path(f"M {x} {y} H {x + w} V {y + h} H {x} Z")
            href = el.get(XLINK + "href") or el.get("href")
        else:
            return None
        segs = transform_segs(segs, m)
        pts = seg_points(segs)
        if not pts:
            return None
        s = mat_scale(m)
        sw = stroke_width(el) * s
        fill = paint(el, "fill", self.css) if tag not in ("line", "polyline", "image") else None
        stroke = paint(el, "stroke", self.css) if tag != "image" and sw > 0 else None
        return Prim(tag, el, segs, box_of(pts), fill, stroke, sw, dash(el), href, s)

    def shape(self, g: ET.Element, d2id: str, m: Matrix, ns: str, tooltip: str | None, link: str | None,
              opacity: float) -> None:
        body = next((c for c in g if c.tag == SVG + "g" and "shape" in (c.get("class") or "").split()), None)
        shadow = body is not None and (body.get("filter") or "").startswith("url(")
        blend = body is not None and "blend" in (body.get("class") or "").split()
        if body is not None:
            opacity *= float(style_props(body).get("opacity") or body.get("opacity") or 1)
        if blend:
            opacity *= self.css.blend_opacity
        bm = mat_mul(m, parse_transform(body.get("transform"))) if body is not None else m

        prims: list[Prim] = []
        texts: list[Text] = []
        label_bgs: list[Prim] = []
        md: list[tuple[ET.Element, Matrix]] = []
        code: list[int] = []  # where a code block's lines start in `texts`

        def collect(children, mm: Matrix, inside_body: bool) -> None:
            for c in children:
                tag = c.tag.replace(SVG, "")
                if tag in ("defs", "mask", "marker", "title", "style"):
                    continue
                cm = mat_mul(mm, parse_transform(c.get("transform")))
                if tag in ("g", "a"):
                    classes = (c.get("class") or "").split()
                    if "appendix-icon" in classes or "dark-code" in classes:
                        continue  # a code block is drawn twice; the dark copy is for dark mode only
                    if "light-code" in classes:
                        code.append(len(texts))
                    collect(list(c), cm, inside_body or c is body or "light-code" in classes)
                elif tag == "text":
                    t = read_text(c, cm, self.css, self.measure)
                    if t:
                        texts.append(t)
                elif tag == "foreignObject":
                    md.append((c, cm))
                elif tag in DRAWABLE:
                    p = self.prim(c, cm)
                    if p is None:
                        continue
                    if inside_body:
                        prims.append(p)
                    elif tag == "rect":
                        label_bgs.append(p)
                    else:
                        prims.append(p)

        if body is not None:
            collect(list(body), bm, True)
        collect([c for c in g if c is not body], m, False)
        if code and len(texts) > code[0]:  # its lines become one label, colours kept
            texts[code[0]:] = [merge_lines(texts[code[0]:])]

        parent = self.parent_for(d2id, ns, prims, texts, md)
        images = [p for p in prims if p.tag == "image"]
        outline = [p for p in prims if p.tag != "image"]
        table = any("class_header" in (p.el.get("class") or "").split() for p in outline)

        if not outline and not images and md:
            el, mm = md[0]
            self.markdown(el, mm, parent, d2id, tooltip, link, ns)
            return
        if not outline and not images:
            if texts:
                main = self.text_cell(texts[0], parent, d2_id=d2id, tooltip=tooltip, link=link)
                self.cells_by_key[(ns, d2id)] = main
                for t in texts[1:]:
                    self.text_cell(t, main)
            return

        label = None
        if texts and not table:
            label = texts.pop(0)
        bg = None
        if label is not None:
            bg = next((p.fill for p in label_bgs if p.box.contains(label.cx, label.cy)), None)

        if outline:
            main = self.shape_cell(outline, parent, label, bg, d2id, tooltip, shadow, opacity, table, link)
            rest_images = images
        else:
            main = self.image_cell(images[0], parent, label, d2id, tooltip, link)
            rest_images = images[1:]
        self.cells_by_key[(ns, d2id)] = main
        for img in rest_images:
            self.image_cell(img, main, None, None, None, None)
        for t in texts:
            self.text_cell(t, main)
        for el, mm in md:
            self.markdown(el, mm, main, None, None, None, ns)

    def parent_for(self, d2id: str, ns: str, prims, texts, md) -> str:
        """The nearest ancestor container that really encloses this object, else the page."""
        keys = split_key(d2id)
        boxes = [p.box for p in prims] + [Box(t.left, t.cy - t.drawio_height / 2, t.width, t.drawio_height) for t in texts]
        for el, mm in md:
            x, y = apply(mm, float(el.get("x") or 0), float(el.get("y") or 0))
            boxes.append(Box(x, y, float(el.get("width") or 0), float(el.get("height") or 0)))
        if not boxes:
            return "1"
        mine = union(boxes)
        for i in range(len(keys) - 1, 0, -1):
            pid = self.cells_by_key.get((ns, ".".join(keys[:i])))
            if pid and pid in self.page.boxes and self.page.boxes[pid].encloses(mine, tol=2):
                return pid
        return "1"

    # ---------------------------------------------------------------- cells

    def label_style(self, t: Text, box: Box) -> str:
        """Where a shape's label sits, as draw.io alignment and spacing."""
        s = "spacing=0;" + self.page.font_style(t.cls)
        s += f"fontSize={num(t.size)};fontColor={t.colour};fontStyle={t.font_style()};"
        th = t.drawio_height
        top, bottom = t.cy - th / 2, t.cy + th / 2
        if abs(t.cx - box.cx) <= max(3.0, box.w * 0.04):
            s += "align=center;"
        elif t.left + t.width <= box.x + 1:
            s += f"labelPosition=left;align=right;spacingRight={num(box.x - t.left - t.width)};"
        elif t.left >= box.x + box.w - 1:
            s += f"labelPosition=right;align=left;spacingLeft={num(t.left - box.x - box.w)};"
        elif t.cx < box.cx:
            s += f"align=left;spacingLeft={num(t.left - box.x)};"
        else:
            s += f"align=right;spacingRight={num(box.x + box.w - t.left - t.width)};"
        if abs(t.cy - box.cy) <= max(3.0, box.h * 0.06):
            s += "verticalAlign=middle;"
        elif bottom <= box.y + 1:
            s += f"verticalLabelPosition=top;verticalAlign=bottom;spacingBottom={num(box.y - bottom)};"
        elif top >= box.y + box.h - 1:
            s += f"verticalLabelPosition=bottom;verticalAlign=top;spacingTop={num(top - box.y - box.h - TOP_PAD)};"
        elif t.cy < box.cy:
            s += f"verticalAlign=top;spacingTop={num(top - box.y - TOP_PAD)};"
        else:
            s += f"verticalAlign=bottom;spacingBottom={num(box.y + box.h - bottom - BOTTOM_PAD)};"
        return s

    def shape_cell(self, prims: list[Prim], parent: str, label: Text | None, label_bg: str | None,
                   d2_id: str | None, tooltip: str | None, shadow: bool, opacity: float, table: bool,
                   link: str | None = None) -> str:
        page = self.page
        main_box = prims[0].box if table else union([p.box for p in prims])
        first = prims[0]
        style = "html=1;whiteSpace=nowrap;"
        single = len(prims) == 1 or table
        if single and first.tag == "rect":
            rx = float(first.el.get("rx") or 0) * first.scale
            style += f"rounded=1;absoluteArcSize=1;arcSize={num(2 * rx)};" if rx > 0 else "rounded=0;"
        elif single and first.tag in ("ellipse", "circle"):
            style += "ellipse;"
        else:
            style += "shape=" + self.stencil_for(prims, main_box) + ";"
            page.stats["stencils"] += 1
        uniform = self.uniform(prims) if not table else (first.fill, first.stroke, first.sw, first.dash)
        if uniform:
            fill, stroke, sw, dsh = uniform
            style += f"fillColor={fill or 'none'};strokeColor={stroke or 'none'};strokeWidth={num(sw)};"
            if dsh:
                style += f"dashed=1;fixDash=1;dashPattern={' '.join(num(v) for v in dsh)};"
        if opacity < 0.999:
            style += f"fillOpacity={round(opacity * 100)};strokeOpacity={round(opacity * 100)};"
        if shadow:
            style += "shadow=1;"
        value = ""
        if label is not None:
            value = label.html()
            style += self.label_style(label, main_box)
            if label_bg:
                style += f"labelBackgroundColor={label_bg};"
        cid = page.add(value=value, style=style, parent=parent, vertex=True, box=main_box, d2_id=d2_id,
                       tooltip=tooltip, link=link)
        for p in prims:
            if p.fill and p.tag != "image":
                rgb = to_rgb(p.fill)
                if rgb:
                    self.fills.append((p.box, rgb, opacity, opacity < 0.999))
        if table:  # header band, row rules and every cell of text are children of the table frame
            for p in prims[1:]:
                if p.tag == "line" or p.fill is None:
                    pts = [(s[1], s[2]) for s in p.segs if s[0] in "ML"]
                    self.free_line(pts, cid, p.stroke or "#000000", p.sw)
                else:
                    page.add(value="", style=f"html=1;rounded=0;fillColor={p.fill};strokeColor={p.stroke or 'none'};"
                             f"strokeWidth={num(p.sw)};", parent=cid, vertex=True, box=p.box)
        return cid

    def uniform(self, prims: list[Prim]):
        looks = {(p.fill, p.stroke, round(p.sw, 2), tuple(p.dash or ())) for p in prims}
        if len(looks) == 1:
            p = prims[0]
            return p.fill, p.stroke, p.sw, p.dash
        return None

    def stencil_for(self, prims: list[Prim], box: Box) -> str:
        uniform = self.uniform(prims) is not None
        w, h = max(box.w, 0.01), max(box.h, 0.01)

        def geometry(p: Prim) -> str:
            out = []
            for seg in p.segs:
                k = seg[0]
                rel = lambda x, y: f'x="{num(x - box.x)}" y="{num(y - box.y)}"'  # noqa: E731
                if k == "M":
                    out.append(f"<move {rel(seg[1], seg[2])}/>")
                elif k == "L":
                    out.append(f"<line {rel(seg[1], seg[2])}/>")
                elif k == "C":
                    out.append(f'<curve x1="{num(seg[1] - box.x)}" y1="{num(seg[2] - box.y)}" x2="{num(seg[3] - box.x)}" '
                               f'y2="{num(seg[4] - box.y)}" x3="{num(seg[5] - box.x)}" y3="{num(seg[6] - box.y)}"/>')
                elif k == "Q":
                    out.append(f'<quad x1="{num(seg[1] - box.x)}" y1="{num(seg[2] - box.y)}" x2="{num(seg[3] - box.x)}" '
                               f'y2="{num(seg[4] - box.y)}"/>')
                elif k == "A":
                    out.append(f'<arc rx="{num(seg[1])}" ry="{num(seg[2])}" x-axis-rotation="{num(seg[3])}" '
                               f'large-arc-flag="{int(seg[4])}" sweep-flag="{int(seg[5])}" {rel(seg[6], seg[7])}/>')
                else:
                    out.append("<close/>")
            return "<path>" + "".join(out) + "</path>"

        def op(p: Prim) -> str:
            s = ""
            if not uniform:
                if p.fill:
                    s += f'<fillcolor color="{p.fill}"/>'
                if p.stroke:
                    s += f'<strokecolor color="{p.stroke}"/><strokewidth width="{num(p.sw)}" fixed="1"/>'
                s += f'<dashed dashed="{1 if p.dash else 0}"/>'
                if p.dash:
                    s += f'<dashpattern pattern="{" ".join(num(v / max(p.sw, 0.1)) for v in p.dash)}"/>'
            has_stroke = p.stroke is not None and p.sw > 0
            if p.fill and has_stroke:
                return s + "<fillstroke/>"
            if p.fill:
                return s + "<fill/>"
            return s + ("<stroke/>" if has_stroke else "")

        drawn = [p for p in prims if p.tag != "image"]
        fg = op(drawn[0]) + "".join(geometry(p) + op(p) for p in drawn[1:])
        xml = (f'<shape name="d2" w="{num(w)}" h="{num(h)}" aspect="variable" strokewidth="inherit">'
               f"<background>{geometry(drawn[0])}</background><foreground>{fg}</foreground></shape>")
        return stencil(xml)

    def image_cell(self, p: Prim, parent: str, label: Text | None, d2_id, tooltip, link) -> str:
        href = p.href or ""
        m = re.match(r"data:([^;,]+);base64,(.*)", href, re.S)
        if m:  # draw.io's style syntax uses ';' as a separator, so data URIs drop ';base64'
            href = f"data:{m.group(1)},{m.group(2)}"
        style = f"shape=image;html=1;imageAspect=0;aspect=fixed;image={href};"
        value = ""
        if label is not None:
            value = label.html()
            style += self.label_style(label, p.box)
        self.page.stats["images"] += 1
        return self.page.add(value=value, style=style, parent=parent, vertex=True, box=p.box, d2_id=d2_id,
                             tooltip=tooltip, link=link)

    def text_cell(self, t: Text, parent: str, d2_id=None, tooltip=None, link=None) -> str:
        box = Box(t.left, t.cy - t.drawio_height / 2, t.width + 2, t.drawio_height)
        if t.anchor == "middle":
            box.x -= 1
        elif t.anchor == "end":
            box.x -= 2
        align = {"start": "left", "end": "right"}.get(t.anchor, "center")
        style = (f"text;html=1;whiteSpace=nowrap;strokeColor=none;fillColor=none;spacing=0;align={align};"
                 f"verticalAlign=middle;fontSize={num(t.size)};fontColor={t.colour};fontStyle={t.font_style()};"
                 + self.page.font_style(t.cls))
        self.page.stats["texts"] += 1
        return self.page.add(value=t.html(), style=style, parent=parent, vertex=True, box=box, d2_id=d2_id,
                             tooltip=tooltip, link=link)

    def markdown(self, el: ET.Element, m: Matrix, parent: str, d2_id, tooltip, link, ns: str = "") -> str:
        x, y = apply(m, float(el.get("x") or 0), float(el.get("y") or 0))
        s = mat_scale(m)
        # 12% wider than d2's box: d2 sized it for Source Sans Pro, and the Helvetica or Arial
        # draw.io falls back to wrapped a one-line heading onto two lines
        box = Box(x, y, float(el.get("width") or 0) * s * 1.12, float(el.get("height") or 0) * s)
        div = next(iter(el), None)
        colour = "#000000"
        inner = ""
        if div is not None:
            for cls in (div.get("class") or "").split():
                if cls.startswith("color-"):
                    colour = self.css.colours.get(("color", cls), colour)
            inner = (div.text or "") + "".join(ET.tostring(c, encoding="unicode") for c in div)
            inner = re.sub(r"\s*xmlns(:\w+)?=\"[^\"]*\"", "", inner)
            inner = re.sub(r"<(/?)\w+:", r"<\1", inner)
        style = (f"text;html=1;whiteSpace=wrap;strokeColor=none;fillColor=none;align=left;verticalAlign=top;"
                 f"spacing=0;overflow=visible;fontSize=16;fontColor={colour};" + self.page.font_style("text"))
        self.page.stats["texts"] += 1
        cid = self.page.add(value=inner.strip(), style=style, parent=parent, vertex=True, box=box, d2_id=d2_id,
                            tooltip=tooltip, link=link)
        if d2_id:
            self.cells_by_key[(ns, d2_id)] = cid
        return cid

    def free_line(self, pts: list[tuple[float, float]], parent: str, colour: str, sw: float) -> None:
        ox, oy = self.page.origin[parent]
        geom = ET.Element("mxGeometry", relative="1", **{"as": "geometry"})
        ET.SubElement(geom, "mxPoint", x=num(pts[0][0] - ox), y=num(pts[0][1] - oy), **{"as": "sourcePoint"})
        ET.SubElement(geom, "mxPoint", x=num(pts[-1][0] - ox), y=num(pts[-1][1] - oy), **{"as": "targetPoint"})
        self.page.add(value="", style=f"endArrow=none;html=1;strokeColor={colour};strokeWidth={num(sw)};",
                      parent=parent, vertex=False, edge_geom=geom)

    # ---------------------------------------------------------------- connections

    def backdrop(self, px: float, py: float) -> str:
        """The colour behind a point: d2 cuts a line behind its label, draw.io paints this."""
        base = to_rgb(self.page.background) or (255, 255, 255)
        c = [float(v) for v in base]
        for box, rgb, alpha, multiply in self.fills:
            if box.contains(px, py):
                src = [c[i] * rgb[i] / 255 for i in range(3)] if multiply else rgb
                c = [c[i] * (1 - alpha) + src[i] * alpha for i in range(3)]
        return hexify(tuple(c))

    def connection(self, g: ET.Element, d2id: str, conn: tuple[str, str, str], path: ET.Element, m: Matrix,
                   ns: str, tooltip: str | None, link: str | None) -> None:
        page = self.page
        segs = transform_segs(parse_path(path.get("d") or ""), m)
        if not segs:
            return
        start = (segs[0][1], segs[0][2])
        end = self.endpoint(segs)
        spline = any(s[0] == "C" and (abs(s[1] - p[0]) > 0.01 or abs(s[2] - p[1]) > 0.01)
                     for s, p in zip(segs[1:], self.points_before(segs)))
        pts: list[tuple[float, float]] = []
        for s in segs[1:]:
            if s[0] == "L":
                pts.append((s[1], s[2]))
            elif s[0] == "C":
                if spline:
                    pts += [(s[1], s[2]), (s[3], s[4])]
                else:
                    pts += [(s[3], s[4]), (s[5], s[6])]  # a rounded corner: its corner, then its end
            elif s[0] == "Q":
                pts += [(s[1], s[2]), (s[3], s[4])]
            elif s[0] == "A":
                pts.append((s[6], s[7]))
        if pts and math.dist(pts[-1], end) < 0.01:
            pts.pop()
        if not spline:
            pts = simplify([start] + pts + [end])[1:-1]

        scale = mat_scale(m)
        start_tip, start_arrow = self.tip(path.get("marker-start"), start, pts[0] if pts else end, scale, True)
        end_tip, end_arrow = self.tip(path.get("marker-end"), end, pts[-1] if pts else start, scale, False)

        scope, src, dst = conn
        full = lambda k: f"{scope}.{k}" if scope and k else k  # noqa: E731
        src_cell = self.cells_by_key.get((ns, full(src))) if src else None
        dst_cell = self.cells_by_key.get((ns, full(dst))) if dst else None
        parent = self.cells_by_key.get((ns, scope), "1") if scope else "1"
        if parent not in page.boxes:
            parent = "1"
        ox, oy = page.origin[parent]

        stroke = paint(path, "stroke", self.css) or "#000000"
        sw = stroke_width(path) * scale
        style = f"html=1;endArrow={end_arrow[0]};startArrow={start_arrow[0]};strokeColor={stroke};strokeWidth={num(sw)};"
        for side, arrow in (("end", end_arrow), ("start", start_arrow)):
            if arrow[0] != "none":
                style += f"{side}Fill={int(arrow[1])};{side}Size={num(arrow[2])};"
        dsh = dash(path)
        if dsh:
            style += f"dashed=1;fixDash=1;dashPattern={' '.join(num(v * scale) for v in dsh)};"
        style += "curved=1;" if spline else ("rounded=1;" if any(s[0] in "CQA" for s in segs) else "rounded=0;")

        geom = ET.Element("mxGeometry", relative="1", **{"as": "geometry"})
        attached = {}
        for side, pt, cell, key in (("source", start_tip, src_cell, "exit"), ("target", end_tip, dst_cell, "entry")):
            ET.SubElement(geom, "mxPoint", x=num(pt[0] - ox), y=num(pt[1] - oy), **{"as": side + "Point"})
            box = page.boxes.get(cell) if cell else None
            if box is not None and box.contains(pt[0], pt[1], tol=8):
                fx = min(1.0, max(0.0, (pt[0] - box.x) / box.w)) if box.w else 0.5
                fy = min(1.0, max(0.0, (pt[1] - box.y) / box.h)) if box.h else 0.5
                fx, fy = round(fx, 4), round(fy, 4)  # 2 decimals tilted a straight line by 1.4 px
                style += (f"{key}X={fx:g};{key}Y={fy:g};{key}Dx={num(pt[0] - box.x - fx * box.w)};"
                          f"{key}Dy={num(pt[1] - box.y - fy * box.h)};{key}Perimeter=0;")
                attached[side] = cell
        if pts:
            arr = ET.SubElement(geom, "Array", **{"as": "points"})
            for x, y in pts:
                ET.SubElement(arr, "mxPoint", x=num(x - ox), y=num(y - oy))

        value = ""
        texts = [t for t in (read_text(e, m, self.css, self.measure) for e in iter_drawn(g) if e.tag == SVG + "text") if t]
        extra: list[Text] = []
        if texts:
            label, extra = texts[0], texts[1:]
            value = label.html()
            centre = self.label_centre(label)
            line = [start_tip] + pts + [end_tip]
            t, foot = nearest_on(line, centre)
            geom.set("x", num(2 * t - 1))
            geom.set("y", "0")
            ET.SubElement(geom, "mxPoint", x=num(centre[0] - foot[0]), y=num(centre[1] - foot[1]), **{"as": "offset"})
            style += (f"fontSize={num(label.size)};fontColor={label.colour};fontStyle={label.font_style()};"
                      f"labelBackgroundColor={self.backdrop(*centre)};" + page.font_style(label.cls))
        page.add(value=value, style=style, parent=parent, vertex=False, edge_geom=geom, d2_id=d2id,
                 tooltip=tooltip, link=link, source=attached.get("source"), target=attached.get("target"))
        for t in extra:  # arrowhead labels
            self.text_cell(t, parent)

    @staticmethod
    def points_before(segs: list[Seg]) -> list[tuple[float, float]]:
        """The current point before each segment after the first."""
        out = []
        x, y = segs[0][1], segs[0][2]
        for s in segs[1:]:
            out.append((x, y))
            if s[0] in "ML":
                x, y = s[1], s[2]
            elif s[0] == "C":
                x, y = s[5], s[6]
            elif s[0] == "Q":
                x, y = s[3], s[4]
            elif s[0] == "A":
                x, y = s[6], s[7]
        return out

    @staticmethod
    def endpoint(segs: list[Seg]) -> tuple[float, float]:
        s = segs[-1]
        if s[0] in "ML":
            return s[1], s[2]
        if s[0] == "C":
            return s[5], s[6]
        if s[0] == "Q":
            return s[3], s[4]
        if s[0] == "A":
            return s[6], s[7]
        return segs[0][1], segs[0][2]

    def tip(self, ref: str | None, end: tuple[float, float], toward: tuple[float, float], scale: float,
            is_start: bool):
        """Where the arrowhead's point is (draw.io ends the line there) and which draw.io arrow it is."""
        if not ref:
            return end, ("none", False, 0.0)
        mid = re.search(r"#([^)]+)\)", ref)
        marker = self.markers.get(mid.group(1)) if mid else None
        if marker is None:
            return end, ("block", True, 8.0)
        name, filled, size, refx, tipx = classify_marker(marker, self.css)
        dx, dy = end[0] - toward[0], end[1] - toward[1]
        n = math.hypot(dx, dy) or 1.0
        # marker x runs along the line: outward at the end, inward at the start
        reach = (tipx - refx) * scale
        if is_start:
            reach = (refx - tipx) * scale
        return (end[0] + dx / n * reach, end[1] + dy / n * reach), (name, filled, size * scale)

    def label_centre(self, t: Text) -> tuple[float, float]:
        for box in self.masks:
            if box.contains(t.x, t.cy, tol=1):
                return box.cx, box.cy
        return t.cx, t.cy


def iter_drawn(el: ET.Element):
    """Descendants, skipping arrowhead markers and masks (they hold paths that are not the line)."""
    for c in el:
        if c.tag.replace(SVG, "") in ("marker", "mask", "defs", "style"):
            continue
        yield c
        yield from iter_drawn(c)


def simplify(pts: list[tuple[float, float]]) -> list[tuple[float, float]]:
    """Drop repeated points and points that sit on the straight line between their neighbours."""
    out: list[tuple[float, float]] = []
    for p in pts:
        if out and math.dist(out[-1], p) < 0.5:
            continue
        out.append(p)
    i = 1
    while i < len(out) - 1:
        a, b, c = out[i - 1], out[i], out[i + 1]
        cross = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])
        if abs(cross) < 0.5 * max(1.0, math.dist(a, c)) and min(a[0], c[0]) - 0.5 <= b[0] <= max(a[0], c[0]) + 0.5 \
                and min(a[1], c[1]) - 0.5 <= b[1] <= max(a[1], c[1]) + 0.5:
            out.pop(i)
        else:
            i += 1
    return out


def nearest_on(line: list[tuple[float, float]], p: tuple[float, float]):
    """(fraction along the polyline, foot point) of the polyline point nearest p."""
    lengths = [math.dist(a, b) for a, b in zip(line, line[1:])]
    total = sum(lengths) or 1.0
    best = (float("inf"), 0.0, line[0])
    run = 0.0
    for (a, b), seg_len in zip(zip(line, line[1:]), lengths):
        if seg_len == 0:
            continue
        u = max(0.0, min(1.0, ((p[0] - a[0]) * (b[0] - a[0]) + (p[1] - a[1]) * (b[1] - a[1])) / seg_len ** 2))
        foot = (a[0] + u * (b[0] - a[0]), a[1] + u * (b[1] - a[1]))
        d = math.dist(foot, p)
        if d < best[0]:
            best = (d, (run + u * seg_len) / total, foot)
        run += seg_len
    return best[1], best[2]


# --------------------------------------------------------------------------- inputs


def source_fingerprint(text: str) -> str:
    """SHA-256 of the d2 source with line endings made LF, so Windows and macOS agree."""
    return hashlib.sha256(text.replace("\r\n", "\n").encode("utf-8")).hexdigest()


def board_pages(folder: Path, source: str = "") -> list[tuple[str, Path]]:
    """A board folder's SVGs as pages: the root board first, then the boards in the order the
    source declares them. Alphabetical order put `end` before `root` and the steps out of
    order -- steps are cumulative, so their order is the content (found 2026-10-19)."""
    boards = [(board_target(str(p.relative_to(folder))) or "root", p) for p in folder.rglob("*.svg")]

    def natural(name: str) -> list:
        return [int(t) if t.isdigit() else t for t in re.split(r"(\d+)", name)]

    def order(board: tuple[str, Path]) -> tuple:
        name = board[0]
        if name == "root":
            return (0, 0, [])
        last = re.escape(name.split(".")[-1])
        m = re.search(rf"(?m)^\s*[\"']?{last}[\"']?\s*:", source) if source else None
        return (1, m.start() if m else len(source), natural(name))

    return sorted(boards, key=order)


def boards_from(src: Path, d2_flags: list[str], tmp: Path, cwd: Path | None = None) -> list[tuple[str, Path]]:
    if src.is_dir():
        return board_pages(src)
    if src.suffix.lower() == ".svg":
        return [(src.stem, src)]
    out = (tmp / (src.stem + ".svg")).resolve()
    if cwd is None:
        # d2 resolves relative icons and imports against the source's folder, so run it there
        cmd, feed, cwd = [find_d2(), *d2_flags, str(src.resolve()), str(out)], None, src.resolve().parent
    else:  # read from stdin, so `./icon.svg` resolves against cwd: a .d2 written elsewhere still finds its icons
        cmd, feed = [find_d2(), *d2_flags, "-", str(out)], src.read_text(encoding="utf-8")
    proc = subprocess.run(cmd, input=feed, capture_output=True, text=True, encoding="utf-8", errors="replace",
                          cwd=cwd)
    if proc.returncode != 0:
        sys.exit(f"d2 failed (exit {proc.returncode}):\n{(proc.stderr or proc.stdout).strip()}")
    folder = out.with_suffix("")
    if folder.is_dir():  # a multi-board diagram writes a folder of boards
        return board_pages(folder, src.read_text(encoding="utf-8", errors="replace"))
    return [(src.stem, out)]


def find_drawio() -> str | None:
    found = shutil.which("drawio") or shutil.which("draw.io")
    if found:
        return found
    return next((str(p) for p in DRAWIO_BINARIES if p.is_file()), None)


def export_png(drawio_file: Path, png: Path, page_count: int) -> list[Path]:
    exe = find_drawio()
    if exe is None:
        print("  --png: draw.io desktop not found; no PNG written")
        return []
    written = []
    for i in range(page_count):
        target = png if page_count == 1 else png.with_name(f"{png.stem}.page{i + 1}.png")
        # draw.io's --page-index counts from 1; `-p 0` exported page 1 again (found 2026-10-19)
        cmd = [exe, "-x", "-f", "png", "-s", "2", "-b", "20", "-p", str(i + 1), "-o", str(target), str(drawio_file)]
        proc = subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8", errors="replace", timeout=180)
        if proc.returncode != 0 or not target.is_file():
            print(f"  --png: draw.io export failed for page {i + 1}: {(proc.stderr or proc.stdout).strip()[-300:]}")
        else:
            written.append(target)
    return written


def build(src: Path, d2_flags: list[str], font: str = "Source Sans Pro",
          cwd: Path | None = None) -> tuple[ET.Element, list[Page]]:
    """The draw.io document for a .d2, an SVG or a board folder, without writing it anywhere.

    A .d2 input also stamps each page with the source's fingerprint, the d2 flags and the d2
    version, so from_drawio.py can tell whether a .d2 is still the one this file came from.
    `cwd` compiles a .d2 as if it sat in that folder (for its relative icons and imports).
    """
    with tempfile.TemporaryDirectory() as tmp:
        boards = boards_from(src, d2_flags, Path(tmp), cwd)
        if not boards:
            sys.exit(f"no SVG boards found in {src}")
        mxfile = ET.Element("mxfile", host="d2-to-drawio", type="device")
        pages = []
        for name, svg in boards:
            page = Page(name, font)
            if src.is_file() and src.suffix.lower() == ".d2":
                head = svg.read_text(encoding="utf-8", errors="replace")[:600]
                version = re.search(r'data-d2-version="([^"]+)"', head)
                page.meta = {"d2_source_sha256": source_fingerprint(src.read_text(encoding="utf-8")),
                             "d2_flags": " ".join(d2_flags), "d2_version": version.group(1) if version else ""}
            Converter(svg, page).run()
            mxfile.append(page.finish())
            pages.append(page)
    return mxfile, pages


def main() -> int:
    p = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    p.add_argument("input", help=".d2 file, a d2 .svg render, or a folder of board .svg files")
    p.add_argument("-o", "--output", help="output .drawio (default: beside the input)")
    p.add_argument("--font", default="Source Sans Pro",
                   help="draw.io font family (default Source Sans Pro, d2's own font, from Google Fonts)")
    p.add_argument("--png", action="store_true", help="also export OUT.png through the draw.io desktop app")
    args, d2_flags = p.parse_known_args()
    d2_flags = [f for f in d2_flags if f != "--"]

    src = Path(args.input)
    if not src.exists():
        sys.exit(f"not found: {src}")
    out = Path(args.output) if args.output else src.with_suffix(".drawio")

    mxfile, pages = build(src, d2_flags, args.font)
    ET.indent(mxfile)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_bytes(ET.tostring(mxfile, encoding="utf-8"))
    ET.parse(out)  # the file must at least be well-formed XML

    print(f"wrote {out}")
    for page in pages:
        s = page.stats
        print(f"  page {page.name!r}: {s['vertices']} shapes ({s['stencils']} custom outlines, {s['texts']} text, "
              f"{s['images']} images), {s['edges']} lines")
        for note in page.notes:
            print(f"  note: {note}")
    if args.png:
        for png in export_png(out, out.with_suffix(".png"), len(pages)):
            print(f"  png: {png}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
