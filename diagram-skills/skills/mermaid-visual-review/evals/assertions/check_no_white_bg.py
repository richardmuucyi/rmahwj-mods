#!/usr/bin/env python3
"""Assertion: a rendered SVG's PAGE background is transparent.

Usage: check_no_white_bg.py <path-to-rendered.svg>

Exit 0 if the root <svg> element declares no opaque background.
Exit 1 if it declares one.
Exit 2 on file error.

Scope matters here. mmdc writes the page background onto the ROOT <svg>
element's inline style (`-b white` -> `background-color: white`). Mermaid
ALSO ships a default stylesheet whose `.edgeLabel` / `.labelBkg` /
`.icon-shape` rules carry their own `background-color` — opaque chips drawn
behind edge labels so they stay legible over lines. Those are component
backgrounds, are emitted regardless of `-b`, and one of them is set by the
theme's own `edgeLabelBackground` key on purpose.

Scanning the whole document therefore reports a false FAIL on a correctly
transparent render. Only the root element's own style attribute answers the
question this assertion asks.

Two things the naive version of this check gets wrong, both closed here:
- The style attribute may be single- or double-quoted; both are accepted.
- Comments are stripped before the root element is located, so a comment
  that happens to contain `<svg ...>`-shaped text cannot be mistaken for the
  real root (in either direction — masking a white root, or manufacturing a
  false failure against a transparent one).
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

COMMENT_RE = re.compile(r"<!--.*?-->", re.DOTALL)
ROOT_SVG_RE = re.compile(r"<svg\b[^>]*>", re.IGNORECASE)
STYLE_ATTR_RE = re.compile(r"""style\s*=\s*(["'])(.*?)\1""", re.IGNORECASE | re.DOTALL)
BG_RE = re.compile(r"background-color:\s*([^;]+)", re.IGNORECASE)
TRANSPARENT = {"transparent", "none", "rgba(0,0,0,0)"}


def main(argv: list[str]) -> int:
    if len(argv) != 2:
        print("Usage: check_no_white_bg.py <rendered.svg>", file=sys.stderr)
        return 2
    path = Path(argv[1])
    if not path.is_file():
        print(f"Not a file: {path}", file=sys.stderr)
        return 2

    try:
        raw = path.read_text(encoding="utf-8", errors="replace")
    except OSError as exc:
        print(f"Read error: {exc}", file=sys.stderr)
        return 2
    svg = COMMENT_RE.sub("", raw)

    root = ROOT_SVG_RE.search(svg)
    if not root:
        print("no <svg> root element found", file=sys.stderr)
        return 2

    style = STYLE_ATTR_RE.search(root.group(0))
    if not style:
        print("PASS: root <svg> declares no style")
        return 0

    background = BG_RE.search(style.group(2))
    if not background:
        print("PASS: root <svg> declares no background-color")
        return 0

    value = background.group(1).strip()
    normalised = re.sub(r"\s+", "", value).lower()
    if normalised in TRANSPARENT:
        print(f"PASS: page background transparent ({value})")
        return 0
    print(f"FAIL: opaque page background declared: {value}")
    return 1


if __name__ == "__main__":
    sys.exit(main(sys.argv))
