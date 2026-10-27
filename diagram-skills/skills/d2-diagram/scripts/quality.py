#!/usr/bin/env python3
"""Score a .d2 against an operational definition of a quality diagram.

The point of this script is the DEFINITION, not the score. "Good diagram" is otherwise
a matter of taste, and taste does not survive a code review. So quality is broken into
eleven criteria, and every one that can be measured is. Criterion 3 costs a browser, so it
is opt-in; criterion 8 cannot be measured and is printed anyway, so nobody mistakes a
clean run for a finished diagram.

    #  Criterion                          Measured how                          Auto
    1  It compiles                        d2 exit status                        yes
    2  It drew what you meant             inventory decoded from the SVG        yes
    3  Nothing clipped or colliding       browser geometry (--deep)             opt-in
    4  Labels are names, not sentences    word count per label                  yes
    5  It fits on a screen                canvas area and aspect ratio          yes
    6  Style is centralised               classes vs per-shape style blocks     yes
    7  It answers one question            a title exists and is specific        partly
   10  Actors are icons, not person      shape: person / c4-person usage        yes
    8  It is honest                       estimates marked, sources dated       NO -- you
    9  The legend tells the truth         rows vs classes used in the body      yes
   11  Container labels stay quiet        label font sizes read from the SVG    yes

Thresholds are not arbitrary; each is noted with where it came from. They are defaults,
not laws: a wall poster and a README diagram have different budgets, so `--strict` and
`--max-area` exist.

Usage:
    python quality.py diagram.d2
    python quality.py diagram.d2 --deep          # adds the browser geometry pass
    python quality.py *.d2 --brief               # one line each, for a whole folder
    python quality.py diagram.d2 --json

Exit 0 if no criterion FAILED (warnings are allowed), 1 otherwise.
"""

from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
import tempfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

import render  # noqa: E402

# --- thresholds, and where they came from --------------------------------------------
# Label length: a node label should be a NAME. Measured on this skill's own corpus,
# rewriting three system-design diagrams from sentences to 1-3 word labels cut the canvas
# from 4.5 Mpx to 1.4 Mpx with no loss of meaning.
LABEL_WORDS_GOOD = 3
LABEL_WORDS_WARN = 6

# Canvas: a diagram people actually read fits a screen at a legible zoom. 2 Mpx is about
# 1400x1400. The 6426px-wide draft that passed every other check sat at 9.2 Mpx.
AREA_GOOD_MPX = 2.0
AREA_WARN_MPX = 4.0

# Aspect: d2's own render script flags 6:1. Past about 4:1 a diagram stops fitting
# anything it gets pasted into.
ASPECT_GOOD = 4.0
ASPECT_WARN = 6.0


class Check:
    def __init__(self, num, name, verdict, detail):
        self.num, self.name, self.verdict, self.detail = num, name, verdict, detail

    @property
    def failed(self):
        return self.verdict == "FAIL"


def svg_labels(svg: Path):
    """Every visible label, read out of the render rather than the source.

    Read from the SVG on purpose: what matters is the text a reader sees, after d2 has
    resolved labels, classes and defaults. Parsing the .d2 would miss labels that come
    from a class and count keys that are never displayed.
    """
    try:
        text = svg.read_text(encoding="utf-8", errors="replace")
    except OSError:
        return []
    out = []
    for m in re.finditer(r"<text[^>]*>(.*?)</text>", text, re.S):
        s = _plain(m.group(1))
        if s:
            out.append(s)
    return out


def _plain(markup: str) -> str:
    """The visible text of one <text> element: tags dropped, entities decoded.

    d2 draws each line of a multi-line label as its own <tspan>. Dropping the tags alone
    glued the lines together -- "redirect\\nto the long URL" read as "redirectto the long
    URL" -- which undercounted words for criterion 4 and handed the reviewer merged words.
    So a line break becomes a space before the tags go.
    """
    s = re.sub(r"</tspan>\s*<tspan[^>]*>", " ", markup)
    s = re.sub(r"<[^>]+>", "", s)
    s = re.sub(r"\s+", " ", s)
    return (s.replace("&amp;", "&").replace("&lt;", "<").replace("&gt;", ">")
            .replace("&#39;", "'").replace("&quot;", '"')).strip()


def text_shape_labels(svg: Path):
    """Labels of `shape: text` nodes -- titles, captions, notes -- read from the render.

    d2 draws every object as a group holding `<g class="shape">` and its `<text>`. A node
    or container puts a <rect> or <path> in that shape group, an icon an <image>, and an
    edge has no shape group at all; only a `shape: text` node leaves it EMPTY. Verified
    on d2 0.7.1 (2026-10-17): on a diagram with a title, a caption, two icon actors,
    nodes, containers and edges, exactly the title and the caption matched.
    """
    try:
        text = svg.read_text(encoding="utf-8", errors="replace")
    except OSError:
        return []
    found = re.finditer(r'<g class="shape"\s*>\s*</g>\s*<text[^>]*>(.*?)</text>', text, re.S)
    return [s for s in (_plain(m.group(1)) for m in found) if s]


def label_sizes(svg: Path):
    """Each object's own label, as {id: (font size in px, text)}, read from the render.

    d2 writes every object as a flat group whose class carries its base64 ID, holding a
    `<g class="shape">` and then the object's own `<text>`. An object with no label (a
    `""` wrapper) has no <text>, so each search stops at the next object's group: an
    unbounded search picked up the NEXT object's label instead. Verified on d2 0.7.1
    (2026-10-18): a container reads 28 and its nodes 16 under theme 0.
    """
    try:
        text = svg.read_text(encoding="utf-8", errors="replace")
    except OSError:
        return {}
    marks = []
    for m in re.finditer(r'<g class="([^"]+)"', text):
        for token in m.group(1).split():
            dec = render.decode_id(token) if token != "shape" else None
            if dec:
                marks.append((m.start(), dec))  # decode_id unescapes, the same as svg_inventory
                break
    sizes = {}
    for i, (start, oid) in enumerate(marks):
        seg = text[start:marks[i + 1][0] if i + 1 < len(marks) else len(text)]
        tm = re.search(r"<text\b([^>]*)>(.*?)</text>", seg, re.S)
        fs = tm and (re.search(r"font-size:\s*([\d.]+)px", tm.group(1))
                     or re.search(r'font-size="([\d.]+)"', tm.group(1)))
        if fs:
            sizes[oid] = (float(fs.group(1)), _plain(tm.group(2)))
    return sizes


# Tokens for wrapper_ids: a block opening (`key: label {`), a block closing, and the two
# declarations that make a container place its own children.
_BLOCK_TOKENS = re.compile(
    r"(?P<open>(?P<key>[\w.\-]+)\s*(?::\s*(?:\"[^\"\n]*\"|'[^'\n]*'|[^{}\n;\"']*))?\s*\{)"
    r"|(?P<close>\})"
    r"|(?:(?P<pre>[\w.\-]+)\.)?(?:shape\s*:\s*sequence_diagram\b|grid-(?:rows|columns)\s*:)")
# A `#` starts a comment only outside quotes: "#4b5563" is a colour, and stripping it
# with its closing braces left every later block unbalanced.
_COMMENT = re.compile(r"""^((?:[^"'#\n]|"[^"\n]*"|'[^'\n]*')*)#.*$""", re.M)


def wrapper_ids(src_text: str) -> set:
    """IDs of containers that are a sequence_diagram or a grid, from the source.

    Their label works as the diagram's title, so criterion 11 does not ask them to shrink;
    it only catches the bare key showing ("seq", "matrix"), which the author never chose.
    """
    body = _COMMENT.sub(r"\1", src_text)
    stack, found = [], set()
    for m in _BLOCK_TOKENS.finditer(body):
        if m.group("open"):
            stack.append(m.group("key"))
        elif m.group("close"):
            if stack:
                stack.pop()
        else:
            path = stack + ([m.group("pre")] if m.group("pre") else [])
            if path:
                found.add(".".join(path))
    return found


# Container styling is structural chrome, not a node class, so it needs no legend
# row -- the reference decks legend their node classes and never their borders.
LEGEND_EXEMPT = {"group", "note", "zone", "boundary", "container"}


def analyse_source(src: Path):
    """Style centralisation and title presence, from the source text."""
    t = src.read_text(encoding="utf-8", errors="replace")
    # Strip comments so commented-out examples do not count.
    body = "\n".join(re.sub(r"#.*$", "", line) for line in t.splitlines())

    has_classes = re.search(r"^\s*classes\s*:\s*\{", body, re.M) is not None
    class_uses = len(re.findall(r"\bclass\s*:", body))
    glob_uses = len(re.findall(r"^\s*\*", body, re.M))
    # A `style` that is not inside the classes block is per-shape styling.
    style_blocks = len(re.findall(r"\bstyle\s*[:.]", body))
    has_title = re.search(r"shape\s*:\s*text", body) is not None or \
        re.search(r"^\s*title\s*:", body, re.M) is not None
    # Legend honesty. A legend row whose class never appears in the body claims an
    # encoding the diagram does not use; a class used in the body with no row is an
    # encoding nobody can decode. Both are common when a legend is copied between
    # diagrams that share a palette file -- the classes travel, the usage does not.
    #
    # Legend rows are found by their class assignment, then subtracted from body usage.
    # Container-only styles are exempt: they are structural chrome, not a node class.
    legend_span = ""
    m = re.search(r"^\s*(?:legend|footer|key)\s*:", body, re.M)
    if m:
        legend_span = body[m.start():]
        body_only = body[:m.start()]
    else:
        body_only = body
    legend_rows = set(re.findall(r"\{\s*class\s*:\s*(\w+)", legend_span))
    used = set(re.findall(r"\{\s*class\s*:\s*(\w+)", body_only)) | \
        set(re.findall(r"^\s*class\s*:\s*(\w+)", body_only, re.M))
    used -= LEGEND_EXEMPT

    return {"has_classes": has_classes, "class_uses": class_uses, "glob_uses": glob_uses,
            "style_blocks": style_blocks, "has_title": has_title,
            "has_legend": bool(legend_rows),
            "legend_claims_unused": sorted(legend_rows - used),
            "legend_missing_rows": sorted(used - legend_rows)}


def score(src: Path, deep: bool = False, max_area: float = AREA_GOOD_MPX):
    checks = []
    tmp = Path(tempfile.mkdtemp(prefix="d2quality-"))
    out = tmp / "out.svg"
    d2 = render.find_d2()

    # 1 -- compiles.
    # Run from the SOURCE'S OWN DIRECTORY. Relative imports (`...@_classes`) resolve
    # against the working directory, not the importing file, so a diagram that shares a
    # palette file compiles from its folder and fails from anywhere else. render.py does
    # the same thing for the same reason -- and this script did NOT, which made six
    # perfectly good diagrams report "does not compile" purely because of where the
    # checker was invoked from.
    proc = subprocess.run([d2, src.name, str(out.resolve())],
                          capture_output=True, text=True,
                          cwd=str(src.parent) if str(src.parent) else None)
    if proc.returncode != 0:
        first = (proc.stdout + proc.stderr).strip().splitlines()
        checks.append(Check(1, "It compiles", "FAIL", first[0] if first else "exit %d" % proc.returncode))
        return checks, {}
    checks.append(Check(1, "It compiles", "PASS", "d2 exit 0"))

    board = out if out.is_file() else out.with_suffix("")
    index = board if board.is_file() else (board / "index.svg")
    if not index.is_file():
        checks.append(Check(2, "It drew what you meant", "FAIL", "no readable SVG"))
        return checks, {}

    # 2 -- drew what you meant
    shapes, conns = render.svg_inventory(index)
    phantom = [s for s in shapes
               if re.search(r":\s", s) or "  " in s or (len(s) > 25 and s.count(" ") >= 4)]

    # In a sequence diagram, GROUP TITLES and NOTES are legitimately prose -- a group is
    # named "Phase 1 - data capture", a note is its own text. The prose heuristic cannot
    # tell those from a mis-parsed label, so on a sequence diagram it fires on every
    # single one. A check that cries wolf on a whole genre is a check people mute, so it
    # is suppressed here and the reason is stated rather than hidden.
    is_sequence = "sequence_diagram" in src.read_text(encoding="utf-8", errors="replace")
    suppressed = 0
    if is_sequence and phantom:
        suppressed = len(phantom)
        phantom = []

    if phantom:
        checks.append(Check(2, "It drew what you meant", "WARN",
                            "%d id(s) read like prose -- a label parsed as a key? %s"
                            % (len(phantom), phantom[:2])))
    else:
        note = "%d shapes, %d connections, no prose-shaped ids" % (len(shapes), len(conns))
        if suppressed:
            note += (" (%d group titles/notes not counted -- sequence diagram)" % suppressed)
        checks.append(Check(2, "It drew what you meant", "PASS", note))

    # 4 -- labels are names
    #
    # Same suppression as criterion 2, for the same reason. On a sequence diagram the
    # SVG's text nodes are mostly NOTE BODIES and GROUP TITLES, which are prose by
    # design -- a note exists to hold a sentence. Measuring them condemns every
    # well-built API-scenario diagram in the corpus, including ones whose participants
    # and messages are exemplary. So on a sequence diagram, measure the MESSAGES, which
    # are the labels that actually have to stay terse.
    if is_sequence:
        seq_body = "\n".join(re.sub(r"#.*$", "", ln)
                             for ln in src.read_text(encoding="utf-8", errors="replace").splitlines())
        node_labels = []
        for m in re.findall(r"^\s*[\w.\"' ]+\s*(?:->|<->|--)\s*[\w.\"' ]+\s*:\s*(.+?)\s*(?:\{.*)?$",
                            seq_body, re.M):
            m = m.strip()
            if len(m) > 1 and m[0] == m[-1] and m[0] in "\"'":
                m = m[1:-1]                      # the label, not its quoting
            m = m.replace("\\n", " ")            # a wrapped label is still one label
            if len(m.strip()) > 1:
                node_labels.append(m.strip())
    else:
        # Titles and captions (`shape: text`) are not names. The design guides ask for a
        # title that states the diagram's one claim, which is a sentence by design, so
        # counting it here warned on exactly the diagrams that followed the advice
        # (2026-10-17: both diagrams built that day were flagged for their titles alone).
        labels = svg_labels(index)
        skipped = text_shape_labels(index)
        for s in skipped:
            if s in labels:
                labels.remove(s)
        node_labels = [l for l in labels if len(l) > 1]
    if node_labels:
        words = sorted(len(l.split()) for l in node_labels)
        mid = words[len(words) // 2]
        worst = max(node_labels, key=lambda l: len(l.split()))
        over = sum(1 for w in words if w > LABEL_WORDS_WARN)
        pct = 100.0 * over / len(words)
        if mid <= LABEL_WORDS_GOOD and pct < 10:
            v, d = "PASS", "median %d words, %d%% over %d" % (mid, round(pct), LABEL_WORDS_WARN)
        elif mid <= LABEL_WORDS_WARN:
            v, d = "WARN", ("median %d words, %d%% over %d. Longest: %r"
                            % (mid, round(pct), LABEL_WORDS_WARN, worst[:60]))
        else:
            v, d = "FAIL", ("median %d words -- these are sentences, not names. Longest: %r"
                            % (mid, worst[:60]))
        if is_sequence:
            d += " (messages only; notes and group titles excluded)"
        elif skipped:
            d += " (%d text shape%s not counted: titles and captions)" % (
                len(skipped), "" if len(skipped) == 1 else "s")
        checks.append(Check(4, "Labels are names, not sentences", v, d))

    # 5 -- fits a screen
    dims = render.svg_dimensions(index)
    if dims:
        w, h = dims
        area = w * h / 1e6
        aspect = max(w, h) / max(1.0, min(w, h))
        bits = "%.0f x %.0f = %.1f Mpx, %.1f:1" % (w, h, area, aspect)
        if area <= max_area and aspect <= ASPECT_GOOD:
            v, d = "PASS", bits
        elif area <= AREA_WARN_MPX and aspect <= ASPECT_WARN:
            v, d = "WARN", bits + " -- getting large; consider splitting or `direction`"
        else:
            v, d = "FAIL", bits + " -- too big to read; split it or shorten labels"
        checks.append(Check(5, "It fits on a screen", v, d))

    # 6 -- style centralised
    s = analyse_source(src)
    n = len(shapes)
    if n <= 4:
        checks.append(Check(6, "Style is centralised", "PASS", "too small to matter"))
    elif s["has_classes"] or s["glob_uses"]:
        checks.append(Check(6, "Style is centralised", "PASS",
                            "classes/globs in use (%d class assignments)" % s["class_uses"]))
    elif s["style_blocks"] > n / 2:
        checks.append(Check(6, "Style is centralised", "WARN",
                            "%d inline style declarations across %d shapes and no classes -- "
                            "a restyle would be a sweep, not an edit" % (s["style_blocks"], n)))
    else:
        checks.append(Check(6, "Style is centralised", "PASS", "little styling to centralise"))

    # 7 -- answers one question
    # 10 -- actors are icons, not shape: person
    #
    # `shape: person` and `shape: c4-person` are DEFORMABLE: d2 sizes the node from its
    # label and stretches the silhouette to fill it, so a long actor name renders a wide,
    # squat blob (person caps at 1.50:1, c4-person at 1.05:1). An icon is not deformable.
    # House rule, not a d2 error, so it warns rather than fails -- but it warns every
    # time, because there is no case where the built-in shape is the better choice.
    raw10 = src.read_text(encoding="utf-8", errors="replace")
    nocomment10 = "\n".join(re.sub(r"#.*$", "", ln) for ln in raw10.splitlines())
    blobs = re.findall(r"shape\s*:\s*(c4-person|person)\b", nocomment10)
    if blobs:
        checks.append(Check(10, "Actors are icons, not shape: person", "WARN",
                            "%d use(s) -- switch to shape: image with an icon from "
                            "assets/icons/people/ (see aesthetics.md)" % len(blobs)))
    else:
        checks.append(Check(10, "Actors are icons, not shape: person", "PASS",
                            "no deformable person shapes"))

    # 11 -- container labels stay quieter than their nodes
    #
    # d2 draws a container label at 28px and its nodes at 16px, so the grouping box shouts
    # at nearly twice the size of the things it groups (references/aesthetics.md). The
    # genre gallery showed it on three of seven genres (2026-10-18), and twice it was a
    # sequence_diagram or grid wrapper printing its bare key ("seq", "matrix") as a title.
    # A wrapper's label IS its title, so a wrapper is judged only on that key. House rule,
    # not a d2 error, so it warns like criterion 10.
    containers = sorted(c for c in shapes if any(o.startswith(c + ".") for o in shapes))
    if not containers:
        checks.append(Check(11, "Container labels stay quiet", "SKIP", "no containers"))
    else:
        sizes = label_sizes(index)
        wrappers = wrapper_ids(raw10)
        loud, keyed, judged = [], [], 0
        for c in containers:
            if c not in sizes:
                continue                         # labelled "": nothing drawn, nothing to judge
            size, label = sizes[c]
            kids = [sizes[o][0] for o in shapes
                    if o.startswith(c + ".") and "." not in o[len(c) + 1:] and o in sizes]
            judged += 1
            if c in wrappers:
                if label == c.rsplit(".", 1)[-1]:
                    keyed.append(c)
            elif kids and size > max(kids):
                loud.append("%s %gpx over %gpx" % (c, size, max(kids)))
        bits = []
        if loud:
            bits.append("container label larger than its nodes: %s -- give the container the "
                        "zone class (font-size 13, grey; references/aesthetics.md)" % ", ".join(loud))
        if keyed:
            bits.append("wrapper shows its bare key as a title: %s -- give it a real label "
                        "or \"\"" % ", ".join(keyed))
        if bits:
            checks.append(Check(11, "Container labels stay quiet", "WARN", "; ".join(bits)))
        else:
            checks.append(Check(11, "Container labels stay quiet", "PASS",
                                "%d labelled container(s), none louder than its nodes" % judged))

    checks.append(Check(7, "It answers one question", "PASS" if s["has_title"] else "WARN",
                        "has a title" if s["has_title"] else
                        "no title -- a diagram without a stated question is a picture"))

    # 9 -- the legend tells the truth
    if not s["has_legend"]:
        checks.append(Check(9, "The legend tells the truth", "SKIP", "no legend"))
    else:
        lied = s["legend_claims_unused"]
        gaps = s["legend_missing_rows"]
        if lied or gaps:
            bits = []
            if lied:
                bits.append("claims unused: %s" % ", ".join(lied))
            if gaps:
                bits.append("undecoded in body: %s" % ", ".join(gaps))
            checks.append(Check(9, "The legend tells the truth", "FAIL", "; ".join(bits)))
        else:
            checks.append(Check(9, "The legend tells the truth", "PASS",
                                "every row is used, every class is decoded"))

    # 3 -- geometry, opt-in because it costs a browser
    if deep:
        vr = subprocess.run([sys.executable, str(HERE / "visual_review.py"),
                             str(index), "--json", "--session", "d2quality"],
                            capture_output=True, text=True)
        try:
            report = json.loads(vr.stdout)
            crit = [f for f in report["findings"] if f["severity"] == "CRITICAL"]
            warn = [f for f in report["findings"] if f["severity"] == "WARN"]
            if crit:
                v, d = "FAIL", "; ".join(f["check"] for f in crit)
            elif warn:
                v, d = "WARN", "; ".join(f["check"] for f in warn)
            else:
                v, d = "PASS", "no clipping, overlap or collisions"
        except Exception:
            v, d = "WARN", "geometry pass could not run"
        checks.append(Check(3, "Nothing clipped or colliding", v, d))
    else:
        checks.append(Check(3, "Nothing clipped or colliding", "SKIP",
                            "re-run with --deep to measure it in a browser"))

    checks.sort(key=lambda c: c.num)
    return checks, {"shapes": len(shapes), "edges": len(conns),
                    "area": (dims[0] * dims[1] / 1e6) if dims else None}


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("sources", nargs="+")
    ap.add_argument("--deep", action="store_true", help="add the browser geometry pass")
    ap.add_argument("--brief", action="store_true", help="one line per file")
    ap.add_argument("--json", action="store_true")
    ap.add_argument("--max-area", type=float, default=AREA_GOOD_MPX,
                    help="megapixel budget before the size check warns (default %.1f)" % AREA_GOOD_MPX)
    args = ap.parse_args()

    worst = 0
    payload = []
    for raw in args.sources:
        src = Path(raw)
        if not src.is_file():
            print("no such file: " + raw, file=sys.stderr)
            worst = 1
            continue
        checks, stats = score(src, deep=args.deep, max_area=args.max_area)
        failed = sum(1 for c in checks if c.verdict == "FAIL")
        warned = sum(1 for c in checks if c.verdict == "WARN")
        passed = sum(1 for c in checks if c.verdict == "PASS")
        if failed:
            worst = 1

        if args.json:
            payload.append({"file": str(src), "stats": stats,
                            "checks": [{"n": c.num, "name": c.name, "verdict": c.verdict,
                                        "detail": c.detail} for c in checks]})
            continue

        if args.brief:
            mark = "FAIL" if failed else ("warn" if warned else "ok  ")
            print("%s  %-42s %d pass / %d warn / %d fail" % (mark, src.name, passed, warned, failed))
            continue

        print("=" * 76)
        print("QUALITY  " + str(src))
        print("=" * 76)
        for c in checks:
            print("  %d. %-34s %-5s %s" % (c.num, c.name, c.verdict, c.detail))
        print("  8. %-34s %-5s %s" % ("It is honest", "YOU",
                                      "are estimates marked as estimates? are claims dated?"))
        print("")
        print("  %d passed, %d warnings, %d failed -- and criterion 8 is not machine-checkable."
              % (passed, warned, failed))
        print("  A clean run means nothing is measurably wrong. It does not mean the diagram")
        print("  answers the question someone actually asked.")

    if args.json:
        print(json.dumps(payload, indent=2))
    return worst


if __name__ == "__main__":
    sys.exit(main())
