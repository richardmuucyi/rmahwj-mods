#!/usr/bin/env python3
"""Inject a theme's themeVariables into a mermaid source, merging any existing init block.

Why merge? Phase A may have already injected `%%{init: {... flowchart: {...} ...}}%%`
(via the flowchart-padding-init or set-flowchart-curve recipes). Naively prepending
a second init block produces two competing directives — mermaid silently uses one
and drops the other, so the Phase A spacing/curve fixes vanish from the themed render.

This helper parses any existing init block, deep-merges the theme's themeVariables on
top of its themeVariables, sets `theme: 'base'`, and emits one init block that contains
both. Position of the init block: directly after YAML frontmatter (if any), before the
diagram body.

Usage:
    merge_theme.py <theme.json> <source.mmd> <output.mmd>
    merge_theme.py --ground <theme.json>      # print the page ground for the theme's kind

Exit codes:
    0 — success
    2 — bad arguments or unreadable input

The script is intentionally permissive about parsing the existing init block —
mermaid's init syntax is JSON-with-single-quotes, not strict JSON. If parsing fails,
the existing init is preserved verbatim and the theme block is appended after it.
That's still better than the old behaviour because the theme block's themeVariables
won't override Phase A's flowchart/sequence/etc keys (mermaid merges sequential init
blocks left-to-right with later wins for the same key, but our theme block doesn't
declare any keys outside themeVariables).
"""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path

INIT_RE = re.compile(r"\A\s*%%\{\s*init\s*:\s*(?P<payload>\{.*?\})\s*\}%%\s*\n", re.DOTALL)
FRONTMATTER_RE = re.compile(r"\A---\n(.*?\n)---\n", re.DOTALL)


def split_frontmatter(src: str) -> tuple[str, str]:
    """Return (frontmatter_with_trailing_newline, body). Both empty-stringable."""
    m = FRONTMATTER_RE.match(src)
    if not m:
        return "", src
    return src[: m.end()], src[m.end() :]


def parse_existing_init(body: str) -> tuple[dict | None, str]:
    """Return (parsed_init_or_None, body_without_init). None means parse failed
    or no init block was present; in both cases body is returned unchanged."""
    m = INIT_RE.match(body)
    if not m:
        return None, body
    raw = m.group("payload")
    # Mermaid init uses single-quoted JSON-ish — convert to JSON for parsing.
    # This is permissive: keys/values that legitimately contain `'` will trip
    # this and we fall through to "preserve verbatim".
    json_compat = raw.replace("'", '"')
    try:
        parsed = json.loads(json_compat)
    except json.JSONDecodeError:
        return None, body
    return parsed, body[m.end() :]


def build_merged_init(existing: dict | None, theme_vars: dict, theme_css: str = "") -> dict:
    merged: dict = dict(existing) if isinstance(existing, dict) else {}
    merged["theme"] = "base"
    existing_tv = merged.get("themeVariables")
    if not isinstance(existing_tv, dict):
        existing_tv = {}
    # Theme values override existing themeVariables for overlapping keys.
    merged["themeVariables"] = {**existing_tv, **theme_vars}
    merged = with_theme_css(merged, theme_css)
    return merged


def with_theme_css(payload: dict, theme_css: str) -> dict:
    """Add a theme's CSS to the init payload: theme CSS first, any author CSS after (so an
    author's per-diagram tweak still wins), and never twice.

    Some colours no themeVariable can set: mermaid draws the timeline axis in the section label
    colour, and its directive sanitizer drops packet block colours. mermaid
    appends `themeCSS` after the diagram styles, scoped to the SVG id, so these rules win.
    """
    if not theme_css:
        return payload
    author_css = payload.get("themeCSS") or ""
    if theme_css in author_css:
        return payload
    payload["themeCSS"] = theme_css + (" " + author_css if author_css else "")
    return payload


def render_init_block(payload: dict) -> str:
    return "%%{init: " + json.dumps(payload, separators=(",", ":")) + "}%%\n"


def merge(theme_path: Path, src_path: Path) -> str:
    theme = json.loads(theme_path.read_text(encoding="utf-8"))
    theme_vars = theme.get("themeVariables", {})
    theme_css = theme.get("themeCSS", "")
    src = src_path.read_text(encoding="utf-8")

    fm, body = split_frontmatter(src)
    existing, body_after_init = parse_existing_init(body)

    if existing is not None:
        merged = build_merged_init(existing, theme_vars, theme_css)
        return fm + render_init_block(merged) + body_after_init

    # Either no init block or it failed to parse — preserve body verbatim and
    # add a theme-only init block in front of it.
    theme_only = with_theme_css({"theme": "base", "themeVariables": theme_vars}, theme_css)
    return fm + render_init_block(theme_only) + body


# The page ground a themed render is drawn on, by the theme's `kind`. Each value is
# the ground its zinc theme was designed against (see the themes' `source` notes).
#
# Why a ground at all: a themed render used to be transparent on the claim that it
# "adapts to whatever page it lands on". It does not -- zinc-light on a dark page
# lost its title (dark ink on dark) and turned every edge label into a white patch
# (measured 2026-10-18). Why by kind: the white ground this replaced was forced onto
# EVERY render, dark themes included. Keying it to the kind means a dark theme can
# never get white. Unthemed renders stay transparent (render.sh), because a source
# may carry its own theme and nothing here knows which.
KIND_GROUND = {"light": "#FFFFFF", "dark": "#27272A"}


def ground_for(theme: dict) -> str:
    """The page ground for a theme, from its `kind`. Raises ValueError on a missing or unknown kind."""
    kind = theme.get("kind")
    if kind not in KIND_GROUND:
        raise ValueError(f"theme kind must be one of {sorted(KIND_GROUND)}, got {kind!r}")
    return KIND_GROUND[kind]


def main(argv: list[str]) -> int:
    if len(argv) == 3 and argv[1] == "--ground":
        theme_path = Path(argv[2])
        if not theme_path.is_file():
            print("Input file missing", file=sys.stderr)
            return 2
        try:
            print(ground_for(json.loads(theme_path.read_text(encoding="utf-8"))))
        except ValueError as exc:
            print(exc, file=sys.stderr)
            return 2
        return 0
    if len(argv) != 4:
        print("Usage: merge_theme.py <theme.json> <source.mmd> <output.mmd>\n"
              "       merge_theme.py --ground <theme.json>", file=sys.stderr)
        return 2
    theme_path = Path(argv[1])
    src_path = Path(argv[2])
    out_path = Path(argv[3])
    if not theme_path.is_file() or not src_path.is_file():
        print("Input file missing", file=sys.stderr)
        return 2
    out_path.write_text(merge(theme_path, src_path), encoding="utf-8")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
