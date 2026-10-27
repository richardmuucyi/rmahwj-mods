#!/usr/bin/env python3
"""Assertion: final mermaid source renders cleanly with mmdc.

Usage: check_render_clean.py <path-to-mermaid-source-or-md>

Exit 0 if mmdc successfully renders the source to PNG.
Exit 1 if render fails.
Exit 2 on file error or missing tool.

Note: this script invokes mmdc directly via the pinned toolchain rather than
going through `scripts/render.sh`. The flags match render.sh (-w 1800 -b
transparent). We bypass bash because on some Windows setups Python subprocess
spawns a different bash than the interactive shell, causing path-translation
issues; calling mmdc directly is portable and avoids that entire class of
problem.
"""

from __future__ import annotations

import json
import subprocess
import sys
import tempfile
from pathlib import Path


def load_source(path: Path) -> str:
    if path.suffix == ".mmd":
        return path.read_text(encoding="utf-8")
    extract_script = path.parents[2] / "scripts" / "extract_blocks.py"
    result = subprocess.run(
        ["python", str(extract_script), str(path)],
        capture_output=True,
        text=True,
    )
    if result.returncode not in (0, 1):
        raise RuntimeError(f"extract_blocks.py failed: {result.stderr}")
    blocks = json.loads(result.stdout) if result.stdout.strip() else []
    if not blocks:
        raise RuntimeError(f"No mermaid blocks found in {path}")
    return blocks[0]["source"]


def main(argv: list[str]) -> int:
    if len(argv) != 2:
        print("Usage: check_render_clean.py <path>", file=sys.stderr)
        return 2
    path = Path(argv[1])
    if not path.is_file():
        return 2
    try:
        source = load_source(path)
    except Exception as exc:
        print(f"Load error: {exc}", file=sys.stderr)
        return 2
    skill_root = path.parents[2]
    sys.path.insert(0, str(skill_root / "scripts" / "toolchain"))
    from versions import mmdc_missing_hint, resolve_mmdc  # noqa: E402

    mmdc = resolve_mmdc("target")
    if not mmdc.exists():
        print(f"Tool missing: {mmdc_missing_hint()}", file=sys.stderr)
        return 2
    with tempfile.TemporaryDirectory() as tmp:
        mmd = Path(tmp) / "source.mmd"
        png = Path(tmp) / "out.png"
        mmd.write_text(source, encoding="utf-8")
        result = subprocess.run(
            [
                str(mmdc),
                "-i", str(mmd),
                "-o", str(png),
                "-w", "1800",
                "-b", "transparent",
            ],
            capture_output=True,
            text=True,
        )
        if result.returncode == 0 and png.exists() and png.stat().st_size > 0:
            print(f"PASS: render clean ({png.stat().st_size} bytes)")
            return 0
        print(f"FAIL: mmdc exited {result.returncode}\n{result.stderr}")
        return 1


if __name__ == "__main__":
    sys.exit(main(sys.argv))
