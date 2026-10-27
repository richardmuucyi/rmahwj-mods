#!/usr/bin/env python3
"""Convert a mermaid sequenceDiagram to D2, and say honestly what was lost.

This does the MECHANICAL part of the conversion. It does not do the judgement part, and
it does not pretend to: every output carries a header listing what could not survive, so
the next person reading the D2 instead of the mermaid knows what changed.

The triage rule comes first. `alt`/`else` is the construct that decides whether a
conversion is honest at all, because D2 has no else-frame: mermaid draws alternatives as
one frame with dashed dividers, D2 can only stack labelled groups, and stacked groups
read as "these happen in sequence". That is a meaning change, not a cosmetic one. So:

    0 alt/else      convert
    1-2 terminal    convert, two sibling groups read as two endings
    3+ interleaved  REFUSED unless --force -- split by scenario instead

What is mapped:
    participant X as A<br/>B   ->  X: "A\nB"
    rect rgb(...) ... end      ->  a group, titled from the `Note over A, B:` inside it
    par / and / opt / loop     ->  a group labelled with the construct
    A->>B: msg                 ->  A -> B: "n. msg"
    A-->>B: msg                ->  A -> B: "n. msg" with stroke-dash (a return)
    Note over A: t             ->  A."t"
    Note over A, B: t          ->  attached to the FIRST actor (D2 notes span one actor)
    Note right/left of A: t     ->  A."t"
    autonumber                 ->  messages numbered by hand, since D2 has no equivalent
    %%{init: ...}%%            ->  dropped (actor-margin tuning, no equivalent)
    ->>+ / -->>-               ->  activation markers stripped

Usage:
    python from_mermaid.py in.mmd -o out.d2
    python from_mermaid.py in.mmd -o out.d2 --title "Overrides the mermaid title"
    python from_mermaid.py *.mmd --out-dir converted/
    python from_mermaid.py in.mmd --force       # convert despite 3+ alt/else

Exit 0 on success, 2 if the file was refused by triage.
"""

from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path

RESERVED = {
    "shape", "label", "icon", "style", "class", "classes", "vars", "direction", "near",
    "width", "height", "constraint", "tooltip", "link", "source-arrowhead",
    "target-arrowhead", "layers", "scenarios", "steps", "suspend", "unsuspend", "top",
    "left", "grid-rows", "grid-columns", "grid-gap", "vertical-gap", "horizontal-gap",
    "multiple", "3d", "shadow", "opacity", "fill", "stroke",
}


def d2_label(text: str) -> str:
    """Turn mermaid label text into a safe, quoted D2 label."""
    t = re.sub(r"<br\s*/?>", r"\\n", text)
    t = re.sub(r"<[^>]+>", "", t)                      # strip any other html
    t = (t.replace("&amp;", "&").replace("&lt;", "<").replace("&gt;", ">")
         .replace("&quot;", "'").replace("&#39;", "'"))
    t = t.replace('"', "'").strip()
    return '"%s"' % t


def safe_key(k: str, used: set) -> str:
    """A key that cannot collide with a reserved keyword.

    Reserved words as node names fail with errors that name the keyword rather than the
    real problem -- `near`, `layers` and `multiple` all do this. Keys are identifiers and
    labels are what people read, so renaming a key costs nothing visible.
    """
    base = re.sub(r"[^A-Za-z0-9_]", "_", k) or "n"
    if base.lower() in RESERVED:
        base = base + "_"
    out, i = base, 2
    while out in used:
        out = "%s%d" % (base, i)
        i += 1
    used.add(out)
    return out


def triage(lines):
    return sum(1 for l in lines if re.match(r"^\s*(alt|else)\b", l))


def convert(text: str, title_override: str = "", force: bool = False):
    lines = text.splitlines()
    n_alt = triage(lines)
    lost, improved = [], []

    if n_alt >= 3 and not force:
        return None, n_alt, lost, improved

    actors = {}          # mermaid id -> (d2 key, label)
    used_keys = set()
    title = title_override
    autonum = False
    body = []            # (indent, text)
    depth = 0
    msg_no = 0
    group_seq = 0
    pending_group_title = None

    def emit(s):
        body.append(("  " * depth, s))

    i = 0
    while i < len(lines):
        raw = lines[i]
        s = raw.strip()
        i += 1
        if not s:
            continue

        if s.startswith("%%{"):
            lost.append("`%%{init: ...}%%` config block (actor margins / widths) -- no D2 equivalent")
            continue
        if s.startswith("%%"):
            continue
        if s.startswith("sequenceDiagram"):
            continue
        if s.lower().startswith("autonumber"):
            autonum = True
            lost.append("`autonumber` -- messages are numbered BY HAND below; insert one and you must renumber")
            continue
        m = re.match(r"title\s+(.+)", s)
        if m and not title:
            title = m.group(1).strip()
            continue

        # participants
        m = re.match(r"(?:participant|actor)\s+(\S+)(?:\s+as\s+(.+))?$", s)
        if m:
            mid, lab = m.group(1), (m.group(2) or m.group(1))
            actors[mid] = (safe_key(mid, used_keys), d2_label(lab))
            continue

        # frames
        m = re.match(r"rect\s+rgb\s*\(", s)
        if m:
            group_seq += 1
            pending_group_title = ("__RECT__", group_seq)
            emit("__RECT_PLACEHOLDER_%d__: {" % group_seq)
            depth += 1
            improved.append("a `rect rgb(...)` colour band became a TITLED group -- the phase gets a name "
                            "instead of a background colour you had to decode")
            continue
        m = re.match(r"(par|and|opt|loop|critical|break)\b\s*(.*)$", s)
        if m:
            kind, lab = m.group(1), m.group(2).strip()
            if kind == "and":
                depth -= 1
                emit("}")
            group_seq += 1
            nice = {"par": "Parallel", "and": "Parallel", "opt": "Optional",
                    "loop": "Loop", "critical": "Critical", "break": "Break"}[kind]
            name = ("%s - %s" % (nice, lab)) if lab else "%s %d" % (nice, group_seq)
            emit("%s: {" % d2_label(name))
            depth += 1
            if kind in ("par", "and"):
                lost.append("`par`/`and` -- D2 has no parallel semantics; the branches are sibling groups "
                            "titled \"Parallel\", which otherwise read as sequence")
            continue
        if re.match(r"end\b", s):
            depth = max(0, depth - 1)
            emit("}")
            continue

        # notes
        m = re.match(r"Note\s+(over|right of|left of)\s+([^:]+):\s*(.*)$", s, re.I)
        if m:
            who, txt = m.group(2).strip(), m.group(3).strip()
            first = who.split(",")[0].strip()
            spans = "," in who
            # The house style puts the phase heading as the first `Note over A, B:` inside
            # a rect. Promote that to the group's title instead of dropping it on an actor.
            if pending_group_title and spans:
                gs = pending_group_title[1]
                for idx, (ind, line) in enumerate(body):
                    if line.startswith("__RECT_PLACEHOLDER_%d__" % gs):
                        body[idx] = (ind, "%s: {" % d2_label(txt))
                        break
                pending_group_title = None
                continue
            if spans:
                lost.append("`Note over A, B` spans two actors in mermaid; a D2 note attaches to one, "
                            "so it is anchored to the first")
            key = actors.get(first, (safe_key(first, used_keys), d2_label(first)))
            if first not in actors:
                actors[first] = key
            emit("%s.%s" % (key[0], d2_label(txt)))
            continue

        # messages
        m = re.match(r"(\S+?)\s*(-->>|->>|-->|->|--x|-x)\s*([+-]?)\s*(\S+?)\s*:\s*(.*)$", s)
        if m:
            a, arrow, _act, b, txt = m.groups()
            a = a.rstrip("+-")
            b = b.lstrip("+-")
            for who in (a, b):
                if who not in actors:
                    actors[who] = (safe_key(who, used_keys), d2_label(who))
            msg_no += 1
            lab = ("%d. %s" % (msg_no, txt.strip())) if autonum else txt.strip()
            dashed = arrow.startswith("--")
            line = "%s -> %s: %s" % (actors[a][0], actors[b][0], d2_label(lab))
            if dashed:
                line += " {style.stroke-dash: 3}"
            emit(line)
            continue

        m = re.match(r"(?:activate|deactivate)\s+", s)
        if m:
            continue

    while depth > 0:
        depth -= 1
        body.append(("  " * depth, "}"))

    # Any rect that never got a Note-over title falls back to a numbered phase.
    for idx, (ind, line) in enumerate(body):
        mm = re.match(r"__RECT_PLACEHOLDER_(\d+)__: \{", line)
        if mm:
            body[idx] = (ind, '"Phase %s": {' % mm.group(1))

    if any("->>+" in l or "-->>-" in l for l in lines):
        lost.append("activation markers (`->>+` / `-->>-`) -- spans exist in D2 but are not emitted here")

    # assemble
    out = []
    out.append("# Converted from mermaid by scripts/from_mermaid.py")
    out.append("# Triage: %d alt/else -- %s" % (n_alt, "converts cleanly" if n_alt == 0 else
                                                ("acceptable" if n_alt <= 2 else "FORCED, review carefully")))
    out.append("#")
    if lost:
        out.append("# WHAT WAS LOST -- read this before trusting the D2 over the mermaid:")
        for l in dict.fromkeys(lost):
            out.append("#   * " + l)
    if improved:
        out.append("#")
        out.append("# WHAT IMPROVED:")
        for l in dict.fromkeys(improved):
            out.append("#   * " + l)
    out.append("")

    if title:
        out.append("title: %s {" % d2_label(title))
        out.append("  near: top-center")
        out.append("  shape: text")
        out.append("  style: {")
        out.append("    font-size: 24")
        out.append("    bold: true")
        out.append("  }")
        out.append("}")
        out.append("")

    # The wrapper carries an EMPTY label on purpose: without it, its key renders as a
    # stray heading under the title.
    out.append('seq: "" {')
    out.append("  shape: sequence_diagram")
    out.append("")
    out.append("  # Actors declared at top level first -- scope inside a sequence diagram is")
    out.append("  # flat, and an actor first seen inside a group gives a confusing result.")
    for mid, (key, lab) in actors.items():
        out.append("  %s: %s" % (key, lab))
    out.append("")
    for ind, line in body:
        out.append("  " + ind + line)
    out.append("}")
    return "\n".join(out) + "\n", n_alt, lost, improved


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("sources", nargs="+")
    ap.add_argument("-o", "--out")
    ap.add_argument("--out-dir")
    ap.add_argument("--title", default="")
    ap.add_argument("--force", action="store_true", help="convert despite 3+ alt/else")
    args = ap.parse_args()

    rc = 0
    for raw in args.sources:
        src = Path(raw)
        text = src.read_text(encoding="utf-8", errors="replace")
        result, n_alt, lost, improved = convert(text, args.title, args.force)
        if result is None:
            print("REFUSED  %s -- %d alt/else. Split it by scenario, or --force."
                  % (src.name, n_alt), file=sys.stderr)
            rc = 2
            continue
        if args.out:
            dest = Path(args.out)
        elif args.out_dir:
            dest = Path(args.out_dir) / (src.stem + ".d2")
        else:
            dest = src.with_suffix(".d2")
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_text(result, encoding="utf-8")
        print("OK       %-52s -> %s  (%d lost, %d improved)"
              % (src.name[:52], dest.name, len(set(lost)), len(set(improved))))
    return rc


if __name__ == "__main__":
    sys.exit(main())
