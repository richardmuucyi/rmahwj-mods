#!/usr/bin/env python3
"""Render every corpus diagram across the config permutation grid.

Usage: run_lab.py [--out DIR]

Writes DIR/<diagram>__fs<N>_ns<N>_rs<N>_<curve>.png for every combination, plus
DIR/index.md listing them grouped by diagram so they can be compared side by side.

The grid is deliberately small (3x3x3x3 = 81 per diagram). The point is to find
defensible defaults, not to search exhaustively.
"""

from __future__ import annotations

import argparse
import hashlib
import itertools
import json
import subprocess
import sys
from pathlib import Path

LAB = Path(__file__).resolve().parent
SKILL = LAB.parent

# Shared resolver — see the note in compat_check.py. Do not hand-roll the mmdc
# path: the extensionless npm shim always exists but Windows cannot launch it.
sys.path.insert(0, str(SKILL / "scripts" / "toolchain"))
from versions import mmdc_missing_hint, resolve_mmdc  # noqa: E402

# Reuse the existing frontmatter splitter and viewBox extractor rather than
# hand-rolling second copies of either. The first draft of this file
# duplicated diagram_family()'s frontmatter-skip logic instead of reusing
# merge_theme.py's split_frontmatter(), and it broke: prepending the lab's
# init block ahead of a diagram's own `---...---` frontmatter (rather than
# after it) made mermaid stop recognising the frontmatter at all, which is a
# HARD PARSE FAILURE, not just a missed axis — confirmed against
# sequence-6actor.mmd and graph-dense.mmd, both of which produced zero
# renders. merge_theme.py already solves the "where does the init block go"
# problem; extract_viewbox() (Fix 4 below) already solves "what does this SVG
# actually measure". Reuse both instead of writing a third version.
sys.path.insert(0, str(SKILL / "scripts"))
from merge_theme import split_frontmatter  # noqa: E402
from compat_check import extract_viewbox  # noqa: E402

FONT_SIZES = [12, 14, 16]

# Spacing config is NAMESPACED BY DIAGRAM FAMILY. `nodeSpacing` / `rankSpacing` /
# `curve` live under `flowchart:` and are IGNORED OUTRIGHT by sequence diagrams —
# verified by rendering one sequence diagram at nodeSpacing 10 and at
# 90 and getting byte-identical SVGs. An earlier draft permuted flowchart keys
# across every corpus diagram, which would have emitted 243 identical renders and
# invited someone to pick a "winner" among indistinguishable images.
SPACING_AXES: dict[str, dict[str, list]] = {
    "flowchart": {
        "nodeSpacing": [30, 50, 70],
        "rankSpacing": [40, 60, 80],
        "curve": ["basis", "step", "linear"],
    },
    "sequence": {
        "actorMargin": [30, 50, 80],
        "messageMargin": [25, 35, 50],
    },
}

# First keyword (found AFTER any frontmatter — see diagram_family()) -> config
# namespace.
#
# stateDiagram-v2 / stateDiagram measured into the flowchart namespace:
# lab/corpus/state.mmd rendered with flowchart:{nodeSpacing,
# rankSpacing} at 20 vs 90 changed the SVG viewBox decisively (1232.86x1536 ->
# 1443.41x2796 — a large, unambiguous layout change; measured on an earlier
# copy of state.mmd, before its subject was replaced). The same diagram
# rendered with state:{padding} at 4 vs 40 left the viewBox BYTE-IDENTICAL;
# the small remaining byte/hash difference was then shown to be render noise,
# not signal, by re-rendering the SAME unchanged source twice and finding an
# equivalent byte difference isolated to the same note-box bezier corner both
# times (see Fix 4 / the determinism check).
# flowchart: has a measured effect on this diagram; state: does not. Measured,
# not assumed.
FAMILY_BY_KEYWORD = {
    "flowchart": "flowchart",
    "graph": "flowchart",
    "sequenceDiagram": "sequence",
    "stateDiagram-v2": "flowchart",
    "stateDiagram": "flowchart",
}


def diagram_family(source: str) -> str | None:
    """Return the config namespace for a source, or None if unknown.

    Frontmatter-aware via split_frontmatter(): the diagram-type keyword is
    looked for only in the body AFTER any `---...---` block, so a `title: ...`
    frontmatter line can never be mistaken for the type keyword. That
    mistake — treating "title:" as the first token — is exactly the bug this
    replaced; FAMILY_BY_KEYWORD.get("title:") is None, which silently starved
    two corpus diagrams of their spacing-axis sweep.
    """
    _, body = split_frontmatter(source)
    for line in body.splitlines():
        stripped = line.strip()
        if stripped and not stripped.startswith("%%"):
            return FAMILY_BY_KEYWORD.get(stripped.split()[0])
    return None


def init_block(font_size: int, family: str | None, spacing: dict) -> str:
    payload: dict = {
        "theme": "base",
        "themeVariables": {"fontSize": f"{font_size}px"},
    }
    if family and spacing:
        payload[family] = spacing
    return "%%{init: " + json.dumps(payload, separators=(",", ":")) + "}%%\n"


def build_source(diagram_source: str, fs: int, family: str | None, spacing: dict) -> str:
    """Insert the lab's init block between any existing frontmatter and the
    body — the same position merge_theme.py uses, for the same reason: mermaid
    requires YAML frontmatter to be the document's literal first line, so an
    init block prepended AHEAD of it breaks frontmatter recognition outright
    (confirmed empirically: hard parse failures, not a missed axis).

    Note this does NOT deep-merge against a pre-existing init block that may
    already be present in the diagram's OWN body (as sequence-6actor.mmd has,
    on purpose) — it inserts a second,
    separate init block ahead of it, matching exactly what the coordinator's
    fix specified. merge_theme.py's own docstring warns that mermaid resolves
    two sequential init blocks left-to-right with later-wins-per-key, so if
    the diagram's own trailing init block sets the same keys the lab is
    sweeping, it may silently win. Watch for this in the dead-axis results
    rather than assuming either outcome.
    """
    frontmatter, body = split_frontmatter(diagram_source)
    return frontmatter + init_block(fs, family, spacing) + body


def render(mmdc: Path, source: str, out_png: Path, also_svg: bool) -> tuple[bool, str]:
    """Render `source` to out_png, and — if also_svg — a sibling .svg from the
    identical tmp source (used for the Fix 4 viewBox-digest fallback).
    Returns (ok, stderr_snippet)."""
    tmp = out_png.with_suffix(".mmd")
    tmp.write_text(source, encoding="utf-8")
    try:
        result = subprocess.run(
            [str(mmdc), "-i", str(tmp), "-o", str(out_png),
             "-w", "1800", "-b", "transparent", "--quiet"],
            capture_output=True, text=True,
        )
        if result.returncode != 0:
            return False, result.stderr.strip()[:200]
        if also_svg:
            svg_out = out_png.with_suffix(".svg")
            result2 = subprocess.run(
                [str(mmdc), "-i", str(tmp), "-o", str(svg_out),
                 "-w", "1800", "-b", "transparent", "--quiet"],
                capture_output=True, text=True,
            )
            if result2.returncode != 0:
                return False, result2.stderr.strip()[:200]
        return True, ""
    finally:
        tmp.unlink(missing_ok=True)


def check_determinism(mmdc: Path, probe: Path, out_dir: Path) -> bool:
    """Fix 4: render one corpus diagram twice with IDENTICAL config and
    compare PNG bytes.

    Why: the Step 3b investigation proved mmdc's SVG output is not
    bit-deterministic in at least one region (a note-box rounded-corner
    bezier control point) — re-rendering an unchanged source produced
    different bytes. The dead-axis check below digests raw PNG bytes; if that
    same noise reaches the PNG, every axis could look "live" purely from
    render jitter and the check could never fire. Verify before trusting it
    rather than inferring stability from the fact that it fired once.

    Returns True if PNG renders are byte-stable (safe to digest PNG bytes
    directly for the dead-axis check), False otherwise (caller must fall back
    to comparing the SVG viewBox instead).
    """
    body = probe.read_text(encoding="utf-8")
    family = diagram_family(body)
    axes = SPACING_AXES.get(family, {})
    # Middle value of each applicable axis + middle fontSize — representative
    # of a typical real combo, not a stripped-down edge case.
    spacing = {k: v[len(v) // 2] for k, v in axes.items()}
    source = build_source(body, FONT_SIZES[len(FONT_SIZES) // 2], family, spacing)

    a = out_dir / "_determinism_probe_a.png"
    b = out_dir / "_determinism_probe_b.png"
    ok_a, err_a = render(mmdc, source, a, also_svg=False)
    ok_b, err_b = render(mmdc, source, b, also_svg=False)
    try:
        if not (ok_a and ok_b):
            print(f"determinism check inconclusive (render failed: {err_a or err_b}); "
                  f"assuming PNG renders are NOT stable (safer default).")
            return False
        bytes_a, bytes_b = a.read_bytes(), b.read_bytes()
        print(f"determinism probe ({probe.stem}, fs={FONT_SIZES[len(FONT_SIZES) // 2]}, "
              f"{family or 'no family'}): render A {len(bytes_a)} bytes, "
              f"render B {len(bytes_b)} bytes")
        return bytes_a == bytes_b
    finally:
        a.unlink(missing_ok=True)
        b.unlink(missing_ok=True)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--out", default=str(LAB / "out"))
    args = parser.parse_args()
    out_dir = Path(args.out)
    out_dir.mkdir(parents=True, exist_ok=True)

    mmdc = resolve_mmdc("target")
    if not mmdc.exists():
        print(mmdc_missing_hint(), file=sys.stderr)
        return 2

    corpus = sorted((LAB / "corpus").glob("*.mmd"))
    if not corpus:
        print("No corpus diagrams found in lab/corpus/", file=sys.stderr)
        return 2

    # Fix 4 — decide, by measurement, how the dead-axis check below computes
    # "did this render change" for the whole run.
    png_stable = check_determinism(mmdc, corpus[0], out_dir)
    if png_stable:
        print("determinism: PNG renders are byte-stable")
    else:
        print(
            "WARNING: determinism check FAILED — identical input produced different "
            "PNG bytes across two renders. Dead-axis detection by raw PNG digest is "
            "UNRELIABLE (every axis could look \"live\" from render noise alone, or a "
            "truly dead axis could look alive). Falling back to SVG viewBox comparison "
            "for the dead-axis digest; PNGs are still emitted for human viewing."
        )
    print()

    index: dict[str, list[str]] = {}
    for diagram in corpus:
        body = diagram.read_text(encoding="utf-8")
        family = diagram_family(body)
        axes = SPACING_AXES.get(family, {})
        index[diagram.stem] = []

        # Cartesian product over fontSize x whichever spacing axes apply to THIS
        # diagram family. A diagram whose family is unknown gets fontSize only —
        # better than permuting keys the renderer silently ignores.
        keys = list(axes)
        combos = list(itertools.product(FONT_SIZES, *(axes[k] for k in keys)))

        renders: dict[tuple, str] = {}
        for combo in combos:
            fs, values = combo[0], combo[1:]
            spacing = dict(zip(keys, values))
            label = "_".join(f"{k[:2]}{v}" for k, v in spacing.items())
            name = f"{diagram.stem}__fs{fs}" + (f"_{label}" if label else "")
            png = out_dir / f"{name}.png"
            source = build_source(body, fs, family, spacing)
            ok, err = render(mmdc, source, png, also_svg=not png_stable)
            if not ok:
                print(f"SKIP {name}: {err}")
                continue
            index[diagram.stem].append(png.name)
            if png_stable:
                renders[combo] = hashlib.sha256(png.read_bytes()).hexdigest()
            else:
                svg_text = png.with_suffix(".svg").read_text(encoding="utf-8")
                renders[combo] = extract_viewbox(svg_text) or ""

        # DEAD-AXIS CHECK — say so loudly instead of leaving a wall of identical
        # PNGs for a human to "choose" between. This is the check that would have
        # caught flowchart keys being permuted on sequence diagrams.
        #
        # An axis is dead if, holding EVERY OTHER axis fixed, varying it never
        # changes the output digest (PNG sha256, or SVG viewBox if the
        # determinism check above failed). Pooling all digests into one set
        # cannot tell "this axis did nothing" from "some other axis varied" —
        # so group by the other axes first, then look for variation within
        # each group.
        for position, k in enumerate(keys):
            groups: dict[tuple, set[str]] = {}
            for combo, digest in renders.items():
                others = combo[:1] + combo[1:][:position] + combo[1:][position + 1:]
                groups.setdefault(others, set()).add(digest)
            if groups and all(len(d) <= 1 for d in groups.values()):
                print(f"  DEAD AXIS: {k} had no effect on {diagram.stem} ({family})")

        print(f"{diagram.stem} [{family or 'unknown family'}]: "
              f"{len(index[diagram.stem])} renders over {['fontSize'] + keys}")

    lines = ["# Lab renders\n"]
    for stem, files in index.items():
        lines.append(f"\n## {stem}\n")
        lines.extend(f"![{f}]({f})" for f in files)
    (out_dir / "index.md").write_text("\n".join(lines), encoding="utf-8")
    print(f"\nWrote {out_dir / 'index.md'}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
