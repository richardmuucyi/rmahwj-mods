#!/usr/bin/env python3
"""Prove the starting class block in references/aesthetics.md obeys the rules around it.

The block is the one part of the reference that people copy whole, and until 2026-10-17
it broke the two rules the same file sets: it used `shape: person`, which SKILL.md bans
because d2 stretches the silhouette to fit the label, and it used greys at 1.48 and 2.56
against white, under the file's own 3:1 floor for strokes. Every reader who followed the
advice to "copy this" inherited both faults.

The check reads the first ```d2 block under "## The starting class block" and fails on:

    shape: person / c4-person      anywhere in the block
    a stroke under 3:1             contrast against white, WCAG formula
    a font-color under 4.5:1       the file's floor for label text
    a colour it cannot measure     a named colour or `transparent` proves nothing

`stroke:` and `font-color:` are matched as whole keys, so `stroke-width` and
`stroke-dash` never count, and a colour is judged by the floor of the key it sits on.

Four fixtures with known verdicts guard the check itself:

    old-block    must FAIL   the block as it stood: one person shape, four weak greys, one dim label
    clean-block  must PASS   passing strokes and labels among stroke-width and stroke-dash keys
    short-hex    must FAIL   `#ccc` (1.61) and `transparent`, which a #rrggbb pattern misses
    dim-label    must FAIL   strokes pass, labels do not; `#8794a6` (3.08) passes as a line
                             and fails as text, so a check that used one floor for both breaks here

`old-block` is the negative control: if it ever passes, the check has stopped checking.
The real block must also yield at least three measured strokes and two measured label
colours, so a parser that finds nothing cannot pass by finding nothing.

The actor icons in assets/icons/people get a second check. d2 embeds an icon as a
picture, so a dark theme cannot recolour it, and on 2026-10-18 three of the four still
used `#475569`: 7.58 on white, 2.16 on the theme 200 dark canvas, so the actors faded out
of every dark render. Every `fill` or `stroke` colour in every icon, in an attribute or
inside `style="..."`, must reach 3:1 on BOTH white and `#1E1E2E`. `none` is skipped, as
it paints nothing; anything else it cannot measure (`currentColor`, a colour name)
fails, because inside an embedded picture it does not follow the page. Two fixtures:

    faded-outline  must FAIL   the outline icon as it stood, `#475569`
    style-colours  must FAIL   `#cbd5e1` set inside style="...", and `currentColor`

At least four icons with at least one colour each must be found, for the same reason
as the stroke minimum.

Usage:
    python tests/eval_aesthetics.py
    python tests/eval_aesthetics.py --verbose

Exit 0 only when every fixture behaved as expected and the real block and icons are clean.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
FIXTURES = HERE / "aesthetics"
REFERENCE = HERE.parent / "references" / "aesthetics.md"
HEADING = "## The starting class block"
FLOOR = 3.0
TEXT_FLOOR = 4.5
MIN_STROKES = 3
MIN_FONTS = 2

ICONS = HERE.parent / "assets" / "icons" / "people"
DARK_CANVAS = "#1E1E2E"   # theme 200's canvas: its .fill-N7, and a pixel of a dark render (2026-10-18)
MIN_ICONS = 4

PERSON = re.compile(r"\bshape\s*:\s*(?:c4-)?person\b")
STROKE = re.compile(r"(?<![\w-])stroke\s*:\s*\"?([^\";}\s]+)")
FONT = re.compile(r"(?<![\w-])font-color\s*:\s*\"?([^\";}\s]+)")
ICON_COLOUR = re.compile(r"(?<![\w-])(?:fill|stroke)\s*[=:]\s*[\"']?([^\"';\s>]+)")
HEX = re.compile(r"#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$")


def luminance(colour: str) -> float | None:
    """WCAG relative luminance of a hex colour, or None if it is not a hex colour."""
    m = HEX.match(colour)
    if not m:
        return None
    h = m.group(1)
    if len(h) == 3:
        h = "".join(c * 2 for c in h)
    channels = []
    for i in (0, 2, 4):
        c = int(h[i:i + 2], 16) / 255
        channels.append(c / 12.92 if c <= 0.03928 else ((c + 0.055) / 1.055) ** 2.4)
    return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2]


def contrast(a: str, b: str) -> float | None:
    """WCAG contrast ratio between two hex colours, or None if either is not one."""
    la, lb = luminance(a), luminance(b)
    if la is None or lb is None:
        return None
    hi, lo = max(la, lb), min(la, lb)
    return (hi + 0.05) / (lo + 0.05)


def contrast_on_white(colour: str) -> float | None:
    """WCAG contrast ratio of a hex colour against white, or None if it is not a hex colour."""
    return contrast(colour, "#ffffff")


def faint_icon_colours(svg_text: str) -> tuple[int, list[str]]:
    """(colours measured, the ones under 3:1 on white or on the dark canvas, or unmeasurable)."""
    colours = [c for c in ICON_COLOUR.findall(svg_text) if c.lower() != "none"]
    faint = []
    for c in colours:
        ratios = [contrast(c, "#ffffff"), contrast(c, DARK_CANVAS)]
        if None in ratios or min(ratios) < FLOOR:
            faint.append(c)
    return len(colours), faint


def below(colours: list[str], floor: float) -> list[str]:
    """The colours under `floor` against white, plus any that cannot be measured."""
    out = []
    for c in colours:
        ratio = contrast_on_white(c)
        if ratio is None or ratio < floor:
            out.append(c)
    return out


def audit(block: str) -> dict:
    """Person shapes, measured strokes and label colours, and the ones under their floor.

    Full-line `#` comments are dropped first: a comment that warns against `shape: person`
    is advice, not a use of it.
    """
    block = "\n".join(line for line in block.splitlines() if not line.lstrip().startswith("#"))
    strokes = STROKE.findall(block)
    fonts = FONT.findall(block)
    return {"person": len(PERSON.findall(block)), "strokes": len(strokes), "fonts": len(fonts),
            "weak": below(strokes, FLOOR), "dim": below(fonts, TEXT_FLOOR)}


def starting_block() -> str | None:
    text = REFERENCE.read_text(encoding="utf-8")
    if HEADING not in text:
        return None
    section = text.split(HEADING, 1)[1]
    m = re.search(r"```d2\n(.*?)```", section, re.S)
    return m.group(1) if m else None


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--verbose", action="store_true")
    args = ap.parse_args()

    bad = 0
    expect = json.loads((FIXTURES / "expect.json").read_text(encoding="utf-8"))
    for name, want in sorted(expect.items()):
        got = audit((FIXTURES / (name + ".d2")).read_text(encoding="utf-8"))
        ok = all(got[k] == want[k] for k in ("person", "weak", "dim"))
        bad += not ok
        verdict = "FAIL" if got["person"] or got["weak"] or got["dim"] else "PASS"
        print("%-5s %-12s %s  person=%d weak=%s dim=%s" % ("OK" if ok else "WRONG", name, verdict,
                                                         got["person"], got["weak"], got["dim"]))
        if args.verbose or not ok:
            print("        expected person=%d weak=%s dim=%s" % (want["person"], want["weak"], want["dim"]))

    block = starting_block()
    if block is None:
        bad += 1
        print("WRONG starting block: no ```d2 block found under %r in %s" % (HEADING, REFERENCE.name))
    else:
        got = audit(block)
        ok = (got["person"] == 0 and not got["weak"] and not got["dim"]
              and got["strokes"] >= MIN_STROKES and got["fonts"] >= MIN_FONTS)
        bad += not ok
        print("%-5s %-12s person=%d strokes=%d fonts=%d weak=%s dim=%s" % (
            "OK" if ok else "WRONG", "real block", got["person"], got["strokes"], got["fonts"],
            got["weak"], got["dim"]))
        if got["strokes"] < MIN_STROKES or got["fonts"] < MIN_FONTS:
            print("        fewer than %d strokes or %d label colours measured -- the parser may "
                  "have stopped seeing them" % (MIN_STROKES, MIN_FONTS))

    icon_expect = json.loads((FIXTURES / "icons-expect.json").read_text(encoding="utf-8"))
    for name, want in sorted(icon_expect.items()):
        _, faint = faint_icon_colours((FIXTURES / (name + ".svg")).read_text(encoding="utf-8"))
        ok = faint == want
        bad += not ok
        print("%-5s %-14s %s  faint=%s" % ("OK" if ok else "WRONG", name + ".svg",
                                          "FAIL" if faint else "PASS", faint))
        if args.verbose or not ok:
            print("        expected faint=%s" % want)

    icons = sorted(ICONS.glob("*.svg"))
    if len(icons) < MIN_ICONS:
        bad += 1
        print("WRONG icons: found %d in %s, expected at least %d" % (len(icons), ICONS, MIN_ICONS))
    for icon in icons:
        n, faint = faint_icon_colours(icon.read_text(encoding="utf-8"))
        ok = n > 0 and not faint
        bad += not ok
        print("%-5s %-20s colours=%d faint=%s" % ("OK" if ok else "WRONG", icon.name, n, faint))
        if n == 0:
            print("        no fill or stroke colour found -- the parser may have stopped seeing them")

    print()
    if bad:
        print("%d check(s) behaved unexpectedly -- the starting class block or an icon breaks the "
              "rules, or the check has stopped checking" % bad)
        return 1
    print("starting class block and icons hold their rules, and every control behaved as expected")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
