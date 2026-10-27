#!/usr/bin/env python3
"""Assertion: final mermaid source has a title frontmatter.

Usage: check_title_frontmatter.py <path-to-mermaid-source-or-md>

Exit 0 if the source contains a ---\\ntitle: ...\\n--- block inside the mermaid.
Exit 1 if not.
Exit 2 on file error.

For .md files, the script extracts the first mermaid block via the sibling
extract_blocks.py script.
"""

from __future__ import annotations

import json
import re
import subprocess
import sys
from pathlib import Path

FRONTMATTER_RE = re.compile(r"---\s*\n\s*title\s*:.+?\n\s*---", re.MULTILINE)


def load_mermaid_source(path: Path) -> str:
    if path.suffix == ".mmd":
        return path.read_text(encoding="utf-8")
    # .md file — call extract_blocks.py
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
        print("Usage: check_title_frontmatter.py <path>", file=sys.stderr)
        return 2
    path = Path(argv[1])
    if not path.is_file():
        print(f"File not found: {path}", file=sys.stderr)
        return 2
    try:
        source = load_mermaid_source(path)
    except Exception as exc:
        print(f"Load error: {exc}", file=sys.stderr)
        return 2
    if FRONTMATTER_RE.search(source):
        print("PASS: title frontmatter present")
        return 0
    print("FAIL: no title frontmatter found in mermaid source")
    return 1


if __name__ == "__main__":
    sys.exit(main(sys.argv))
