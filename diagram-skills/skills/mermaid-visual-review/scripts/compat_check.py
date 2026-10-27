#!/usr/bin/env python3
"""Report whether a mermaid source renders on the older, baseline mermaid.

The baseline (MERMAID_BASELINE in toolchain/VERSIONS) is pinned to the mermaid that
Obsidian bundles, so for Obsidian users this answers "will the live fence draw the
same picture". Repin it to check against another app's bundled mermaid.

Usage: compat_check.py <source.mmd>

Emits a JSON verdict on stdout:

    {
      "target_renders":   true,
      "baseline_renders": false,
      "geometry_matches": null,
      "compatible":       false,
      "target_version":   "11.16.1",
      "baseline_version": "11.13.0",
      "target_viewbox":   "0 0 247.25 70",
      "baseline_viewbox": null,
      "message":          "Uses syntax newer than the baseline mermaid ..."
    }

Exit 0 when a verdict was produced (whatever it says); 2 on input error —
including an unreadable/undecodable source file, or the pinned toolchain
itself not being installed. A crash is never a verdict, so neither case is
allowed to fall through as a traceback.

Why render twice instead of consulting a version table? Because no reliable
published type/version inventory exists to seed one from — a research pass tried
and every enumeration claim was refuted. A wrong table is worse than no warning.
Rendering IS the measurement, and it re-derives itself whenever either pinned
version changes, with nothing to re-audit.

Why compare viewBox instead of calling it "compatible" the moment both exit 0?
Because both toolchains exiting 0 only proves the syntax PARSES on both — it
says nothing about whether the two renders agree. mermaid has changed label/
layout internals across minor versions (e.g. target emitting a
`markdown-node-label` class baseline doesn't); a silent geometry difference
means the fence an older renderer draws will not match the diagram that was reviewed
on target. viewBox is a cheap, concrete proxy for "same picture" — not a
pixel diff, and the verdict message says so rather than overclaiming safety.
"""

from __future__ import annotations

import json
import re
import subprocess
import sys
import tempfile
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent

# Reuse the shared resolver rather than hand-rolling path logic. npm installs
# both an extensionless POSIX shim and a .cmd wrapper; the shim always exists
# and Windows cannot launch it, so an `.exists()`-then-fallback never fires.
sys.path.insert(0, str(SCRIPT_DIR / "toolchain"))
from versions import mmdc_missing_hint, read_versions, resolve_mmdc  # noqa: E402

# Same comment-stripping precaution as evals/assertions/check_no_white_bg.py:
# a comment that happens to contain `<svg ...>`-shaped text must not be
# mistaken for the real root element.
COMMENT_RE = re.compile(r"<!--.*?-->", re.DOTALL)
ROOT_SVG_RE = re.compile(r"<svg\b[^>]*>", re.IGNORECASE)
VIEWBOX_ATTR_RE = re.compile(r"""viewBox\s*=\s*(["'])(.*?)\1""", re.IGNORECASE | re.DOTALL)


def extract_viewbox(svg_text: str) -> str | None:
    """Return the root <svg> element's viewBox attribute value, or None if
    there is no root element or it declares no viewBox."""
    svg = COMMENT_RE.sub("", svg_text)
    root = ROOT_SVG_RE.search(svg)
    if not root:
        return None
    match = VIEWBOX_ATTR_RE.search(root.group(0))
    return match.group(2) if match else None


def renders(which: str, source: str) -> str | None:
    """Render `source` through the named pinned toolchain.

    Returns the rendered SVG text on success, or None if the render failed
    (non-zero exit, or a missing/zero-byte output file) — that's a verdict
    about the diagram. Raises RuntimeError if the pinned toolchain itself is
    not installed — that's an environment problem, not a verdict, so main()
    catches it separately and maps it to exit 2 rather than a wrong verdict.
    """
    binary = resolve_mmdc(which)
    if not binary.exists():
        raise RuntimeError(mmdc_missing_hint())
    with tempfile.TemporaryDirectory() as tmp:
        mmd = Path(tmp) / "in.mmd"
        out = Path(tmp) / "out.svg"
        mmd.write_text(source, encoding="utf-8")
        result = subprocess.run(
            [str(binary), "-i", str(mmd), "-o", str(out),
             "-b", "transparent", "--quiet"],
            capture_output=True,
            text=True,
        )
        if result.returncode != 0 or not out.exists() or out.stat().st_size == 0:
            return None
        return out.read_text(encoding="utf-8")


def main(argv: list[str]) -> int:
    if len(argv) != 2:
        print("Usage: compat_check.py <source.mmd>", file=sys.stderr)
        return 2
    src = Path(argv[1])
    if not src.is_file():
        print(f"Not a file: {src}", file=sys.stderr)
        return 2
    try:
        source = src.read_text(encoding="utf-8")
    except (UnicodeDecodeError, OSError) as exc:
        # UnicodeDecodeError is a ValueError subclass, not an OSError — needs
        # its own arm. Invalid UTF-8 in the source is an input error by the
        # docstring's own definition, not grounds for a traceback.
        print(f"Cannot read {src}: {exc}", file=sys.stderr)
        return 2

    versions = read_versions()
    try:
        target_svg = renders("target", source)
        baseline_svg = renders("baseline", source)
    except RuntimeError as exc:
        # Missing/broken toolchain — an environment problem, not a verdict.
        # render.sh's sibling handling of this same condition is a one-line
        # stderr message and a non-zero exit; mirror that instead of crashing.
        print(str(exc), file=sys.stderr)
        return 2

    target_ok = target_svg is not None
    baseline_ok = baseline_svg is not None
    target_viewbox = extract_viewbox(target_svg) if target_ok else None
    baseline_viewbox = extract_viewbox(baseline_svg) if baseline_ok else None
    geometry_matches = (
        (target_viewbox == baseline_viewbox) if (target_ok and baseline_ok) else None
    )

    if not target_ok:
        compatible = False
        message = "Does not render at all — fix the source before checking compatibility."
    elif not baseline_ok:
        compatible = False
        message = (
            f"Uses syntax newer than the baseline mermaid {versions['MERMAID_BASELINE']} "
            "(the version Obsidian bundles). "
            "The fence will not render there — the SVG will."
        )
    elif not geometry_matches:
        compatible = False
        message = (
            "Renders on both, but the geometry differs between versions — the fence "
            "drawn by the baseline mermaid will not match the diagram that was reviewed."
        )
    else:
        compatible = True
        message = (
            "Renders identically on both. Note this compares page geometry, not every "
            "visual detail."
        )

    print(json.dumps({
        "target_renders": target_ok,
        "baseline_renders": baseline_ok,
        "geometry_matches": geometry_matches,
        "compatible": compatible,
        "target_version": versions["MERMAID_TARGET"],
        "baseline_version": versions["MERMAID_BASELINE"],
        "target_viewbox": target_viewbox,
        "baseline_viewbox": baseline_viewbox,
        "message": message,
    }, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
