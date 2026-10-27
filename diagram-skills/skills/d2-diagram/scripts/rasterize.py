#!/usr/bin/env python3
"""Rasterize a D2-produced SVG to PNG using a headless Chromium browser.

Why this exists: d2's own PNG/PDF/PPTX/GIF export is broken on this machine. Those
formats work by downloading a Playwright driver, and d2 v0.7.1 pins Playwright 1.47.2
whose download hosts have been retired -- every mirror returns 404. See references/cli.md.

A headless browser is the *correct* fallback rather than a convenient one: D2 embeds
Markdown as HTML <foreignObject>, which only an HTML-capable renderer draws. A pure SVG
rasteriser (rsvg-convert, Inkscape, cairosvg) silently drops those blocks.

The SVG is wrapped in a minimal HTML page at its natural pixel size before shooting, so
the browser cannot scale-to-fit and surprise you with a soft or cropped image.

An SVG rendered with --dark-theme (or `dark-theme-id`) carries BOTH colour sets, the
dark one behind `@media (prefers-color-scheme:dark)`, and a browser answers that query
from the operating system. On a machine in dark mode, a PNG meant for a light document
came out dark, silently. So the answer is always pinned: --color-scheme light (the
default) or dark rewrites every prefers-color-scheme query in a temporary copy to a
constant-true or constant-false width query. The SVG you keep is never touched, and the
OS setting never reaches the PNG. The flag picks between the sets an SVG carries; it
cannot invent one, so a light-only SVG stays light under --color-scheme dark.

Usage:
    python rasterize.py diagram.svg [more.svg ...] [--scale 2] [--out-dir DIR]
                                    [--background white|transparent]
                                    [--color-scheme light|dark]

--scale 2 gives a 2x pixel-density image (the usual choice for docs and slides).
Exit code is non-zero if any file failed.
"""

from __future__ import annotations

import argparse
import os
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

BROWSERS = [
    Path("C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"),
    Path("C:/Program Files/Microsoft/Edge/Application/msedge.exe"),
    Path("C:/Program Files/Google/Chrome/Application/chrome.exe"),
    Path("C:/Program Files (x86)/Google/Chrome/Application/chrome.exe"),
    Path("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"),
    Path("/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge"),
]


SCHEME_QUERY = re.compile(r"\(\s*prefers-color-scheme\s*:\s*(light|dark)\s*\)")


def pin_scheme(svg_text: str, scheme: str) -> tuple[str, int]:
    """Make every prefers-color-scheme query answer as `scheme`; return (text, count).

    Only the feature is replaced, so `screen and (...)` and `not (...)` keep their logic.
    Width queries stand in because an SVG image always has a viewport wider than 0px.
    """
    always, never = "(min-width:0px)", "(max-width:0px)"
    return SCHEME_QUERY.subn(lambda m: always if m.group(1) == scheme else never, svg_text)


def find_browser() -> str:
    for name in ("chromium", "google-chrome", "chrome", "msedge", "microsoft-edge"):
        found = shutil.which(name)
        if found:
            return found
    for c in BROWSERS:
        if c.is_file():
            return str(c)
    sys.exit(
        "No Chromium-based browser found. Install Chrome or Edge, or pass one on PATH.\n"
        "A pure SVG rasteriser is NOT a substitute -- it drops D2's Markdown blocks."
    )


def svg_size(path: Path) -> tuple[int, int]:
    """Natural pixel size from the SVG root tag, falling back to the viewBox."""
    head = path.read_text(encoding="utf-8", errors="replace")[:4000]
    w = re.search(r'<svg[^>]*\bwidth="([\d.]+)', head)
    h = re.search(r'<svg[^>]*\bheight="([\d.]+)', head)
    if w and h:
        return int(float(w.group(1))), int(float(h.group(1)))
    vb = re.search(r'viewBox="[\d.\-]+ [\d.\-]+ ([\d.]+) ([\d.]+)"', head)
    if vb:
        return int(float(vb.group(1))), int(float(vb.group(2)))
    sys.exit(f"could not determine pixel size of {path}")


def main() -> int:
    p = argparse.ArgumentParser()
    p.add_argument("svgs", nargs="+")
    p.add_argument("--scale", type=float, default=2.0,
                   help="pixel density multiplier (default 2)")
    p.add_argument("--out-dir", default=None,
                   help="where PNGs land (default: beside each SVG)")
    p.add_argument("--background", default="white", choices=["white", "transparent"])
    p.add_argument("--color-scheme", default="light", choices=["light", "dark"],
                   help="which colour set a dual-theme SVG shows "
                        "(default: light; the OS setting is never used)")
    args = p.parse_args()

    browser = find_browser()
    failures = 0

    for s in args.svgs:
        src = Path(s).resolve()
        if not src.is_file():
            print(f"FAIL  {src}  (not found)")
            failures += 1
            continue

        w, h = svg_size(src)
        out_dir = Path(args.out_dir).resolve() if args.out_dir else src.parent
        out_dir.mkdir(parents=True, exist_ok=True)
        png = out_dir / (src.stem + ".png")

        # Temporary files go beside the SVG so relative hrefs resolve under file://.
        shot = src
        pinned = None
        text, n = pin_scheme(src.read_bytes().decode("utf-8", errors="replace"),
                             args.color_scheme)
        if n:
            pinned = src.parent / f".raster_{src.stem}.svg"
            pinned.write_bytes(text.encode("utf-8"))
            shot = pinned
        elif args.color_scheme == "dark":
            print(f"note  {src.name} has no prefers-color-scheme query; "
                  f"--color-scheme dark changes nothing")

        bg = "#ffffff" if args.background == "white" else "transparent"
        wrapper = src.parent / f".raster_{src.stem}.html"
        wrapper.write_text(
            "<!doctype html><meta charset='utf-8'>"
            f"<style>html,body{{margin:0;padding:0;background:{bg}}}"
            f"img{{display:block;width:{w}px;height:{h}px}}</style>"
            f"<img src='{shot.name}'>",
            encoding="utf-8",
        )

        cmd = [
            browser, "--headless=new", "--disable-gpu", "--hide-scrollbars",
            f"--force-device-scale-factor={args.scale}",
            f"--window-size={w},{h}",
            f"--screenshot={png}",
            wrapper.as_uri(),
        ]
        if args.background == "transparent":
            cmd.insert(1, "--default-background-color=00000000")

        proc = subprocess.run(cmd, capture_output=True, text=True, errors="replace")
        wrapper.unlink(missing_ok=True)
        if pinned:
            pinned.unlink(missing_ok=True)

        # Chromium returns 0 even for some failures, so confirm the file really appeared.
        if not png.is_file() or png.stat().st_size == 0:
            print(f"FAIL  {src.name}")
            err = (proc.stderr or "").strip().splitlines()
            for line in err[-4:]:
                print(f"      {line}")
            failures += 1
            continue

        print(f"OK    {png.name}  {int(w*args.scale)}x{int(h*args.scale)} px  "
              f"({png.stat().st_size:,} bytes)")

    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
