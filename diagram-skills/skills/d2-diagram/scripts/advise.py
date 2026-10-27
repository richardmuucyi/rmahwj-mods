#!/usr/bin/env python3
"""Propose a diagram type, a layout, a theme shortlist and the vectors worth adding.

This runs BEFORE any .d2 is written. It answers the four questions that decide whether a
diagram is any good, at the point where changing your mind is still free:

    1. What KIND of diagram is this?          -- with a runner-up and when to switch
    2. Which layout engine does that need?    -- some genres only work under one
    3. Which themes suit it, and how many?    -- read live from the binary, never hardcoded
    4. What could this diagram carry?         -- information vectors and vector assets

It is a PROPOSAL, not a decision. Every match prints the signal that triggered it so the
caller can see the reasoning and override it. A classifier that cannot show its work is
worse than no classifier, because it launders a guess into an answer.

Usage:
    python advise.py "draw the token handshake between the app and the payments API"
    python advise.py "the library lending schema" --json
    python advise.py "..." --icons-dir ./logos       # also list local .svg artwork
    python advise.py --type sequence_diagram          # skip classification, just advise
    python advise.py "..." --check-icons              # live-verify hosted icon URLs
    python advise.py --themes-for sql_table           # just the theme answer

Exit 0 always unless the d2 binary cannot be found -- this tool advises, it never gates.
"""

from __future__ import annotations

import argparse
import json
import re
import shutil
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

import render  # noqa: E402  -- reuse the verified binary lookup

# Artwork that ships with this skill. Mentioned in the proposal so a caller knows it exists;
# a folder of the user's own logos is scanned only when they pass --icons-dir.
BUNDLED_ICONS = HERE.parent / "assets" / "icons"


# --------------------------------------------------------------------------------------
# 1. Diagram-type classification
# --------------------------------------------------------------------------------------
# Multi-word signals score 2, single words score 1: "who calls whom" is far stronger
# evidence than the bare word "call". Ties break toward the plainer form, because an
# architecture diagram forced into a special genre is worse than the reverse.

GENRES = [
    {
        "type": "sequence_diagram",
        "label": "Sequence diagram",
        "why": "the question is who calls whom, in what order",
        "layout": None,
        "layout_why": "self-laid-out; the layout engine is not consulted",
        "signals_2": ["who calls", "call order", "in what order", "back and forth",
                      "request and response", "handshake", "round trip", "message flow",
                      "happy path and", "conversation between"],
        "signals_1": ["sequence", "handshake", "protocol", "token", "auth", "oauth",
                      "request", "response", "retry", "timeout", "callback", "webhook"],
        "watch": "Actors used inside a group must be declared at top level first, and "
                 "declaration order IS the layout.",
    },
    {
        "type": "sql_table",
        "label": "ERD / SQL tables",
        "why": "it describes stored data and the relationships between records",
        "layout": "elk",
        "layout_why": "under dagre a foreign key attaches to the whole table instead of "
                      "the exact row, which defeats the point of an ERD",
        "signals_2": ["entity relationship", "database schema", "data model",
                      "foreign key", "primary key", "table structure", "er diagram"],
        "signals_1": ["schema", "erd", "table", "tables", "column", "columns", "database",
                      "db", "cardinality", "join", "record", "rows"],
        "watch": "Rows are not shapes; cardinality comes from the cf-* arrowheads.",
    },
    {
        "type": "class",
        "label": "UML class diagram",
        "why": "it describes code structure -- types, fields, methods, inheritance",
        "layout": "elk",
        "layout_why": "ELK routes class diagrams more cleanly than dagre",
        "signals_2": ["class diagram", "object model", "type hierarchy",
                      "inheritance tree", "code structure"],
        "signals_1": ["uml", "class", "classes", "interface", "inheritance", "method",
                      "methods", "subclass", "abstract"],
        "watch": "A key containing ( is a method. `#` for protected must be escaped as \\#, "
                 "or the line is parsed as a comment and vanishes.",
    },
    {
        "type": "grid",
        "label": "Grid / matrix",
        "why": "the content is tabular -- rows and columns, not a graph",
        "layout": None,
        "layout_why": "the grid takes positioning away from the layout engine entirely",
        "signals_2": ["status matrix", "comparison table", "table of", "grid of",
                      "who owns what", "raci", "coverage matrix"],
        "signals_1": ["matrix", "grid", "table", "roster", "checklist", "status",
                      "spreadsheet", "columns"],
        "watch": "Declare grid-rows FIRST for a row-major table; grid-columns alone "
                 "fills column-wise and scrambles a header row.",
    },
    {
        "type": "layers",
        "label": "Plain shapes + layers (C4-style drill-down)",
        "why": "it wants the same system at more than one level of zoom",
        "layout": None,
        "layout_why": "any engine; ELK if routes get messy at the detailed levels",
        "signals_2": ["c4 model", "drill down", "zoom level", "levels of detail",
                      "context and container", "high level then", "overview then detail"],
        "signals_1": ["c4", "layers", "zoom", "levels", "clickable", "navigate"],
        "watch": "layers inherit NOTHING -- each board is a fresh level, so shared nodes "
                 "must be redeclared. Multi-board writes a directory.",
    },
    {
        "type": "scenarios",
        "label": "Plain shapes + scenarios",
        "why": "it contrasts the same system in two states",
        "layout": None,
        "layout_why": "any engine",
        "signals_2": ["failure mode", "normal vs", "degraded mode", "what if",
                      "when it fails", "fall back", "happy path versus", "before and after"],
        "signals_1": ["degraded", "fallback", "outage", "unreachable", "failover",
                      "contingency"],
        "watch": "scenarios INHERIT the base board, so only state the differences. "
                 "Multi-board writes a directory.",
    },
    {
        "type": "steps",
        "label": "Plain shapes + steps",
        "why": "it is one thing unfolding over time, built up stage by stage",
        "layout": None,
        "layout_why": "any engine",
        "signals_2": ["step by step", "over time", "stage by stage", "build up",
                      "phase by phase", "walk through"],
        "signals_1": ["steps", "phases", "stages", "timeline", "progression", "rollout",
                      "migration"],
        "watch": "steps inherit the PREVIOUS step, so each board is a delta on the last.",
    },
    {
        "type": "flowchart",
        "label": "Flowchart (plain shapes + diamond)",
        "why": "it is a process with decision points",
        "layout": None,
        "layout_why": "dagre; set direction: down for a process read top to bottom",
        "signals_2": ["decision tree", "if this then", "flow chart", "how do i decide",
                      "which branch", "routing rules", "what happens when",
                      "what happens if", "including what happens"],
        "signals_1": ["flowchart", "decide", "decision", "branch", "if", "else",
                      "workflow", "process", "approve", "reject", "flow", "expires",
                      "rejected"],
        "watch": "Use shape: diamond for decisions and label BOTH outgoing edges; an "
                 "unlabelled branch is a diagram that has to be guessed at.",
    },
    {
        "type": "state_machine",
        "label": "State machine (plain shapes + circle pseudo-states)",
        "why": "it is a lifecycle -- a thing moving between named states",
        "layout": None,
        "layout_why": "dagre; ELK if the transitions cross heavily",
        "signals_2": ["state machine", "state diagram", "lifecycle of", "status "
                      "transitions", "moves between states"],
        "signals_1": ["lifecycle", "state", "states", "transition", "pending", "expired"],
        "watch": "D2 has no dedicated state-diagram mode; use a circle for start/end "
                 "pseudo-states and label every transition with its trigger.",
    },
    {
        "type": "plain",
        "label": "Plain shapes + containers",
        "why": "structure -- what exists and what talks to what. The right default",
        "layout": None,
        "layout_why": "dagre; switch to ELK if connections start crossing badly",
        "signals_2": ["how does", "talks to", "system architecture", "moving parts",
                      "network topology", "deployment topology", "org chart",
                      "integration diagram"],
        "signals_1": ["architecture", "topology", "system", "systems", "components",
                      "services", "deployment", "network", "infrastructure", "estate",
                      "integration", "structure", "folders"],
        "watch": "Group with containers, not with shapes styled to look grouped -- "
                 "containers are the only grouping the layout engine understands.",
    },
]


def classify(text: str):
    """Score every genre against the request and return them best-first, with evidence."""
    low = " " + re.sub(r"[^a-z0-9 ]+", " ", text.lower()) + " "
    scored = []
    for g in GENRES:
        hits, score = [], 0
        for phrase in g["signals_2"]:
            if phrase in low:
                hits.append(phrase)
                score += 2
        for word in g["signals_1"]:
            if re.search(r"\b" + re.escape(word) + r"\b", low):
                hits.append(word)
                score += 1
        # "plain" is the default: it starts with a small floor so that a request with no
        # recognisable signal lands on boxes-and-arrows rather than on nothing.
        if g["type"] == "plain":
            score += 0.5
        if score:
            scored.append((score, hits, g))
    scored.sort(key=lambda r: -r[0])
    # A word appearing in both signal lists would otherwise be reported twice.
    return [(s, list(dict.fromkeys(h)), g) for s, h, g in scored]


# --------------------------------------------------------------------------------------
# 2. Themes -- read live from the binary
# --------------------------------------------------------------------------------------
# Never hardcode this list. It is what the INSTALLED d2 supports, and it is the honest
# answer to "how many themes do I have"; a literal table here would silently go stale the
# day the binary is upgraded.

def read_themes(d2_bin: str):
    """Parse `d2 themes` into [{id, name, mode}]. Returns [] if the call fails."""
    try:
        out = subprocess.run([d2_bin, "themes"], capture_output=True, text=True, timeout=20)
    except Exception:
        return []
    if out.returncode != 0:
        return []
    themes, mode = [], "light"
    for line in out.stdout.splitlines():
        s = line.strip()
        if s.lower().startswith("light"):
            mode = "light"
            continue
        if s.lower().startswith("dark"):
            mode = "dark"
            continue
        m = re.match(r"-\s*(.+?):\s*(\d+)\s*$", s)
        if m:
            themes.append({"id": int(m.group(2)), "name": m.group(1).strip(), "mode": mode})
    return themes


# Known, verified theme properties. Anything not listed here is treated as "no known
# type-specific issue" rather than being given an invented opinion.
THEME_NOTES = {
    300: ("caveat", "Terminal also forces UPPERCASE labels, a mono font, zero border "
                    "radius, dotted container fills and a double outer border. Great for "
                    "an infra/terminal feel; wrong wherever labels are proper nouns or "
                    "column names. Cancel the caps with style.text-transform: none."),
    301: ("caveat", "Same overrides as Terminal, without the colour."),
    303: ("purpose_built", "Built for C4 diagrams; pairs with shape: c4-person."),
    8:   ("accessibility", "The pick when the diagram must survive colour-vision "
                           "deficiency, or will be printed."),
    200: ("dark", "One of only two dark themes. Pair via --dark-theme=200 so the diagram "
                  "follows the viewer's system setting."),
    201: ("dark", "The other dark option."),
}

# Genres where a theme's own opinions collide with the genre's needs.
TYPE_THEME_RULES = {
    "sql_table": {"discourage": [300, 301],
                  "reason": "Terminal upper-cases every label, which mangles column names."},
    "class":     {"discourage": [300, 301],
                  "reason": "Terminal upper-cases member names and return types."},
    "grid":      {"discourage": [300, 301],
                  "reason": "Terminal puts a dotted fill-pattern on containers, which "
                            "fights a grid-gap: 0 solid table."},
    "layers":    {"prefer": [303],
                  "reason": "C4 theme, if the layers really are C4 levels."},
}


def theme_advice(themes, dtype):
    light = [t for t in themes if t["mode"] == "light"]
    dark = [t for t in themes if t["mode"] == "dark"]
    rule = TYPE_THEME_RULES.get(dtype, {})
    discouraged = set(rule.get("discourage", []))
    preferred = set(rule.get("prefer", []))

    buckets = {"preferred": [], "clean": [], "caveat": [], "discouraged": []}
    for t in themes:
        kind, note = THEME_NOTES.get(t["id"], (None, None))
        if t["id"] in discouraged:
            buckets["discouraged"].append((t, rule.get("reason", "")))
        elif t["id"] in preferred:
            buckets["preferred"].append((t, note or ""))
        elif kind in ("caveat",):
            buckets["caveat"].append((t, note))
        elif kind in ("purpose_built",) and t["id"] not in preferred:
            buckets["caveat"].append((t, note + " Odd outside that genre."))
        else:
            buckets["clean"].append((t, note or ""))
    return {"total": len(themes), "light": len(light), "dark": len(dark), "buckets": buckets}


# --------------------------------------------------------------------------------------
# 3. Vectors -- both senses of the word
# --------------------------------------------------------------------------------------
# (a) INFORMATION vectors: extra dimensions the diagram can carry.
# (b) VECTOR ASSETS: actual .svg artwork that can be placed on a node.

INFO_VECTORS = {
    "classes":        "A named palette applied by role (tier, owner, status) so a restyle "
                      "is one edit instead of a sweep.",
    "containers":     "Boundaries -- trust zones, teams, deployment units, network segments.",
    "edge-labels":    "The verb on every connection. `api -> db: writes audit rows` "
                      "explains more than the boxes do, for one line.",
    "edge-style":     "Sync vs async, primary vs fallback, as stroke width and dash "
                      "rather than as another legend entry.",
    "shape-semantics": "cylinder = store, queue = broker, cloud = external, person = human, "
                       "diamond = decision. Meaning no label has to repeat.",
    "failure-path":   "The exception drawn as a styled edge, so one diagram covers both "
                      "the happy and unhappy case.",
    "legend":         "A `d2-legend` explaining the edge vocabulary. Entries must be "
                      "CONNECTIONS -- shapes render as meaningless rectangles.",
    "tooltips":       "Hover detail (owner, SLA, spec version) that would clutter a label. "
                      "Survives in inline SVG / object / iframe, lost in <img>.",
    "links":          "Click-through -- to another board (`link: layers.detail`) or out to "
                      "the spec. Turns one diagram into a navigable set.",
    "scenarios":      "The same system in a second state, inheriting the first.",
    "layers":         "A second level of zoom on a fresh board.",
    "steps":          "The same system built up stage by stage, each inheriting the last.",
    "grid":           "Tabular structure where a graph would be the wrong shape.",
    "annotations":    "`shape: text` notes pinned with `near`, for caveats that belong on "
                      "the diagram rather than in the prose around it.",
    "icons":          "Vector artwork on nodes -- see the vector-asset section.",
    "dark-pairing":   "`--dark-theme` so the diagram follows the reader's system setting.",
    "sketch":         "Hand-drawn rendering -- reads as a draft, deliberately. Wrong for a "
                      "signed-off spec.",
}

# Which vectors are worth OFFERING for each genre. Everything else stays available; this
# is about what to raise unprompted, not what is permitted.
VECTORS_BY_TYPE = {
    "sequence_diagram": ["edge-labels", "edge-style", "annotations", "failure-path", "classes"],
    "sql_table": ["classes", "annotations", "tooltips", "legend"],
    "class": ["classes", "annotations", "tooltips"],
    "grid": ["classes", "annotations", "shape-semantics"],
    "layers": ["links", "layers", "containers", "classes", "icons", "legend", "annotations"],
    "scenarios": ["scenarios", "failure-path", "edge-style", "classes", "legend"],
    "steps": ["steps", "edge-labels", "classes", "annotations"],
    "flowchart": ["shape-semantics", "edge-labels", "classes", "failure-path", "annotations"],
    "state_machine": ["shape-semantics", "edge-labels", "classes", "annotations"],
    "plain": ["containers", "classes", "shape-semantics", "edge-labels", "edge-style",
              "legend", "tooltips", "icons", "links", "annotations"],
}

# Hosted icons verified to return 200. Much of icons.terrastruct.com returns 403, and a
# dead URL renders as a silently missing icon -- no error, exit 0 -- so this list is
# deliberately short and re-checkable with --check-icons rather than long and hopeful.
KNOWN_GOOD_ICONS = [
    "dev%2Fpostgresql.svg", "dev%2Fredis.svg", "dev%2Fmysql.svg", "dev%2Fdocker.svg",
    "dev%2Fnginx.svg", "dev%2Fpython.svg", "dev%2Fgo.svg", "dev%2Freact.svg",
    "aws%2FCompute%2FAmazon-EC2.svg", "aws%2FDatabase%2FAmazon-DynamoDB.svg",
    "infra%2F019-network.svg", "infra%2F002-backup.svg", "essentials%2F005-programmer.svg",
]


def local_vector_assets(request: str, icons_dir):
    """Find .svg artwork in a folder the user points at, and flag which ones the request mentions.

    d2 accepts a relative path as an `icon:` value, so a local asset needs no network at
    render time and cannot 403 -- which makes these strictly better than hosted icons
    wherever one exists.

    This walks the tree rather than reading one level. A scan that globs only the
    immediate children silently drops to nothing the day the logos are grouped into
    subfolders -- no error, exit 0, just a proposal that stops mentioning artwork that is
    sitting right there. Group by the folder each file is actually in, so it survives
    the next reorganisation too.
    """
    if not icons_dir:
        return []
    root = Path(icons_dir)
    if not root.is_dir():
        return []
    low = request.lower()
    groups = {}
    for p in root.rglob("*.svg"):
        if len(p.relative_to(root).parts) > 4:
            continue
        groups.setdefault(p.parent, []).append(p.name)

    found = []
    for parent, files in sorted(groups.items()):
        subject = re.sub(r"\s*(logos?|emblems?|icons?|crests?|marks?)\s*$", "",
                         parent.name, flags=re.I).strip() or parent.name
        tokens = [t for t in re.split(r"\W+", subject.lower()) if len(t) > 2]
        mentioned = any(t in low for t in tokens) if tokens else False
        # A folder of mixed logos is named for what it holds, not whose they are, so also
        # match the request against each file's own name ("library" -> library-crest.svg).
        generic = {"logo", "logos", "icon", "icons", "mark", "crest", "emblem", "brand"}
        named = [f for f in files
                 if any(len(t) > 3 and t not in generic and t in low
                        for t in re.split(r"[\W_-]+", Path(f).stem.lower()))]
        if named:
            mentioned, files = True, named
        found.append({"subject": subject, "dir": str(parent),
                      "files": sorted(files), "mentioned": mentioned})
    return found


def check_icons(paths):
    import urllib.request
    results = []
    for p in paths:
        url = "https://icons.terrastruct.com/" + p
        try:
            req = urllib.request.Request(url, method="HEAD")
            with urllib.request.urlopen(req, timeout=8) as r:
                results.append((p, r.status))
        except Exception as exc:
            code = getattr(exc, "code", None)
            results.append((p, code if code else "ERR"))
    return results


# --------------------------------------------------------------------------------------
# Reporting
# --------------------------------------------------------------------------------------

def bullet(s, indent="  "):
    return indent + "- " + s


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("request", nargs="?", default="", help="the request, in the user's words")
    ap.add_argument("--type", help="skip classification and advise for this type")
    ap.add_argument("--themes-for", help="print only the theme answer for this type")
    ap.add_argument("--check-icons", action="store_true",
                    help="live-verify the hosted icon URLs (many 403 silently)")
    ap.add_argument("--icons-dir", help="a folder of .svg logos to list as vector assets")
    ap.add_argument("--json", action="store_true")
    args = ap.parse_args()

    d2_bin = render.find_d2()
    themes = read_themes(d2_bin)

    if args.themes_for:
        dtype = args.themes_for
        adv = theme_advice(themes, dtype)
        print_themes(dtype, adv)
        return 0

    if args.type:
        genre = next((g for g in GENRES if g["type"] == args.type), None)
        if not genre:
            print("unknown type: " + args.type, file=sys.stderr)
            print("known: " + ", ".join(g["type"] for g in GENRES), file=sys.stderr)
            return 2
        ranked = [(99, ["--type given"], genre)]
    else:
        if not args.request:
            ap.error("give a request, or --type")
        ranked = classify(args.request)

    if not ranked:
        print("no signal matched; defaulting to plain shapes + containers")
        ranked = [(0.5, [], next(g for g in GENRES if g["type"] == "plain"))]

    top_score, top_hits, top = ranked[0]
    runner = ranked[1] if len(ranked) > 1 else None
    adv = theme_advice(themes, top["type"])
    assets = local_vector_assets(args.request, args.icons_dir)
    vectors = VECTORS_BY_TYPE.get(top["type"], VECTORS_BY_TYPE["plain"])

    if args.json:
        print(json.dumps({
            "request": args.request,
            "proposed": {"type": top["type"], "label": top["label"], "why": top["why"],
                         "score": top_score, "matched": top_hits,
                         "layout": top["layout"], "layout_why": top["layout_why"],
                         "watch": top["watch"]},
            "runner_up": ({"type": runner[2]["type"], "label": runner[2]["label"],
                           "score": runner[0], "matched": runner[1]} if runner else None),
            "themes": {"total": adv["total"], "light": adv["light"], "dark": adv["dark"],
                       "preferred": [t["id"] for t, _ in adv["buckets"]["preferred"]],
                       "clean": [t["id"] for t, _ in adv["buckets"]["clean"]],
                       "caveat": [t["id"] for t, _ in adv["buckets"]["caveat"]],
                       "discouraged": [t["id"] for t, _ in adv["buckets"]["discouraged"]]},
            "information_vectors": {v: INFO_VECTORS[v] for v in vectors},
            "vector_assets": assets,
        }, indent=2))
        return 0

    print("=" * 78)
    print("PROPOSAL" + (("  for: " + args.request) if args.request else ""))
    print("=" * 78)

    print("\n1. DIAGRAM TYPE")
    print("   -> " + top["label"] + "  (" + top["type"] + ")")
    print("      because " + top["why"] + ".")
    if top_hits and top_hits != ["--type given"]:
        print("      matched: " + ", ".join(repr(h) for h in top_hits[:8]))
    if runner:
        print("   runner-up: " + runner[2]["label"] + "  (" + runner[2]["type"] + ")")
        if runner[1]:
            print("      matched: " + ", ".join(repr(h) for h in runner[1][:6]))
        print("      switch to it if " + runner[2]["why"] + ".")
    print("   watch out: " + top["watch"])

    print("\n2. LAYOUT")
    if top["layout"]:
        print("   -> --layout=" + top["layout"] + "  (required, not cosmetic)")
    else:
        print("   -> no override needed")
    print("      " + top["layout_why"])

    print_themes(top["type"], adv, prefix="\n3. ")

    print("\n4. INFORMATION VECTORS worth adding")
    for v in vectors:
        print(bullet(v + " -- " + INFO_VECTORS[v], "   "))

    print("\n5. VECTOR ASSETS (artwork you can put on a node)")
    if assets:
        mentioned = [a for a in assets if a["mentioned"]]
        if mentioned:
            print("   Referenced by this request, in " + str(args.icons_dir) + ":")
            for a in mentioned:
                print(bullet(a["subject"] + " -- " + ", ".join(a["files"]), "     "))
        others = [a for a in assets if not a["mentioned"]]
        if others:
            print("   Also available locally: " + ", ".join(a["subject"] for a in others))
        print("   Use a relative path -- `icon: ./library-crest.svg`. A local asset cannot")
        print("   403 and needs no network at render time.")
    elif args.icons_dir:
        print("   No .svg artwork found under " + str(args.icons_dir) + ".")
    else:
        print("   Local artwork: pass --icons-dir <folder> to list a folder of .svg logos.")
    print("   Bundled with this skill: " + str(BUNDLED_ICONS) + " (people/, logos/).")
    print("   Hosted set: https://icons.terrastruct.com -- but much of it returns 403,")
    print("   and a dead URL renders as a silently missing icon. Verify before use:")
    print("     python advise.py --check-icons")
    if args.check_icons:
        print("\n   live check:")
        for p, code in check_icons(KNOWN_GOOD_ICONS):
            print("     " + str(code) + "  " + p)
    print("   Sizing: give any icon-bearing node explicit width/height, or the icon is")
    print("   drawn on top of its own label. icon.near: top-left makes it WORSE.")

    print("\n" + "=" * 78)
    print("This is a proposal. Say which parts to change before the .d2 gets written --")
    print("that is the cheapest moment to change your mind.")
    return 0


def print_themes(dtype, adv, prefix="\n"):
    b = adv["buckets"]
    usable = len(b["preferred"]) + len(b["clean"])
    print(prefix + "THEMES  -- " + str(adv["total"]) + " installed ("
          + str(adv["light"]) + " light, " + str(adv["dark"]) + " dark)")
    print("   For a " + dtype + " diagram: " + str(usable) + " usable as-is, "
          + str(len(b["caveat"])) + " with a caveat, "
          + str(len(b["discouraged"])) + " discouraged.")
    if b["preferred"]:
        print("   Preferred:")
        for t, note in b["preferred"]:
            print(bullet(str(t["id"]) + "  " + t["name"] + (" -- " + note if note else ""), "     "))
    if b["clean"]:
        ids = ", ".join(str(t["id"]) for t, _ in b["clean"])
        print("   Usable as-is (" + str(len(b["clean"])) + "): " + ids)
        for t, note in b["clean"]:
            if note:
                print(bullet(str(t["id"]) + "  " + t["name"] + " -- " + note, "     "))
    if b["caveat"]:
        print("   With a caveat:")
        for t, note in b["caveat"]:
            print(bullet(str(t["id"]) + "  " + t["name"] + " -- " + note, "     "))
    if b["discouraged"]:
        print("   Discouraged for this type:")
        for t, note in b["discouraged"]:
            print(bullet(str(t["id"]) + "  " + t["name"] + " -- " + note, "     "))


if __name__ == "__main__":
    sys.exit(main())
