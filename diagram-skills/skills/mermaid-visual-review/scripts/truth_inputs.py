#!/usr/bin/env python3
"""Inputs for the optional truth-review pass: the declared facts, and the labels as rendered.

Usage:
    python truth_inputs.py <source.mmd> [<rendered.svg>]

Prints JSON: run_truth_review, sources, exempt, not_claimed, and (with an SVG) labels.
Exit 0 on success, 2 on a file error.

The pass runs only when the source declares its facts with `%% SOURCE:` lines -- the
mermaid comment form of d2-diagram's `# SOURCE:` block:

    %% SOURCE: <claim> = <where it comes from>
    %% SOURCE-EXEMPT: <deliberate generics, not checked>
    %% NOT CLAIMED: <left out on purpose, and why>

No SOURCE line, no pass: a diagram that cites nothing gives the reviewer nothing to
check the picture against, and a review against the author's own model is worthless.

Labels are read from the RENDER, not the source, so the reviewer sees the words a reader
sees after mermaid resolves them. Mermaid draws labels as HTML inside <foreignObject>,
one line per <br/>; a line break becomes a space, because stripping the tags alone glues
lines into one word ("redirect service(2014 name)") -- the bug d2-diagram's label reader
once had.
"""

from __future__ import annotations

import html
import json
import re
import sys
from pathlib import Path

LINE = re.compile(r"^\s*%%\s*(SOURCE-EXEMPT|NOT CLAIMED|SOURCE)\s*:\s*(.+?)\s*$", re.MULTILINE)
FOREIGN = re.compile(r"<foreignObject\b[^>]*>(.*?)</foreignObject>", re.DOTALL)
TEXT = re.compile(r"<text\b[^>]*>(.*?)</text>", re.DOTALL)
BREAK = re.compile(r"<(?:br|hr)\b[^>]*/?>", re.IGNORECASE)


def declared(source: str) -> dict:
    """The facts a source declares, and whether that is enough to run the truth review."""
    found = {"SOURCE": [], "SOURCE-EXEMPT": [], "NOT CLAIMED": []}
    for kind, value in LINE.findall(source):
        found[kind].append(value)
    return {"run_truth_review": bool(found["SOURCE"]), "sources": found["SOURCE"],
            "exempt": found["SOURCE-EXEMPT"], "not_claimed": found["NOT CLAIMED"]}


def _plain(markup: str) -> str:
    s = BREAK.sub(" ", markup)
    s = re.sub(r"<[^>]+>", "", s)
    return re.sub(r"\s+", " ", html.unescape(s)).strip()


def svg_labels(svg: str) -> list[str]:
    """Every visible label in a mermaid SVG: HTML labels in <foreignObject>, then <text>."""
    svg = re.sub(r"<style\b.*?</style>", "", svg, flags=re.DOTALL)
    labels = [_plain(m) for m in FOREIGN.findall(svg)] + [_plain(m) for m in TEXT.findall(svg)]
    return [l for l in labels if l]


def main(argv: list[str]) -> int:
    if len(argv) not in (2, 3):
        print("Usage: truth_inputs.py <source.mmd> [<rendered.svg>]", file=sys.stderr)
        return 2
    try:
        out = declared(Path(argv[1]).read_text(encoding="utf-8"))
        if len(argv) == 3:
            out["labels"] = svg_labels(Path(argv[2]).read_text(encoding="utf-8", errors="replace"))
    except OSError as exc:
        print(f"Read error: {exc}", file=sys.stderr)
        return 2
    print(json.dumps(out, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
