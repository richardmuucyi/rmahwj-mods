"""Round-trip cases from the 2026-10-19 adversarial review of from_drawio.py.

Most were false passes: the edit did not come back right and the check still said "verified".
Each case is (name, base .d2 text or None for the cloud-merge fixture, edit(root) -> None,
check(out_text, log, exit_code) -> list of problems). tests/eval_from_drawio.py runs them.
"""
from __future__ import annotations

from xml.etree import ElementTree as ET

from round_trip_edits import NOTE_TYPE, _free_edge, _geom, _objs, _style

SEQ3 = "shape: sequence_diagram\na -> b: hi\nb -> c: yo\n"


def _x(objs, name):
    g = _geom(objs[name])
    return float(g.get("x")) + float(g.get("width")) / 2


def _y(objs, d2_id, which="sourcePoint"):
    return float(next(p for p in _geom(objs[d2_id]).findall("mxPoint") if p.get("as") == which).get("y"))


def _note(root, cid, label, x_centre, y):
    cell = ET.SubElement(root, "mxCell", id=cid, value=label, style="shape=note;whiteSpace=wrap;html=1;",
                         vertex="1", parent="1")
    ET.SubElement(cell, "mxGeometry", x=str(x_centre - 60), y=str(y), width="120", height="36", **{"as": "geometry"})


def _box(root, cid, label, x, y, w=90, h=60):
    cell = ET.SubElement(root, "mxCell", id=cid, value=label, style="rounded=0;whiteSpace=wrap;html=1;",
                         vertex="1", parent="1")
    ET.SubElement(cell, "mxGeometry", x=str(x), y=str(y), width=str(w), height=str(h), **{"as": "geometry"})


def _lines(text):
    return text.split("\n")


def _at(text, fragment):
    return next((i for i, line in enumerate(_lines(text)) if fragment in line), -1)


# 1. Two new items in one gap must keep their drawn order.
def e_gap(root):
    o = _objs(root)
    a1 = _y(o, "(branch -> pr)[0]")
    _free_edge(root, "Rv-1", "X1 · ping", _x(o, "pr"), _x(o, "branch"), a1 + 24)
    _note(root, "Rv-2", "N1 below X1", _x(o, "pr"), a1 + 49)


def c_gap(text, log, code):
    p = [] if code == 0 else [f"exit {code}"]
    if not (_at(text, "A1 · you create") < _at(text, "X1 · ping") < _at(text, 'pr."N1 below X1"') < _at(text, "A2 · review")):
        p.append("X1 and N1 are not in drawn order between A1 and A2")
    return p


# 2. A note whose source key is quoted ("checked") must still anchor the note drawn below it.
QUOTED_NOTE = "  vm.\"checked\""


def base_quoted(fixture_text):
    lines = _lines(fixture_text)
    i = next(n for n, line in enumerate(lines) if "B2 · git push" in line)
    return "\n".join(lines[:i + 1] + [QUOTED_NOTE] + lines[i + 1:])


def e_quoted(root):
    o = _objs(root)
    top = float(_geom(o["vm.checked"]).get("y"))
    _note(root, "Rv-3", "after checked", _x(o, "vm"), top + 30)


def c_quoted(text, log, code):
    p = [] if code == 0 else [f"exit {code}"]
    if not (0 <= _at(text, 'vm."checked"') < _at(text, 'vm."after checked"')):
        p.append("the new note is not below the quoted note")
    return p


# 3. A new actor between a and b must land between them, declared or not.
def e_mid(root):
    o = _objs(root)
    ga, gb = _geom(o["a"]), _geom(o["b"])
    x = (float(ga.get("x")) + float(ga.get("width")) + float(gb.get("x"))) / 2 - 30
    _box(root, "Rv-4", "Mid", x, float(ga.get("y")), 60, float(ga.get("height")))


def c_verified(text, log, code):
    return [] if code == 0 and "verified" in log else [f"exit {code}, not verified"]


# 4. draw.io's editor writes `first<div>second</div>`; the line break must survive.
def e_div(root):
    _objs(root)[NOTE_TYPE].set("label", "type:<div>claude --cloud</div>")


def c_div(text, log, code):
    p = [] if code == 0 else [f"exit {code}"]
    if '.label: "type:\\nclaude --cloud"' not in text:
        p.append("the line break was lost")
    return p


# 4b. Formatting inside a label (bold) cannot be carried and must be reported.
def e_bold(root):
    _objs(root)["pr"].set("label", "<b>GitHub</b><br>pull request page")


def c_reported(*words):
    def check(text, log, code):
        p = [] if code == 1 else [f"exit {code}, wanted 1"]
        reported = log.split("NOT carried", 1)[1] if "NOT carried" in log else ""
        p += [f"{w!r} not reported" for w in words if w not in reported]
        return p
    return check


# 5. Style keys with no d2 equivalent must be reported, not dropped.
def e_unknown(root):
    o = _objs(root)
    _style(o["svc.api"], "fontFamily", "Courier New")
    _style(o["svc.store"], "gradientColor", "#ff0000")


# 7. A removed style key must be reported.
def e_removed(root):
    c = _objs(root)["svc.api"].find("mxCell")
    c.set("style", ";".join(p for p in c.get("style").split(";") if not p.startswith("strokeColor=")))


# 8. A recoloured lifeline must be reported, and the run's other edits must still come back.
def e_lifeline(root):
    o = _objs(root)
    _style(o["(you -- )[0]"], "strokeColor", "#ff0000")
    _style(o["pr"], "fillColor", "#ffe4e6")


def c_lifeline(text, log, code):
    p = c_reported("lifeline")(text, log, code)
    if 'pr.style.fill: "#ffe4e6"' not in text:
        p.append("the other edit (pr fill) was lost")
    if "does not compile" in log:
        p.append("the result does not compile")
    return p


# 9. A colour d2 rejects (draw.io's `default`) must be reported, not written.
def e_default(root):
    _style(_objs(root)["svc.api"], "fillColor", "default")


def c_default(text, log, code):
    p = c_reported("default")(text, log, code)
    if "does not compile" in log:
        p.append("the result does not compile")
    return p


# 10. A sequence diagram inside a container: a grouped message relabelled.
NESTED = "outer: {\n  shape: sequence_diagram\n  a -> b: hi\n  g: {\n    b -> a: yo\n  }\n}\n"


def e_nested(root):
    _objs(root)["outer.(b -> a)[0]"].set("label", "yo!")


def c_nested(text, log, code):
    p = [] if code == 0 else [f"exit {code}"]
    if 'outer.g.(b -> a)[0].label: "yo!"' not in text:
        p.append("the override is not scoped to outer.g")
    return p


# 11. Re-pointing a message onto an actor with no messages must not raise a false alarm.
REPOINT = "shape: sequence_diagram\na; b; c\na -> b: m1\na -> b: m2\na -> b: m3\n"


def e_repoint(root):
    o = _objs(root)
    tp = next(p for p in _geom(o["(a -> b)[0]"]).findall("mxPoint") if p.get("as") == "targetPoint")
    tp.set("x", str(_x(o, "c")))


# 13. Two sequence diagrams on one page: new messages and notes go to the diagram, and the part
# of it, they are drawn in -- stacked (only height tells them apart) and side by side (only x).
# The review suspected every new item went to the first diagram on the page.
TWO = ("alpha: Alpha {\n  shape: sequence_diagram\n  a -> b: hi\n  g: Group G {\n    b -> a: yo\n  }\n}\n"
       "beta: Beta {\n  shape: sequence_diagram\n  x -> y: ping\n  y -> x: pong\n}\n")


def _origin(root, el) -> tuple[float, float]:
    """Absolute top-left of a vertex, or of an edge's parent: draw.io stores children relative."""
    by_id = {e.get("id"): e for e in root}
    x = y = 0.0
    cur = el
    while cur is not None:
        c = cur.find("mxCell") if cur.tag == "UserObject" else cur
        if c is None:
            break
        g = c.find("mxGeometry")
        if c.get("vertex") == "1" and g is not None:
            x, y = x + float(g.get("x", 0)), y + float(g.get("y", 0))
        cur = by_id.get(c.get("parent"))
    return x, y


def e_two(root):
    o = _objs(root)

    def box(d2_id):
        x, y = _origin(root, o[d2_id])
        g = _geom(o[d2_id])
        return x, y, float(g.get("width")), float(g.get("height"))

    def centre_x(d2_id):
        x, _, w, _ = box(d2_id)
        return x + w / 2

    def msg_y(d2_id):
        parent = {e.get("id"): e for e in root}.get(o[d2_id].find("mxCell").get("parent"))
        return (_origin(root, parent)[1] if parent is not None else 0.0) + _y(o, d2_id)

    ping, pong = msg_y("beta.(x -> y)[0]"), msg_y("beta.(y -> x)[0]")
    gx, gy, gw, gh = box("alpha.g")
    alpha_end = max(float(p.get("y")) for p in _geom(o["(alpha.a -- )[0]"]).findall("mxPoint"))
    _free_edge(root, "T2-1", "beta new", centre_x("beta.y"), centre_x("beta.x"), (ping + pong) / 2)
    _note(root, "T2-2", "alpha note in g", centre_x("alpha.a"), gy + 14)
    _free_edge(root, "T2-3", "alpha after g", centre_x("alpha.a"), centre_x("alpha.b"), (gy + gh + alpha_end) / 2)
    _note(root, "T2-4", "beta end note", centre_x("beta.y"), pong + 29)


def c_two(text, log, code):
    p = [] if code == 0 and "verified" in log else [f"exit {code}, not verified"]
    order = [_at(text, f) for f in ("alpha: Alpha", "g: Group G", 'a."alpha note in g"', "b -> a: yo",
                                    "alpha after g", "beta: Beta", "x -> y: ping", "beta new", "y -> x: pong",
                                    'y."beta end note"')]
    if -1 in order or order != sorted(order):
        p.append(f"items out of place (line order {order})")
    return p


# 6. On the fallback path a note drawn in a group lands at the end; the check must say so.
def e_note_in_group(root):
    o = _objs(root)
    _note(root, "Rv-5", "inside A", _x(o, "pr"), _y(o, "(branch -> pr)[0]") + 40)


CASES = [
    ("review: fallback note in a group", "odd", e_note_in_group, c_reported("order")),
    ("review: two new items, one gap", None, e_gap, c_gap),
    ("review: note after a quoted note", "quoted", e_quoted, c_quoted),
    ("review: new actor between a and b", SEQ3, e_mid, c_verified),
    ("review: new actor, a; b; c", "shape: sequence_diagram\na; b; c\na -> b: hi\nb -> c: yo\n", e_mid, c_verified),
    ("review: line break from the editor", None, e_div, c_div),
    ("review: bold inside a label", None, e_bold, c_reported("formatting")),
    ("review: style keys with no d2 twin", "plain", e_unknown, c_reported("fontFamily", "gradientColor")),
    ("review: a removed stroke", "plain", e_removed, c_reported("style.stroke")),
    ("review: recoloured lifeline", None, e_lifeline, c_lifeline),
    ("review: fill set to default", "plain", e_default, c_default),
    ("review: sequence in a container", NESTED, e_nested, c_nested),
    ("review: re-point onto a quiet actor", REPOINT, e_repoint, c_verified),
    ("review: two diagrams, stacked", TWO, e_two, c_two),
    ("review: two diagrams, side by side", "grid-columns: 2\n" + TWO, e_two, c_two),
]
