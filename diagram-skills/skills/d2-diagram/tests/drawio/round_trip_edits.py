"""Edits a person would make in draw.io, written into the XML the way draw.io writes them.

Used by tests/eval_from_drawio.py. Each function edits the <root> of a page that
to_drawio.py made and returns the list of edits it made, by letter, for the test's report.
"""
from __future__ import annotations

import copy
import re
from xml.etree import ElementTree as ET

NOTE_HAPPY = 'pr."Not happy? Close the PR unmerged.\\nmain stays as it was."'
NOTE_TYPE = 'you."type:\\nclaude --cloud \\"your task\\""'


def _objs(root: ET.Element) -> dict[str, ET.Element]:
    return {o.get("d2_id"): o for o in root.iter("UserObject") if o.get("d2_id")}


def _style(o: ET.Element, key: str, value: str) -> None:
    c = o.find("mxCell")
    c.set("style", re.sub(rf"(^|;){key}=[^;]*;", r"\1", c.get("style")) + f"{key}={value};")


def _geom(o: ET.Element) -> ET.Element:
    return o.find("mxCell").find("mxGeometry")


def _free_edge(root: ET.Element, cid: str, label: str, x1: float, x2: float, y: float) -> None:
    edge = ET.SubElement(root, "mxCell", id=cid, value=label, style="endArrow=classic;html=1;", edge="1", parent="1")
    g = ET.SubElement(edge, "mxGeometry", width="50", height="50", relative="1", **{"as": "geometry"})
    ET.SubElement(g, "mxPoint", x=str(x1), y=str(y), **{"as": "sourcePoint"})
    ET.SubElement(g, "mxPoint", x=str(x2), y=str(y), **{"as": "targetPoint"})


def edit_sequence(root: ET.Element) -> list[str]:
    """The cloud-merge sequence diagram: eleven edits, including ones whose place matters."""
    objs = _objs(root)
    objs["you"].set("label", "You<br>(your laptop)")                             # a relabel an actor
    _style(objs["pr"], "fillColor", "#ffe4e6")                                    # b recolour an actor
    objs["(pr -> main)[0]"].set("label", "A3 · Merge it")                        # c relabel a grouped message
    _style(objs["(you -> main)[1]"], "dashed", "0")                              # d make a dashed message solid
    _style(objs["(you -> main)[0]"], "endArrow", "diamond")                      # e change an arrowhead
    _style(objs["(you -> main)[0]"], "endFill", "1")
    root.remove(objs[NOTE_HAPPY])                                                 # f delete a grouped note
    objs[NOTE_TYPE].set("label", "<div>type:</div><div>claude --cloud</div>")    # g reword a note (editor divs)
    vm = _geom(objs["vm"])
    cell = ET.SubElement(root, "mxCell", id="QzX8-1", value="Reviewer", style="rounded=0;whiteSpace=wrap;html=1;",
                         vertex="1", parent="1")                                  # h a new actor, right of vm
    ET.SubElement(cell, "mxGeometry", x=str(float(vm.get("x")) + float(vm.get("width")) + 60), y=vm.get("y"),
                  width="120", height="60", **{"as": "geometry"})
    x = {n: float(_geom(objs[n]).get("x")) + float(_geom(objs[n]).get("width")) / 2 for n in ("you", "main", "vm")}
    _free_edge(root, "QzX8-2", "notify", x["vm"], x["you"], 1990)                # i a new message at the bottom
    a3 = next(p for p in _geom(objs["(pr -> main)[0]"]).findall("mxPoint") if p.get("as") == "sourcePoint")
    _free_edge(root, "QzX8-3", "A3b · tell you", x["main"], x["you"], float(a3.get("y")) + 45)  # j inside Route A
    tp = next(p for p in _geom(objs["(branch -> you)[0]"]).findall("mxPoint") if p.get("as") == "targetPoint")
    tp.set("x", str(x["main"] + 2))                                               # k drag a message's end
    a2 = next(p for p in _geom(objs["(you -> pr)[0]"]).findall("mxPoint") if p.get("as") == "sourcePoint")
    note = ET.SubElement(root, "mxCell", id="QzX8-4", value="pull first", style="shape=note;whiteSpace=wrap;html=1;",
                         vertex="1", parent="1")                                  # l a note on You's lifeline
    ET.SubElement(note, "mxGeometry", x=str(x["you"] - 60), y=str(float(a2.get("y")) + 30), width="120",
                  height="40", **{"as": "geometry"})
    return list("abcdefghijkl")


def edit_plain(root: ET.Element) -> list[str]:
    """01-plain: containers, attached lines, a pasted copy, and one move d2 cannot express."""
    objs = _objs(root)
    objs["svc.api"].set("label", "API gateway")                                  # a relabel inside a container
    _style(objs["svc.store"], "fillColor", "#fde68a")                            # b recolour a custom outline
    c = objs["svc.api"].find("mxCell")                                           # c Edit Style: make it an ellipse
    c.set("style", "ellipse;" + c.get("style").replace("rounded=0;", ""))
    svc = objs["svc"].get("id")
    cache = ET.SubElement(root, "mxCell", id="Pq9-1", value="Cache", style="rounded=0;whiteSpace=wrap;html=1;",
                          vertex="1", parent=svc)                                 # d a new shape in the container
    ET.SubElement(cache, "mxGeometry", x="160", y="110", width="90", height="50", **{"as": "geometry"})
    line = ET.SubElement(root, "mxCell", id="Pq9-2", value="reads", style="endArrow=classic;html=1;", edge="1",
                         parent="1", source=objs["svc.api"].get("id"), target="Pq9-1")  # e a new attached line
    g = ET.SubElement(line, "mxGeometry", width="50", height="50", relative="1", **{"as": "geometry"})
    ET.SubElement(g, "mxPoint", x="0", y="0", **{"as": "sourcePoint"})
    ET.SubElement(g, "mxPoint", x="0", y="0", **{"as": "targetPoint"})
    root.remove(objs["(svc.api -> user)[0]"])                                    # f delete a line
    dup = copy.deepcopy(objs["svc.store"])                                       # g copy and paste outside
    dup.set("id", "Pq9-3")
    dup.find("mxCell").set("parent", "1")
    _geom(dup).set("x", "900")
    _geom(dup).set("y", "300")
    root.append(dup)
    objs["user"].find("mxCell").set("parent", svc)                               # h drag into the container
    return list("abcdefgh")
