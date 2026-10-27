#!/usr/bin/env python3
"""Bring edits made in draw.io back into the d2 source, for files that to_drawio.py made.

The round trip:  diagram.d2 -> to_drawio.py -> edited in draw.io -> from_drawio.py -> d2

How it works, and why each rule exists:

1.  The baseline is what to_drawio.py makes from the .d2 today, with the d2 flags recorded
    in the draw.io file. Conversion is deterministic, so that baseline is the file as it was
    before anyone edited it. Every change is found by comparing the edited file against it,
    cell by cell, matched on the `d2_id` each cell carries.
2.  The .d2 must be the one the draw.io file came from. to_drawio.py records a fingerprint
    of the source (SHA-256, line endings made LF); a different .d2 is refused, because a
    shape added to the .d2 later would look like a shape deleted in draw.io.
3.  The .d2 is kept verbatim -- comments, classes, vars -- and most changes are appended as
    d2 statements. d2 applies later statements over earlier ones: a label or a style is
    overridden, `key: null` deletes, a new declaration adds.
4.  In a sequence diagram, a line's place in the source is its place in the picture, so
    appending cannot place a message: a message added at the end of a group stretched that
    group's band over everything below it (seen 2026-10-19). A new message is therefore
    inserted after the message or note drawn just above it in the same group, a re-pointed
    message has its ends edited where it stands, and a new actor goes in by its position
    left to right. If the source cannot be read reliably, these fall back to appending and
    the check below reports the order as not carried.
5.  A key is the cell's `d2_id`, except inside a sequence diagram group. There d2 wants the
    group's path and the group's own numbering: the SVG's `(you -> main)[1]` is
    `route_b.(you -> main)[0]` in the source. The unscoped form fails to compile for a
    message and silently does nothing for a note (both measured 2026-10-19). Keys are
    numbered again after any insertion.
6.  Every result is checked: the new .d2 is rendered, converted again and compared with the
    edited file by content (labels, ends, colours, arrowheads) and, in a sequence diagram,
    by message order and group. Whatever still differs is listed as not carried, and the
    exit code says so.

Not carried: positions (d2 lays the diagram out again), lines with a free end outside a
sequence diagram, a shape moved into another container, edits inside a sql_table or class,
adding or removing an arrowhead, and boards other than the first page.

Usage:
    python from_drawio.py EDITED.drawio [--base SOURCE.d2] [-o OUT.d2] [--force]

Without --base the .d2 beside the draw.io file with the same stem is used. Without -o the
result goes to SOURCE.from-drawio.d2 beside the base; the base is never overwritten.

Exit code: 0 when every change was carried, 1 when some were not (they are listed),
2 when nothing was written.
"""

from __future__ import annotations

import argparse
import base64
import html
import re
import sys
import zlib
from dataclasses import dataclass, field
from datetime import date
from pathlib import Path
from urllib.parse import unquote
from xml.etree import ElementTree as ET

sys.path.insert(0, str(Path(__file__).resolve().parent))
from to_drawio import build, source_fingerprint, split_key  # noqa: E402

CONN = re.compile(r"^(?:(?P<scope>.*)\.)?\((?P<a>.+?) (?P<op><->|->|<-|--) (?P<b>.*?)\)\[(?P<i>\d+)\]$")

# draw.io shape name -> d2 shape. A stencil (to_drawio.py's custom outline) maps to nothing:
# its d2 shape is whatever the .d2 already says.
NATIVE_SHAPES = {
    "rectangle": "rectangle", "process": "rectangle", "ellipse": "oval", "rhombus": "diamond",
    "cylinder": "cylinder", "cylinder3": "cylinder", "hexagon": "hexagon", "cloud": "cloud",
    "note": "page", "document": "document", "parallelogram": "parallelogram", "step": "step",
    "callout": "callout", "dataStorage": "stored_data", "folder": "package", "text": "text",
}
ARROWS = {"block": "triangle", "classic": "arrow", "diamond": "diamond", "oval": "circle", "box": "box",
          "cross": "cross", "ERmandOne": "cf-one-required", "ERzeroToOne": "cf-one",
          "ERzeroToMany": "cf-many", "ERoneToMany": "cf-many-required"}
FILLABLE = {"triangle", "diamond", "circle", "box"}
LINE_DEFAULTS = {"style.stroke-dash": "0", "style.stroke-width": "2", "style.bold": "false",
                 "style.italic": "true", "style.underline": "false"}  # what d2 does to a connection anyway


# --------------------------------------------------------------------------- reading draw.io


@dataclass
class Cell:
    cid: str
    kind: str  # "vertex" or "edge"
    d2_id: str | None
    label: str
    style: dict[str, str]
    bare: list[str]
    parent: str
    source: str | None = None
    target: str | None = None
    box: tuple[float, float, float, float] | None = None  # absolute x, y, w, h
    points: list[tuple[float, float]] = field(default_factory=list)  # absolute start .. end
    classes: list[str] = field(default_factory=list)  # the object's d2 classes, when recorded
    raw_label: str = ""  # the label as draw.io stored it, HTML and all


def model_of(diagram: ET.Element) -> ET.Element:
    model = diagram.find("mxGraphModel")
    if model is not None:
        return model
    # draw.io's compressed form: base64 of raw-deflated, URI-encoded XML
    raw = zlib.decompress(base64.b64decode((diagram.text or "").strip()), -15).decode("utf-8")
    return ET.fromstring(unquote(raw))


def plain(value: str) -> str:
    """A label as text: d2 lines become <br>, and draw.io's editor may wrap lines in <div>."""
    v = re.sub(r"<br\s*/?>", "\n", value or "", flags=re.I)
    v = re.sub(r"</(?:div|p)>\s*<(?:div|p)[^>]*>", "\n", v, flags=re.I)
    # Enter after a first line writes `first<div>second</div>`: a block after text is a new line
    v = re.sub(r"(?<=[^>\n])<(?:div|p)\b[^>]*>", "\n", v, flags=re.I)
    v = re.sub(r"<[^>]+>", "", v)
    v = html.unescape(v).replace("\xa0", " ")
    return "\n".join(line.strip() for line in v.strip().split("\n"))


def formatting(value: str) -> set[str]:
    """Inline formatting tags in a label (bold, italic, a coloured span): d2 cannot carry them."""
    return {t.lower() for t in re.findall(r"<(?!/)(?!(?:br|div|p)\b)([a-zA-Z]+)", value or "")}


QUOTED = re.compile(r'"((?:[^"\\]|\\.)*)"')


def norm(key: str) -> str:
    """A key with the quotes d2 does not need removed: the source says `vm."checked"`, the SVG's
    ID says `vm.checked` (found 2026-10-19)."""
    return QUOTED.sub(lambda m: m.group(1) if re.fullmatch(r"[\w\-]+(?: [\w\-]+)*", m.group(1)) else m.group(0), key)


def parse_style(s: str) -> tuple[dict[str, str], list[str]]:
    keys, bare = {}, []
    for part in (s or "").split(";"):
        if "=" in part:
            k, v = part.split("=", 1)
            keys[k] = v
        elif part:
            bare.append(part)
    return keys, bare


def read_page(diagram: ET.Element) -> tuple[dict[str, Cell], dict[str, str]]:
    root = model_of(diagram).find("root")
    cells: dict[str, Cell] = {}
    meta: dict[str, str] = {}
    geoms: dict[str, ET.Element] = {}
    for el in root:
        if el.tag in ("UserObject", "object"):
            cell, attrs, label = el.find("mxCell"), el.attrib, el.get("label", "")
        elif el.tag == "mxCell":
            cell, attrs, label = el, {}, el.get("value", "")
        else:
            continue
        cid = el.get("id")
        if cid == "0":
            meta = {k: v for k, v in attrs.items() if k.startswith("d2_")}
            continue
        if cid == "1" or cell is None:
            continue
        style, bare = parse_style(cell.get("style", ""))
        kind = "edge" if cell.get("edge") == "1" else "vertex"
        cells[cid] = Cell(cid, kind, attrs.get("d2_id"), plain(label), style, bare, cell.get("parent", "1"),
                          cell.get("source"), cell.get("target"), classes=(attrs.get("d2_class") or "").split(),
                          raw_label=label)
        g = cell.find("mxGeometry")
        if g is not None:
            geoms[cid] = g

    def origin(cid: str) -> tuple[float, float]:
        if cid not in cells or cells[cid].kind != "vertex" or cid not in geoms:
            return 0.0, 0.0
        px, py = origin(cells[cid].parent)
        return px + float(geoms[cid].get("x", 0)), py + float(geoms[cid].get("y", 0))

    for cid, c in cells.items():
        g = geoms.get(cid)
        if g is None:
            continue
        if c.kind == "vertex":
            x, y = origin(cid)
            c.box = (x, y, float(g.get("width", 0)), float(g.get("height", 0)))
        else:
            ox, oy = origin(c.parent)
            named = {p.get("as"): (float(p.get("x", 0)) + ox, float(p.get("y", 0)) + oy) for p in g.findall("mxPoint")}
            arr = g.find("Array")
            mids = [(float(p.get("x", 0)) + ox, float(p.get("y", 0)) + oy) for p in arr] if arr is not None else []
            c.points = ([named["sourcePoint"]] if "sourcePoint" in named else []) + mids + \
                       ([named["targetPoint"]] if "targetPoint" in named else [])
    return cells, meta


# --------------------------------------------------------------------------- what a cell says in d2 terms


def d2_shape(c: Cell) -> str | None:
    s = c.style.get("shape")
    if s and s.startswith("stencil("):
        return None
    key = s or next((b for b in c.bare if b in NATIVE_SHAPES), None)
    return NATIVE_SHAPES.get(key, None) if key else "rectangle"


def d2_style(c: Cell) -> dict[str, str]:
    """The d2 style values a cell's draw.io style sets explicitly."""
    s, out = c.style, {}
    if c.kind == "vertex" and "fillColor" in s:
        out["style.fill"] = "transparent" if s["fillColor"] == "none" else s["fillColor"].lower()
    if "strokeColor" in s:
        out["style.stroke"] = "transparent" if s["strokeColor"] == "none" else s["strokeColor"].lower()
    sw = float(s.get("strokeWidth", 1) or 1)
    if "strokeWidth" in s:
        out["style.stroke-width"] = fmt(sw)
    if s.get("dashed") == "1":
        first = float((s.get("dashPattern") or "3").split()[0])
        dash = first if s.get("fixDash") != "1" else first / max(sw, 0.1)  # d2's dash is in stroke widths
        out["style.stroke-dash"] = fmt(round(min(10.0, max(1.0, dash))))
    elif "dashed" in s or c.kind == "edge":
        out["style.stroke-dash"] = "0"
    if "fontColor" in s:
        out["style.font-color"] = s["fontColor"].lower()
    if "fontSize" in s:
        out["style.font-size"] = fmt(float(s["fontSize"]))
    if "fontStyle" in s:
        bits = int(float(s["fontStyle"] or 0))
        out["style.bold"] = "true" if bits & 1 else "false"
        out["style.italic"] = "true" if bits & 2 else "false"
        out["style.underline"] = "true" if bits & 4 else "false"
    if "fillOpacity" in s or "opacity" in s:
        out["style.opacity"] = fmt(round(float(s.get("fillOpacity", s.get("opacity", 100))) / 100, 2))
    if s.get("shadow") == "1":
        out["style.shadow"] = "true"
    if c.kind == "vertex" and s.get("rounded") == "1":
        if s.get("absoluteArcSize") == "1" and "arcSize" in s:
            out["style.border-radius"] = fmt(float(s["arcSize"]) / 2)
        elif c.box:  # draw.io's relative rounding: arcSize percent of the shorter side, 15 by default
            out["style.border-radius"] = fmt(round(min(c.box[2], c.box[3]) * float(s.get("arcSize", 15)) / 100))
    return out


# draw.io style keys d2_style reads, and keys that only place or route things (d2 lays those
# out itself). A changed key in neither list has no d2 equivalent and is reported, never
# dropped without a word (found 2026-10-19: fontFamily, gradientColor).
MAPPED_KEYS = {"fillColor", "strokeColor", "strokeWidth", "dashed", "dashPattern", "fixDash", "fontColor", "fontSize",
               "fontStyle", "fillOpacity", "opacity", "shadow", "rounded", "absoluteArcSize", "arcSize", "shape",
               "endArrow", "startArrow", "endFill", "startFill"}
LAYOUT_KEYS = {"html", "whiteSpace", "spacing", "spacingTop", "spacingLeft", "spacingRight", "spacingBottom", "align",
               "verticalAlign", "labelPosition", "verticalLabelPosition", "labelBackgroundColor", "fontSource",
               "endSize", "startSize", "strokeOpacity", "container", "collapsible", "aspect", "imageAspect", "size",
               "exitX", "exitY", "exitDx", "exitDy", "exitPerimeter", "entryX", "entryY", "entryDx", "entryDy",
               "entryPerimeter", "edgeStyle", "curved", "orthogonalLoop", "jettySize", "jumpStyle", "jumpSize",
               "backgroundOutline", "points", "resizable", "movable", "deletable", "editable"}


def unmapped(before: dict[str, str], after: dict[str, str]) -> list[str]:
    """Style keys that changed and have no d2 equivalent, as `key=value`."""
    keys = set(before) | set(after)
    return [f"{k}={after.get(k, '(removed)')}" for k in sorted(keys - MAPPED_KEYS - LAYOUT_KEYS)
            if before.get(k) != after.get(k) and not k.startswith("stencil(")]


def bad_colour(v: str) -> bool:
    """A colour d2 would reject: draw.io's `default`, `inherit`, `light-dark(...)`."""
    return not (re.fullmatch(r"#[0-9a-fA-F]{3}(?:[0-9a-fA-F]{3}(?:[0-9a-fA-F]{2})?)?", v)
                or (re.fullmatch(r"[a-zA-Z]+", v) and v.lower() not in ("default", "inherit")))


def arrows(c: Cell) -> dict[str, tuple[str, bool]]:
    """{'target': (draw.io arrow, filled), 'source': ...}; draw.io's default end is classic."""
    end = c.style.get("endArrow", "classic")
    start = c.style.get("startArrow", "none")
    return {"target": (end, c.style.get("endFill", "1") != "0"), "source": (start, c.style.get("startFill", "1") != "0")}


def fmt(v: float) -> str:
    return str(int(v)) if float(v) == int(v) else f"{v:g}"


def dq(s: str) -> str:
    return '"' + s.replace("\\", "\\\\").replace('"', '\\"').replace("\n", "\\n") + '"'


def value(v: str) -> str:
    return dq(v) if v.startswith("#") else v


def centre(box) -> tuple[float, float]:
    return box[0] + box[2] / 2, box[1] + box[3] / 2


def inside(box, pt, tol=1.0) -> bool:
    return box[0] - tol <= pt[0] <= box[0] + box[2] + tol and box[1] - tol <= pt[1] <= box[1] + box[3] + tol


def encloses(outer, inner, tol=2.0) -> bool:
    return (inner[0] >= outer[0] - tol and inner[1] >= outer[1] - tol
            and inner[0] + inner[2] <= outer[0] + outer[2] + tol and inner[1] + inner[3] <= outer[1] + outer[3] + tol)


def relative(d2_id: str, scope: str) -> str | None:
    if not scope:
        return d2_id
    return d2_id[len(scope) + 1:] if d2_id.startswith(scope + ".") else None


def lifeline(m) -> bool:
    return bool(m) and m["op"] == "--" and not m["b"]


# --------------------------------------------------------------------------- sequence diagrams on a page


class Sequence:
    """Actors, groups and source keys of the sequence diagrams on a page, from d2_ids and geometry."""

    def __init__(self, cells: dict[str, Cell]):
        self.cells = cells
        self.actors: dict[str, dict[str, str]] = {}  # scope -> {actor name: cell id}
        self.bottom: dict[str, float] = {}  # scope -> where its lifelines end
        by_id = {c.d2_id: c for c in cells.values() if c.d2_id}
        for c in cells.values():
            m = CONN.match(c.d2_id or "")
            if c.kind == "edge" and lifeline(m):
                # A diagram inside a container writes `(outer.a -- )[0]`: the scope is the actor's
                # parent, not the connection's (found 2026-10-19; it read every actor as top-level)
                full = f"{m['scope']}.{m['a']}" if m["scope"] else m["a"]
                parts = split_key(full)
                scope, name = ".".join(parts[:-1]), parts[-1]
                actor = by_id.get(full)
                if actor is not None:
                    self.actors.setdefault(scope, {})[name] = actor.cid
                    if c.points:
                        self.bottom[scope] = max(self.bottom.get(scope, 0.0), max(p[1] for p in c.points))
        self.groups: dict[str, list[tuple[str, tuple, str]]] = {}  # scope -> [(relative path, box, cell id)]
        for scope, actors in self.actors.items():
            for c in cells.values():
                rel = relative(c.d2_id, scope) if c.kind == "vertex" and c.d2_id else None
                if rel and split_key(rel)[0] not in actors and c.box:
                    self.groups.setdefault(scope, []).append((rel, c.box, c.cid))

    def scope_of(self, d2_id: str | None) -> str | None:
        """The sequence diagram a message, note or span belongs to; None for anything else."""
        if not d2_id:
            return None
        m = CONN.match(d2_id)
        for scope, actors in self.actors.items():
            if m:
                if (m["scope"] or "") == scope and m["a"] in actors:
                    return scope
                continue
            rel = relative(d2_id, scope)
            parts = split_key(rel) if rel else []
            if len(parts) > 1 and parts[0] in actors:  # actor.note, actor.span
                return scope
        return None

    def group_at(self, scope: str, pt) -> str:
        found = [(b[2] * b[3], rel) for rel, b, _ in self.groups.get(scope, []) if inside(b, pt)]
        return min(found)[1] if found else ""

    def group_label(self, scope: str, rel: str) -> str:
        return next((self.cells[cid].label for r, _, cid in self.groups.get(scope, []) if r == rel), "")

    def nearest_actor(self, scope: str, x: float) -> str:
        best = min(self.actors[scope].items(), key=lambda kv: abs(centre(self.cells[kv[1]].box)[0] - x))
        return best[0]

    def scope_at(self, pt) -> str | None:
        """The sequence diagram a point is drawn in: the one whose actors and lifelines span it,
        else the nearest. With two diagrams on a page, the first was always used."""
        best = None
        for scope, names in self.actors.items():
            boxes = [self.cells[cid].box for cid in names.values() if self.cells[cid].box]
            if not boxes:
                continue
            x0, x1 = min(b[0] for b in boxes), max(b[0] + b[2] for b in boxes)
            y0 = min(b[1] for b in boxes)
            y1 = self.bottom.get(scope, max(b[1] + b[3] for b in boxes))
            d = max(x0 - pt[0], 0, pt[0] - x1) + max(y0 - pt[1], 0, pt[1] - y1)
            if best is None or d < best[0]:
                best = (d, scope)
        return best[1] if best else None

    def in_header(self, scope: str, box) -> bool:
        """Whether a box sits in the actors' row. A new box there is an actor; one below it,
        on the lifelines, is a note. Treating every new box as an actor turned a note drawn on
        a lifeline into a new column, and the check passed it (found 2026-10-19)."""
        boxes = [self.cells[cid].box for cid in self.actors[scope].values() if self.cells[cid].box]
        if not boxes:
            return True
        bottom = max(b[1] + b[3] for b in boxes)
        return centre(box)[1] <= bottom + 5

    def role(self, c: Cell, new: bool = False) -> str:
        """actor, note, group or '' -- from the d2_id, or for a new box from where it sits."""
        if c.kind != "vertex" or not self.actors:
            return ""
        if new:
            return "actor" if c.box is None or self.in_header(self.scope_at(centre(c.box)), c.box) else "note"
        if any(c.cid in names.values() for names in self.actors.values()):
            return "actor"
        if c.d2_id and self.scope_of(c.d2_id) is not None:
            return "note"
        if any(cid == c.cid for groups in self.groups.values() for _, _, cid in groups):
            return "group"
        return ""

    def keys(self) -> dict[str, str]:
        """d2_id -> the key the source uses, for every message, note and span in a group."""
        out: dict[str, str] = {}
        ranked: dict[tuple, list[tuple[float, str]]] = {}
        for c in self.cells.values():
            scope = self.scope_of(c.d2_id)
            if scope is None:
                continue
            prefix = f"{scope}." if scope else ""
            m = CONN.match(c.d2_id)
            if m and not lifeline(m):
                if not c.points:
                    continue
                start, end = c.points[0], c.points[-1]
                group = self.group_at(scope, ((start[0] + end[0]) / 2, start[1]))
                ranked.setdefault((scope, group, m["a"], m["op"], m["b"]), []).append((start[1], c.d2_id))
            elif not m and c.box:
                group = self.group_at(scope, centre(c.box))
                if group:
                    out[c.d2_id] = f"{prefix}{group}.{relative(c.d2_id, scope)}"
        for (scope, group, a, op, b), items in ranked.items():
            prefix = ".".join(p for p in (scope, group) if p)
            for i, (_, d2_id) in enumerate(sorted(items)):
                out[d2_id] = f"{prefix + '.' if prefix else ''}({a} {op} {b})[{i}]"
        return out


# --------------------------------------------------------------------------- the d2 source, as statements


@dataclass(eq=False)
class Stmt:
    path: tuple[str, ...]  # keys of the blocks it sits in
    key: str  # the text before the value: "route_a", 'you."note"', "pr -> main"
    lines: list[str]
    indent: str
    block: bool = False  # opens a map of statements (a container or a sequence group)
    conn: tuple[str, str, str] | None = None
    chain: bool = False  # a -> b -> c: more than one connection in one statement


@dataclass(eq=False)
class Close:
    path: tuple[str, ...]  # the block it closes
    line: str


def top_level(text: str, chars: str) -> list[int]:
    """Positions of `chars` outside quotes."""
    out, quote, esc = [], None, False
    for i, ch in enumerate(text):
        if esc:
            esc = False
        elif ch == "\\":
            esc = True
        elif quote:
            if ch == quote:
                quote = None
        elif ch in "\"'":
            quote = ch
        elif ch in chars:
            out.append(i)
    return out


def code_of(line: str) -> str:
    """A line without its comment."""
    hashes = top_level(line, "#")
    return line[:hashes[0]] if hashes else line


def parse_conn(key: str) -> tuple[tuple[str, str, str] | None, bool]:
    """(a, op, b) for a connection declaration, and whether it chains on. Operators inside
    quotes do not count: a note reading `claude --cloud` is not a connection."""
    if key.startswith("(") or ".(" in key:
        return None, False  # a reference to a connection, not a declaration
    parts, last, i, quote = [], 0, 0, None
    while i < len(key):
        ch = key[i]
        if quote:
            quote = None if ch == quote and key[i - 1] != "\\" else quote
        elif ch in "\"'":
            quote = ch
        else:
            op = next((o for o in ("<->", "->", "<-", "--") if key.startswith(o, i)), None)
            if op:
                parts += [key[last:i].strip(), op]
                i += len(op)
                last = i
                continue
        i += 1
    parts.append(key[last:].strip())
    if len(parts) < 3:
        return None, False
    return (parts[0], parts[1], parts[2]), len(parts) > 3


def stmt_key(statement: str) -> str:
    """The key of a statement: the text before its first top-level ':' or '{'."""
    cut = top_level(statement, ":{")
    return statement[:cut[0]].strip() if cut else statement.strip()


class Source:
    """The .d2 as an ordered list of statements, so lines can be inserted in sequence order."""

    def __init__(self, text: str):
        self.items: list[object] = []
        self.reliable = True
        stack: list[tuple[str, ...]] = [()]
        pending: Stmt | None = None
        balance = 0
        for line in text.split("\n"):
            code = code_of(line)
            opens, closes = len(top_level(code, "{")), len(top_level(code, "}"))
            if pending is not None:
                pending.lines.append(line)
                balance += opens - closes
                if balance <= 0:
                    self.items.append(pending)
                    pending = None
                continue
            stripped = code.strip()
            if not stripped:
                self.items.append(line)
                continue
            if stripped.startswith("}"):
                if len(stack) == 1 or opens:
                    self.reliable = False
                for _ in range(closes):
                    if len(stack) > 1:
                        self.items.append(Close(stack.pop(), line))
                continue
            cut = top_level(stripped, ":{")
            key = stripped[:cut[0]].strip() if cut else stripped
            if not cut:
                rest = ""
            elif stripped[cut[0]] == ":":
                rest = stripped[cut[0] + 1:].strip()
            else:
                rest = stripped[cut[0]:].strip()
            if rest.startswith("|"):
                self.reliable = False  # a block string: its lines are not statements
            conn, chain = parse_conn(key)
            indent = line[:len(line) - len(line.lstrip())]
            stmt = Stmt(stack[-1], key, [line], indent, conn=conn, chain=chain)
            if opens > closes:
                if conn is None and rest.endswith("{") and opens - closes == 1:
                    stmt.block = True
                    self.items.append(stmt)
                    stack.append(stack[-1] + (key,))
                else:
                    pending, balance = stmt, opens - closes
                continue
            if closes > opens:
                self.reliable = False
            self.items.append(stmt)
        if pending is not None or len(stack) > 1:
            self.reliable = False

    def statements(self) -> list[Stmt]:
        return [i for i in self.items if isinstance(i, Stmt)]

    def keys(self, scope: tuple[str, ...]) -> dict[Stmt, str]:
        """Each statement's key as the rest of the file sees it, connections numbered per group."""
        out, count = {}, {}
        for s in self.statements():
            if s.path[:len(scope)] != scope:
                continue
            prefix = ".".join(s.path)
            if s.conn and not s.chain:
                a, op, b = s.conn
                pair = (s.path, norm(a), op, norm(b))  # `"a" -> b` and `a -> b` are one pair to d2
                n = count.get(pair, 0)
                count[pair] = n + 1
                out[s] = f"{prefix + '.' if prefix else ''}({a} {op} {b})[{n}]"
            elif not s.conn:
                out[s] = f"{prefix + '.' if prefix else ''}{s.key}"
        return out

    def after(self, stmt: Stmt) -> int:
        """The index just past a statement, past its whole block for a group."""
        i = self.items.index(stmt)
        if stmt.block:
            inner = stmt.path + (stmt.key,)
            while not (isinstance(self.items[i], Close) and self.items[i].path == inner):
                i += 1
        return i + 1

    def group_open(self, path: tuple[str, ...]) -> Stmt | None:
        return next((s for s in self.statements() if s.block and s.path + (s.key,) == path), None)

    def text(self) -> str:
        out = []
        for i in self.items:
            out.extend(i.lines if isinstance(i, Stmt) else [i.line] if isinstance(i, Close) else [i])
        return "\n".join(out)


# --------------------------------------------------------------------------- the comparison


@dataclass
class Plan:
    overrides: list[tuple[str, str]] = field(default_factory=list)  # (d2_id, ".label: ..." )
    deletes: list[str] = field(default_factory=list)  # d2_ids
    adds: list[str] = field(default_factory=list)  # finished statements, appended
    seq_messages: list[dict] = field(default_factory=list)  # new messages and notes, placed by position
    seq_actors: list[dict] = field(default_factory=list)  # new actors, placed by position
    repoints: list[dict] = field(default_factory=list)  # messages whose ends moved
    carried: list[str] = field(default_factory=list)
    not_carried: list[str] = field(default_factory=list)
    notes: list[str] = field(default_factory=list)


def endpoint_names(c: Cell, cells: dict[str, Cell], seq: Sequence, keymap: dict[str, str],
                   new_keys: dict[str, str]) -> tuple[str | None, str | None]:
    """The d2 keys a line joins: the shapes it is attached to, or in a sequence diagram the
    actors nearest its two ends."""
    names = []
    for side in ("source", "target"):
        cid = getattr(c, side)
        if cid and cid in cells:
            t = cells[cid]
            names.append(keymap.get(t.d2_id, t.d2_id) if t.d2_id else new_keys.get(cid))
        else:
            names.append(None)
    if (names[0] is None or names[1] is None) and c.points and seq.actors:
        mid = ((c.points[0][0] + c.points[-1][0]) / 2, c.points[0][1])
        # an existing line keeps its own diagram (none, outside a sequence); only a new one is placed by position
        scope = seq.scope_of(c.d2_id) if c.d2_id else seq.scope_at(mid)
        if scope is not None:
            prefix = f"{scope}." if scope else ""
            names = [n if n else prefix + seq.nearest_actor(scope, c.points[i][0])
                     for n, i in zip(names, (0, -1))]
    return names[0], names[1]


def slug(label: str, taken: set[str], prefix: str) -> str:
    base = re.sub(r"[^a-z0-9]+", "_", label.lower()).strip("_")[:30] or "shape"
    if base[0].isdigit():
        base = "n_" + base
    key, n = base, 2
    while prefix + key in taken:
        key, n = f"{base}_{n}", n + 1
    taken.add(prefix + key)
    return prefix + key


def parent_id(cells: dict[str, Cell], c: Cell) -> str | None:
    p = cells.get(c.parent)
    return p.d2_id if p is not None else None


def container_prefix(c: Cell, cells: dict[str, Cell], seq: Sequence, keymap: dict[str, str]) -> str:
    """Where a new shape lives: its draw.io parent, else the d2 container that encloses it."""
    p = cells.get(c.parent)
    if p is not None and p.d2_id and p.kind == "vertex":
        return keymap.get(p.d2_id, p.d2_id) + "."
    if seq.actors or not c.box:
        return ""
    holders = [(q.box[2] * q.box[3], q) for q in cells.values()
               if q.kind == "vertex" and q.d2_id and q.box and q is not c and encloses(q.box, c.box)
               and any(o.parent == q.cid for o in cells.values())]
    return keymap.get(min(holders, key=lambda t: t[0])[1].d2_id, "") + "." if holders else ""


def declare_line(c: Cell, ends: tuple[str, str], op: str, new: bool = False, was: Cell | None = None) -> str:
    """A connection statement, written as little as d2 needs.

    A re-pointed line with recorded d2 classes keeps them and adds only what changed in
    draw.io. Without them its whole look is written out: its 19 px font, say, came from a
    class, and dropping it changed the label (caught by the check, 2026-10-19).
    """
    styles = d2_style(c)
    attrs = []
    if was is not None and was.classes:
        attrs.append("class: " + (was.classes[0] if len(was.classes) == 1 else "[" + "; ".join(was.classes) + "]"))
        before = d2_style(was)
        styles = {p: v for p, v in styles.items() if before.get(p) != v}
    for p, v in styles.items():
        if p in ("style.fill", "style.shadow", "style.border-radius") or LINE_DEFAULTS.get(p) == v:
            continue
        attrs.append(f"{p}: {value(v)}")
    for side, (arrow, filled) in arrows(c).items():
        shape = ARROWS.get(arrow)
        if shape is None or (arrow == "classic" and new) or (arrow == "block" and filled) \
                or (was is not None and was.classes and arrows(was)[side] == (arrow, filled)):
            continue  # d2's default arrowhead, a plain arrow drawn in draw.io, or unchanged under the class
        attrs.append(f"{side}-arrowhead.shape: {shape}")
        if shape in FILLABLE:
            attrs.append(f"{side}-arrowhead.style.filled: {'true' if filled else 'false'}")
    body = " {" + "; ".join(attrs) + "}" if attrs else ""
    label = f": {dq(c.label)}" if c.label else ""
    return f"{ends[0]} {op} {ends[1]}{label}{body}"


def source_attrs(base_text: str, key: str) -> str | None:
    """The `{...}` of a one-line declaration in the .d2 (`store: link store { shape: cylinder }`),
    so a copy pasted in draw.io gets its original's d2 shape, class and icon."""
    for s in Source(base_text).statements():
        if ".".join(s.path + (s.key,)) == key and len(s.lines) == 1 and not s.block:
            code = code_of(s.lines[0])
            opens = top_level(code, "{")
            if opens:
                inner = code[opens[0] + 1:code.rstrip().rfind("}")].strip()
                return inner or None
    return None


def compare(base: dict[str, Cell], edited: dict[str, Cell], base_text: str = "") -> tuple[Plan, dict[str, str]]:
    plan = Plan()
    bseq, eseq = Sequence(base), Sequence(edited)
    keymap = bseq.keys()
    base_by_id = {c.d2_id: c for c in base.values() if c.d2_id}

    # The first holder of each d2_id is the original; a copy pasted in draw.io carries the same
    # d2_id and is a new object.
    seen: set[str] = set()
    originals: dict[str, Cell] = {}
    new_cells: list[Cell] = []
    for c in edited.values():
        if c.d2_id and c.d2_id in base_by_id and c.d2_id not in seen and c.kind == base_by_id[c.d2_id].kind:
            seen.add(c.d2_id)
            originals[c.d2_id] = c
        elif c.cid not in base or c.d2_id:
            new_cells.append(c)
    deleted = {d for d in base_by_id if d not in originals}
    deleted_shapes = {d for d in deleted if base_by_id[d].kind == "vertex"}

    moved = 0
    for d2_id, e in originals.items():
        b = base_by_id[d2_id]
        if lifeline(CONN.match(d2_id)):
            # d2 draws lifelines itself; an override on one stops the whole file compiling
            if b.style != e.style or b.label != e.label:
                plan.not_carried.append(f"{d2_id!r}: the lifeline was restyled in draw.io; d2 draws lifelines "
                                        "itself, so style its actor instead")
            continue
        if b.label != e.label:
            plan.overrides.append((d2_id, f".label: {dq(e.label)}"))
            plan.carried.append(f"label of {d2_id!r}")
        extra = formatting(e.raw_label) - formatting(b.raw_label)
        if extra:
            plan.not_carried.append(f"{d2_id!r}: formatting inside its label ({', '.join(sorted(extra))}) has no "
                                    "d2 equivalent; the text came back plain")
        bs, es = d2_style(b), d2_style(e)
        for prop in sorted(set(es) | set(bs)):
            if es.get(prop) == bs.get(prop):
                continue
            if prop not in es:
                plan.not_carried.append(f"{d2_id!r}: {prop} was removed in draw.io; the .d2 keeps its own value")
                continue
            if prop in ("style.fill", "style.stroke", "style.font-color") and es[prop] != "transparent" \
                    and bad_colour(es[prop]):
                plan.not_carried.append(f"{d2_id!r}: {prop} is {es[prop]!r} in draw.io, which d2 does not accept")
                continue
            plan.overrides.append((d2_id, f".{prop}: {value(es[prop])}"))
            plan.carried.append(f"{prop} of {d2_id!r}")
        for key in unmapped(b.style, e.style):
            plan.not_carried.append(f"{d2_id!r}: draw.io style {key} has no d2 equivalent")
        if b.kind == "vertex":
            if d2_shape(b) != d2_shape(e):
                target = d2_shape(e)
                if target:
                    plan.overrides.append((d2_id, f".shape: {target}"))
                    plan.carried.append(f"shape of {d2_id!r} -> {target}")
                else:
                    plan.not_carried.append(f"{d2_id!r} became a draw.io shape with no d2 equivalent")
            if parent_id(base, b) != parent_id(edited, e):
                plan.not_carried.append(f"{d2_id!r} moved into another container (d2 keys cannot move)")
            if b.box and e.box and max(abs(p - q) for p, q in zip(b.box, e.box)) > 2:
                moved += 1
            continue
        ba, ea = arrows(b), arrows(e)
        for side in ("target", "source"):
            if ba[side] == ea[side]:
                continue
            if ea[side][0] == "none" or ba[side][0] == "none":
                plan.not_carried.append(f"{d2_id!r}: adding or removing a {side} arrowhead needs a new direction in the .d2")
                continue
            shape = ARROWS.get(ea[side][0])
            if shape is None:
                plan.not_carried.append(f"{d2_id!r}: draw.io arrowhead {ea[side][0]!r} has no d2 equivalent")
                continue
            plan.overrides.append((d2_id, f".{side}-arrowhead.shape: {shape}"))
            if shape in FILLABLE:
                plan.overrides.append((d2_id, f".{side}-arrowhead.style.filled: {'true' if ea[side][1] else 'false'}"))
            plan.carried.append(f"{side} arrowhead of {d2_id!r} -> {shape}")
        m = CONN.match(d2_id)
        if m and not lifeline(m):
            be = endpoint_names(b, base, bseq, keymap, {})
            ee = endpoint_names(e, edited, eseq, keymap, {})
            if None not in ee and be != ee:
                seq_scope = bseq.scope_of(d2_id)
                if seq_scope is not None:
                    plan.repoints.append({"d2_id": d2_id, "ends": strip(ee, seq_scope), "scope": seq_scope,
                                          "fallback": declare_line(e, ee, m["op"], was=b)})
                else:
                    plan.deletes.append(d2_id)
                    plan.adds.append(declare_line(e, ee, m["op"], was=b))
                plan.carried.append(f"{d2_id!r} now joins {ee[0]} and {ee[1]}")

    for d2_id in sorted(deleted):
        b = base_by_id[d2_id]
        m = CONN.match(d2_id)
        if b.kind == "edge" and m:
            if lifeline(m):
                continue  # a lifeline goes with its actor
            ends = {f"{m['scope']}.{x}" if m["scope"] else x for x in (m["a"], m["b"])}
            if ends & deleted_shapes:
                continue  # d2 drops a connection with its shape
        plan.deletes.append(d2_id)
        plan.carried.append(f"deleted {d2_id!r}")

    # New shapes first, so new lines can join them.
    taken = {keymap.get(d, d) for d in base_by_id}
    new_keys: dict[str, str] = {}
    for c in new_cells:
        if c.kind != "vertex":
            continue
        if c.parent in edited and edited[c.parent].kind == "edge":
            plan.not_carried.append(f"label cell {c.label!r} added to a line: put the text on the line itself")
            continue
        original = base_by_id.get(c.d2_id) if c.d2_id else None
        if original is not None:  # a copy pasted in draw.io: its original's declaration, plus what changed
            inherited = source_attrs(base_text, keymap.get(c.d2_id, c.d2_id))
            if inherited is None and d2_shape(original) is None:
                plan.not_carried.append(f"copy {c.label!r} of {c.d2_id!r}: its d2 shape is not on one line of "
                                        "the .d2, so the copy cannot inherit it")
                continue
            before = d2_style(original)
            attrs = [inherited] if inherited else []
            if d2_shape(c) != d2_shape(original) and d2_shape(c):
                attrs.append(f"shape: {d2_shape(c)}")
            attrs += [f"{p}: {value(v)}" for p, v in d2_style(c).items() if before.get(p) != v]
        else:
            shape = d2_shape(c)
            if shape is None:
                plan.not_carried.append(f"new shape {c.label!r} uses a draw.io shape with no d2 equivalent")
                continue
            attrs = [] if shape == "rectangle" else [f"shape: {shape}"]
            attrs += [f"{p}: {value(v)}" for p, v in d2_style(c).items() if p != "style.stroke-dash" or v != "0"]
        bad = [a for a in attrs if re.match(r"style\.(fill|stroke|font-color): ", a)
               and a.split(": ", 1)[1].strip('"') != "transparent" and bad_colour(a.split(": ", 1)[1].strip('"'))]
        attrs = [a for a in attrs if a not in bad]
        # a pasted copy is measured against its original; a brand-new shape against nothing
        for key in unmapped(original.style if original else {}, c.style) + [f"{a} (d2 does not accept it)" for a in bad]:
            plan.not_carried.append(f"new shape {c.label!r}: draw.io style {key} has no d2 equivalent")
        if formatting(c.raw_label):
            plan.not_carried.append(f"new shape {c.label!r}: formatting inside its label has no d2 equivalent")
        prefix = container_prefix(c, edited, eseq, keymap)
        k = slug(c.label, taken, prefix)
        new_keys[c.cid] = k
        statement = f"{k}: {dq(c.label)}" + (" {" + "; ".join(attrs) + "}" if attrs else "")
        scope = eseq.scope_at(centre(c.box)) if eseq.actors and c.box else None
        if scope is not None and not prefix and eseq.role(c, new=True) == "note":
            # a box on the lifelines is a note on the nearest actor, placed by height like a message
            actor = eseq.nearest_actor(scope, centre(c.box)[0])
            group = eseq.group_at(scope, centre(c.box))
            looks = [a for a in attrs if not a.startswith("shape:")]  # d2 draws a note its own way
            note = f"{actor}.{dq(c.label)}" + (" {" + "; ".join(looks) + "}" if looks else "")
            path = ".".join(p for p in (scope, group) if p)
            new_keys[c.cid] = f"{path + '.' if path else ''}{actor}.{dq(c.label)}"
            plan.seq_messages.append({"statement": note, "fallback": in_group(path, note), "scope": scope,
                                      "group": group, "y": c.box[1], "label": c.label})
            plan.carried.append(f"new note {c.label!r} on {actor}" + (f" in {group}" if group else ""))
            continue
        if scope is not None and not prefix:
            plan.seq_actors.append({"statement": f"{relative(k, scope) or k}: {statement.split(': ', 1)[1]}",
                                    "fallback": statement, "x": centre(c.box)[0], "scope": scope})
        else:
            plan.adds.append(statement)
        plan.carried.append(f"new shape {c.label!r} as {k}")
    for c in new_cells:
        if c.kind != "edge":
            continue
        ends = endpoint_names(c, edited, eseq, keymap, new_keys)
        if None in ends:
            plan.not_carried.append(f"new line {c.label!r} has a free end, and d2 needs a shape at both ends")
            continue
        a = arrows(c)
        op = {(True, True): "<->", (True, False): "<-", (False, True): "->", (False, False): "--"}[
            (a["source"][0] != "none", a["target"][0] != "none")]
        was = base_by_id.get(c.d2_id) if c.d2_id else None  # a pasted copy keeps its original's classes
        free = eseq.actors and not (c.source and c.target) and c.points
        scope = eseq.scope_at(((c.points[0][0] + c.points[-1][0]) / 2, c.points[0][1])) if free else None
        if scope is not None and c.points:  # a message: placed by where it was drawn
            start, end = c.points[0], c.points[-1]
            group = eseq.group_at(scope, ((start[0] + end[0]) / 2, start[1]))
            plan.seq_messages.append({"statement": declare_line(c, strip(ends, scope), op, new=True, was=was),
                                      "fallback": declare_line(c, ends, op, new=True, was=was),
                                      "scope": scope, "group": group, "y": start[1], "label": c.label})
        else:
            plan.adds.append(declare_line(c, ends, op, new=True, was=was))
        plan.carried.append(f"new line {ends[0]} {op} {ends[1]}")
    for c in base.values():  # a table's rows and a legend's text have no d2_id
        if not c.d2_id and c.cid in edited and c.label != edited[c.cid].label:
            plan.not_carried.append(f"text {c.label!r} -> {edited[c.cid].label!r} is part of a table or legend")
    if moved:
        plan.notes.append(f"{moved} shape(s) moved or resized in draw.io; d2 lays the diagram out again, so positions "
                          "are not carried")
    return plan, keymap


def in_group(path: str, statement: str) -> str:
    """Declare inside a sequence group, where bare actor names mean the diagram's actors."""
    return f"{path}: {{ {statement} }}" if path else statement


def strip(ends: tuple[str, str], scope: str) -> tuple[str, str]:
    return tuple(relative(e, scope) or e for e in ends)  # type: ignore[return-value]


# --------------------------------------------------------------------------- writing the result


def siblings(edited: dict[str, Cell], seq: Sequence, keymap: dict[str, str], scope: str,
             group: str) -> list[tuple[float, str]]:
    """What sits directly in one group (or a diagram's top level), with its height on the page:
    messages, notes and child groups, as (y, source key). Groups holding nothing (a title, say)
    are left out: a message inserted after a title would land before the actors."""
    path = ".".join(p for p in (scope, group) if p)
    out = []
    holds: set[str] = set()
    seen: set[str] = set()
    for c in edited.values():
        if not c.d2_id or seq.scope_of(c.d2_id) != scope or c.d2_id in seen:
            continue  # a pasted copy shares its original's d2_id; only the original has a place
        seen.add(c.d2_id)
        k = keymap.get(c.d2_id, c.d2_id)
        m = CONN.match(k)
        if m and not lifeline(m) and c.points:
            if (m["scope"] or "") == path:
                out.append((c.points[0][1], k))
            holds.add(m["scope"] or "")
        elif not m and c.box:
            parts = split_key(k)
            where = ".".join(parts[:-2])
            holds.add(where)
            if where == path:
                out.append((c.box[1], k))
    for rel, box, cid in seq.groups.get(scope, []):
        full = ".".join(p for p in (scope, rel) if p)
        parent = ".".join(split_key(full)[:-1])
        if parent == path and any(h == full or h.startswith(full + ".") for h in holds):
            out.append((box[1], full))
    return out


def apply(base_text: str, plan: Plan, edited: dict[str, Cell],
          keymap: dict[str, str]) -> tuple[str, list[str], bool, list[str]]:
    """The new .d2: sequence insertions in place, then every other change appended.

    Returns the text, the statements appended, whether sequence lines could be placed, and the
    placements that went wrong (reported as not carried).
    """
    src = Source(base_text)
    eseq = Sequence(edited)
    scopes = {tuple(split_key(s)) if s else () for s in eseq.actors}
    before = {}
    for scope in scopes:
        before.update(src.keys(scope))
    by_key = {norm(k): s for s, k in before.items()}
    placed = src.reliable and all(norm(k) in by_key for k in keymap.values() if CONN.match(k))
    appended: list[str] = []
    problems: list[str] = []

    if placed:
        for r in plan.repoints:  # edit the ends where the message stands
            s = by_key[norm(keymap.get(r["d2_id"], r["d2_id"]))]
            if s.chain:
                placed = False
                break
            a, op, b = s.conn
            new_key = f"{r['ends'][0]} {op} {r['ends'][1]}"
            s.lines[0] = s.lines[0].replace(s.key, new_key, 1)
            s.key, s.conn = new_key, (r["ends"][0], op, r["ends"][1])
        # New items in drawn order, each one an anchor for the next: two in one gap came out
        # reversed when only existing items could be anchors (found 2026-10-19).
        placed_new: dict[tuple[str, str], list[tuple[float, Stmt]]] = {}
        for msg in sorted(plan.seq_messages, key=lambda m: m["y"]):
            path = tuple(split_key(".".join(p for p in (msg["scope"], msg["group"]) if p))) \
                if (msg["scope"] or msg["group"]) else ()
            candidates: list[tuple[float, Stmt]] = []
            for y, k in siblings(edited, eseq, keymap, msg["scope"], msg["group"]):
                if y >= msg["y"]:
                    continue
                s = by_key.get(norm(k)) or src.group_open(tuple(split_key(k)))
                if s is None:
                    problems.append(f"could not find {k!r} in the .d2, so {msg['label']!r} may be out of place")
                    continue
                candidates.append((y, s))
            candidates += [(y, s) for y, s in placed_new.get((msg["scope"], msg["group"]), []) if y < msg["y"]]
            anchor = max(candidates, key=lambda t: t[0])[1] if candidates else None
            if anchor is not None:
                at, indent = src.after(anchor), anchor.indent
            elif path and src.group_open(path) is not None:
                opener = src.group_open(path)
                at, indent = src.items.index(opener) + 1, opener.indent + "  "
            else:
                actors = [s for s in src.statements() if s.path == path and mentions_any(src, s, eseq.actors.get(
                    msg["scope"], {}))]
                at, indent = (src.after(actors[-1]), actors[-1].indent) if actors else (len(src.items), "")
            conn, chain = parse_conn(stmt_key(msg["statement"]))
            stmt = Stmt(path, stmt_key(msg["statement"]), [indent + msg["statement"]], indent, conn=conn, chain=chain)
            src.items.insert(at, stmt)
            placed_new.setdefault((msg["scope"], msg["group"]), []).append((msg["y"], stmt))
        for actor in sorted(plan.seq_actors, key=lambda a: a["x"]):
            place_actor(src, eseq, edited, actor)

    if not placed:  # append everything; the order check will say what that cost
        src = Source(base_text)
        appended += [m["fallback"] for m in plan.seq_messages] + [a["fallback"] for a in plan.seq_actors]
        for r in plan.repoints:
            plan.deletes.append(r["d2_id"])
            appended.append(r["fallback"])
        final = {d: k for d, k in keymap.items()}
    else:
        after_keys = {}
        for scope in scopes:
            after_keys.update(src.keys(scope))
        final = {d: after_keys.get(before_stmt, k) for d, k in keymap.items()
                 for before_stmt in [by_key.get(norm(k))]}

    def key(d2_id: str) -> str:
        return final.get(d2_id, d2_id)

    lines = [f"{key(d)}{suffix}" for d, suffix in plan.overrides] + plan.adds + appended
    lines += [f"{k}: null" for k in sorted((key(d) for d in plan.deletes), key=sort_key)]
    text = src.text().rstrip("\n") + "\n"
    if lines:
        text += (f"\n# --- Changes made in draw.io, brought back by from_drawio.py ({date.today().isoformat()}) ---\n"
                 "# d2 applies these over the declarations above; fold them in by hand when convenient.\n"
                 + "\n".join(lines) + "\n")
    return text, lines, placed, problems


def split_list(key: str) -> list[str]:
    """`a; b; c` as its statements (the separators outside quotes)."""
    cuts = top_level(key, ";")
    bounds = [-1] + cuts + [len(key)]
    return [key[bounds[i] + 1:bounds[i + 1]].strip() for i in range(len(bounds) - 1)]


def mentions(src: Source, s: Stmt, name: str) -> bool:
    """Whether a statement declares or uses an actor: d2 orders actors by where they first appear."""
    if not name:
        return False
    keys = split_list(s.key) if ";" in s.key else [s.key]
    if any(norm(stmt_key(k)) == name or norm(k).startswith(name + ".") for k in keys):
        return True
    if s.conn and name in (norm(s.conn[0]), norm(s.conn[2])):
        return True
    if s.block:
        i = src.items.index(s) + 1
        inner = s.path + (s.key,)
        while i < len(src.items) and not (isinstance(src.items[i], Close) and src.items[i].path == inner):
            if isinstance(src.items[i], Stmt) and mentions(src, src.items[i], name):
                return True
            i += 1
    return False


def mentions_any(src: Source, s: Stmt, names) -> bool:
    return any(mentions(src, s, n) for n in names)


def place_actor(src: Source, eseq: Sequence, edited: dict[str, Cell], actor: dict) -> None:
    """A new actor goes just before the first statement that brings in the actor to its right.

    Appending it, or anchoring only on declared actors, put `Mid` after `c` when the actors
    were introduced by their messages (found 2026-10-19). If the actor to its left is not in
    yet at that point, it is declared first, so the order comes out left, new, right.
    """
    scope_path = tuple(split_key(actor["scope"])) if actor["scope"] else ()
    xs = {name: centre(edited[cid].box)[0] for name, cid in eseq.actors.get(actor["scope"], {}).items()}
    left = max(((x, n) for n, x in xs.items() if x < actor["x"]), default=(None, None))[1]
    right = min(((x, n) for n, x in xs.items() if x > actor["x"]), default=(None, None))[1]
    top = [s for s in src.statements() if s.path == scope_path]
    first_right = next((s for s in top if mentions(src, s, right)), None)
    statement = actor["statement"]
    if first_right is None:  # the rightmost: just after the statement that brings in its left neighbour
        intro = next((s for s in top if mentions(src, s, left)), None)
        at = src.after(intro) if intro else len(src.items)
        indent = intro.indent if intro else (top[0].indent if top else "")
        src.items.insert(at, Stmt(scope_path, stmt_key(statement), [indent + statement], indent))
        return
    if ";" in first_right.key and right in [norm(stmt_key(k)) for k in split_list(first_right.key)]:
        keys = split_list(first_right.key)
        i = [norm(stmt_key(k)) for k in keys].index(right)
        keys.insert(i, statement)
        first_right.key = "; ".join(keys)
        first_right.lines[0] = first_right.indent + first_right.key
        return
    lines = [statement]
    if left and not any(mentions(src, s, left) for s in top[:top.index(first_right)]):
        lines.insert(0, left)
    at = src.items.index(first_right)
    for line in reversed(lines):
        src.items.insert(at, Stmt(scope_path, stmt_key(line), [first_right.indent + line], first_right.indent))


def sort_key(k: str) -> tuple:
    """Delete later connections first: removing [0] before [1] would renumber [1]."""
    m = CONN.match(k)
    return (0, m["scope"] or "", m["a"], m["op"], m["b"], -int(m["i"])) if m else (1, k, "", "", "", 0)


# --------------------------------------------------------------------------- verification


def signatures(cells: dict[str, Cell], new_cids: set[str] = frozenset(),
               styles: dict[str, dict[str, str]] | None = None) -> tuple[list, list, list, list]:
    """Content of every shape and line, positions left out, plus each sequence diagram's
    messages in drawing order with the group they sit in. A shape's role (actor, note, group)
    is part of its content: a note that came back as an actor is not the same diagram.

    Also returns the sequence order -- messages with their ends and notes with their actor,
    top to bottom, each with its group -- and the actors left to right. Checking messages
    alone let a misplaced note, or two new items swapped, pass (found 2026-10-19).

    `styles` replaces a cell's style for the comparison: the edited file passes only what the
    person changed, so d2 restyling something on its own (an actor's fill once it has a
    message) is not mistaken for a lost edit.
    """
    styles = styles or {}
    seq = Sequence(cells)
    shapes, lines, order, actors = [], [], [], []
    for c in cells.values():
        if c.kind == "vertex":
            if c.parent in cells and cells[c.parent].kind == "edge":
                continue
            role = seq.role(c, new=c.cid in new_cids)
            shapes.append((c.label, d2_shape(c), styles.get(c.cid, d2_style(c)), role))
            if role == "actor" and c.box:
                home = next((s for s, names in seq.actors.items() if c.cid in names.values()), None)
                actors.append((home if home is not None else seq.scope_at(centre(c.box)), centre(c.box)[0], c.label))
            elif role == "note" and c.box:
                scope = seq.scope_of(c.d2_id) if c.d2_id and c.cid not in new_cids else seq.scope_at(centre(c.box))
                if scope is not None:
                    if c.d2_id and c.cid not in new_cids:
                        owner = cells[seq.actors[scope][split_key(relative(c.d2_id, scope))[0]]].label
                    else:
                        owner = cells[seq.actors[scope][seq.nearest_actor(scope, centre(c.box)[0])]].label
                    group = seq.group_at(scope, centre(c.box))
                    order.append((scope, c.box[1], "note", c.label, owner,
                                  seq.group_label(scope, group) if group else ""))
            continue
        m = CONN.match(c.d2_id or "")
        if lifeline(m):
            actor = cells.get(c.source)
            lines.append(("", (actor.label if actor else m["a"], None), {}, {}))
            continue
        names = []
        for side in ("source", "target"):
            t = cells.get(getattr(c, side) or "")
            names.append(t.label if t else None)
        if None in names and c.points and seq.actors:
            mid = ((c.points[0][0] + c.points[-1][0]) / 2, c.points[0][1])
            scope = seq.scope_of(c.d2_id) if c.d2_id and c.cid not in new_cids else seq.scope_at(mid)
            if scope is not None:
                names = [n if n is not None else cells[seq.actors[scope][seq.nearest_actor(scope, c.points[i][0])]].label
                         for n, i in zip(names, (0, -1))]
                group = seq.group_at(scope, mid)
                order.append((scope, c.points[0][1], "message", c.label, tuple(names),
                              seq.group_label(scope, group) if group else ""))
        lines.append((c.label, tuple(names), styles.get(c.cid, d2_style(c)), arrows(c)))
    # Order means something only inside one diagram: side by side, two diagrams' items
    # interleave by height, and d2 re-spaces each on its own (a false alarm, 2026-10-19).
    by_scope: dict[str, list] = {}
    for o in sorted(order, key=lambda o: o[1]):
        by_scope.setdefault(o[0], []).append(o[2:])
    actor_rows: dict[str, list[str]] = {}
    for scope, _, label in sorted(actors, key=lambda a: (str(a[0]), a[1])):
        actor_rows.setdefault(scope, []).append(label)
    return shapes, lines, by_scope, actor_rows


def changed_styles(base: dict[str, Cell], edited: dict[str, Cell]) -> dict[str, dict[str, str]]:
    """For each original cell, only the style values the person changed in draw.io."""
    first = {}
    for c in base.values():
        if c.d2_id:
            first.setdefault(c.d2_id, c)
    out, seen = {}, set()
    for c in edited.values():
        if c.d2_id in first and c.d2_id not in seen:
            seen.add(c.d2_id)
            before = d2_style(first[c.d2_id])
            out[c.cid] = {p: v for p, v in d2_style(c).items() if before.get(p) != v}
    return out


def verify(edited: dict[str, Cell], result: dict[str, Cell], new_cids: set[str],
           base: dict[str, Cell] | None = None) -> list[str]:
    """What the edited file shows that the new .d2 does not draw. Draw.io keys a new cell
    never set are left out: d2's theme decides those."""
    left: list[str] = []
    es, el, eo, ea = signatures(edited, new_cids, changed_styles(base, edited) if base else None)
    rs, rl, ro, ra = signatures(result)
    new_labels = {edited[c].label for c in new_cids if c in edited}

    def take(want, pool, loose, shape=False):
        for i, got in enumerate(pool):
            if want[0] != got[0]:
                continue
            ok = True
            if shape:  # label, d2 shape, style, role
                if want[1] and got[1] and want[1] != got[1] and not (loose and want[1] in ("rectangle", "page")):
                    ok = False
                ok = ok and (loose or all(got[2].get(p, v) == v for p, v in want[2].items()))
                ok = ok and (not want[3] or not got[3] or want[3] == got[3])  # the role is never loose
            else:  # line: label, ends, style, arrows
                ok = want[1] == got[1] and (loose or all(got[2].get(p, v) == v for p, v in want[2].items()))
                if ok and not loose and want[3] and got[3]:
                    ok = ARROWS.get(want[3]["target"][0]) == ARROWS.get(got[3]["target"][0])
            if ok:
                return pool.pop(i)
        return None

    for want in es:
        if take(want, rs, want[0] in new_labels, shape=True) is None:
            role = f", {want[3]}" if want[3] else ""
            left.append(f"shape {want[0]!r} ({want[1] or 'custom outline'}{role}) is not drawn as in draw.io")
    for want in el:
        if take(want, rl, want[0] in new_labels or want[3] == {}) is None:
            left.append(f"line {want[0]!r} between {want[1][0]!r} and {want[1][1]!r} is not drawn as in draw.io")
    left += [f"the new .d2 also draws shape {got[0]!r}" for got in rs]
    # a new actor's lifeline is d2's doing, not an extra: draw.io never drew one
    rl = [got for got in rl if not (got[0] == "" and got[1][1] is None and got[1][0] in new_labels)]
    left += [f"the new .d2 also draws line {got[0]!r} between {got[1][0]!r} and {got[1][1]!r}" for got in rl]
    def say(item) -> str:
        kind, label, where, group = item
        on = f"on {where!r}" if kind == "note" else f"from {where[0]!r} to {where[1]!r}"
        return f"{kind} {label!r} {on} in {group or 'no group'!r}"

    for scope in sorted(set(eo) | set(ro), key=str):
        mine, theirs = eo.get(scope, []), ro.get(scope, [])
        if mine != theirs:
            i = next((n for n, (a, b) in enumerate(zip(mine, theirs)) if a != b), min(len(mine), len(theirs)))
            want = say(mine[i]) if i < len(mine) else "nothing"
            got = say(theirs[i]) if i < len(theirs) else "nothing"
            where = f" in {scope!r}" if scope else ""
            left.append(f"order or group differs{where} at item {i + 1}: draw.io has {want}, the .d2 draws {got}")
    for scope in sorted(set(ea) | set(ra), key=str):
        if ea.get(scope) and ea.get(scope) != ra.get(scope):
            where = f" in {scope!r}" if scope else ""
            left.append(f"actor order differs{where}: draw.io has {ea.get(scope)}, the .d2 draws {ra.get(scope)}")
    return left


# --------------------------------------------------------------------------- main


def main() -> int:
    p = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    p.add_argument("drawio", help="the edited .drawio file (made by to_drawio.py)")
    p.add_argument("--base", help="the .d2 the draw.io file came from (default: same stem, same folder)")
    p.add_argument("-o", "--output", help="where to write the result (default: BASE.from-drawio.d2)")
    p.add_argument("--force", action="store_true", help="use a .d2 whose fingerprint does not match")
    args, d2_flags = p.parse_known_args()

    src = Path(args.drawio)
    base_path = Path(args.base) if args.base else src.with_suffix(".d2")
    if not src.is_file() or not base_path.is_file():
        print(f"need the draw.io file and its .d2: {src} / {base_path}")
        return 2
    out = Path(args.output) if args.output else base_path.with_name(base_path.stem + ".from-drawio.d2")
    if out.resolve() in (base_path.resolve(), src.resolve()):
        # the draw.io file too: writing d2 text over the edits it holds would lose them (found 2026-10-19)
        print("refusing to overwrite the base .d2 or the draw.io file; pick another -o")
        return 2

    pages = ET.parse(src).getroot().findall("diagram")
    edited, meta = read_page(pages[0])
    if len(pages) > 1:
        print(f"note: {len(pages) - 1} more board(s) in the file; only the first page is brought back")
    base_text = base_path.read_text(encoding="utf-8")
    want = meta.get("d2_source_sha256")
    if want and want != source_fingerprint(base_text):
        if not args.force:
            print(f"{base_path.name} is not the .d2 this draw.io file was made from (fingerprint differs).\n"
                  "Changes would be measured against the wrong starting point. Pass the original with --base,\n"
                  "or --force to accept that.")
            return 2
        print("warning: fingerprint differs; going ahead because of --force")
    elif not want:
        print("note: no source fingerprint in this draw.io file (made before fingerprints were recorded);\n"
              f"      assuming {base_path.name} is the .d2 it came from")
    flags = d2_flags or (meta.get("d2_flags") or "").split()

    base_doc, base_pages = build(base_path, flags)
    if base_pages[0].meta.get("d2_version") and meta.get("d2_version") and \
            base_pages[0].meta["d2_version"] != meta["d2_version"]:
        print(f"warning: made with d2 {meta['d2_version']}, now {base_pages[0].meta['d2_version']}; colours or "
              "numbering may differ")
    base_cells, _ = read_page(base_doc.find("diagram"))

    plan, keymap = compare(base_cells, edited, base_text)
    text, lines, placed, problems = apply(base_text, plan, edited, keymap)
    plan.not_carried += problems
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(text, encoding="utf-8")

    inserted = len(plan.seq_messages) + len(plan.seq_actors) + len(plan.repoints) if placed else 0
    print(f"wrote {out}")
    print(f"  {len(plan.carried)} change(s) carried: {inserted} placed in the sequence, "
          f"{len(lines)} statement(s) appended")
    for line in plan.carried:
        print(f"    + {line}")
    for line in plan.notes:
        print(f"  note: {line}")
    if not placed and (plan.seq_messages or plan.seq_actors or plan.repoints):
        print("  note: could not read the .d2's sequence statements reliably; new and re-pointed messages were "
              "appended instead of placed")

    try:
        result_doc, _ = build(out, flags, cwd=base_path.resolve().parent)  # icons resolve beside the base
    except SystemExit as e:  # build() exits when d2 refuses the file
        print(f"  NOT carried: the new .d2 does not compile -- {e}")
        return 1
    result_cells, _ = read_page(result_doc.find("diagram"))
    new_cids = {c.cid for c in edited.values() if c.cid not in base_cells}
    left = plan.not_carried + verify(edited, result_cells, new_cids, base_cells)
    if left:
        print(f"  NOT carried ({len(left)}):")
        for line in left:
            print(f"    - {line}")
        return 1
    print("  verified: the new .d2 draws what the edited draw.io file shows, in the same order (positions aside)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
