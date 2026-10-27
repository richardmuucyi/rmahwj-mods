#!/usr/bin/env python3
"""Extract mermaid code blocks from a markdown file.

Usage: extract_blocks.py <path-to.md>

Prints JSON list to stdout, one object per mermaid block:
    [
      {
        "index": 0,
        "start_line": 5,           # 1-indexed, line of opening ```mermaid
        "end_line": 12,            # 1-indexed, line of closing ```
        "diagram_type": "flowchart",       # raw keyword as it appears in source
        "reference_basename": "flowchart", # which references/diagram-types/<X>.md to read
        "title": "Order Lifecycle" | null,
        "source": "flowchart LR\n    A --> B"
      },
      ...
    ]

`diagram_type` is the raw mermaid keyword (`stateDiagram-v2`, `sankey-beta`, ...).
`reference_basename` is normalised so the agent can directly read
`references/diagram-types/<reference_basename>.md` without doing a separate mapping
pass — that mapping used to live in the agent's head and was easy to get wrong.
For diagram types with no per-type reference file, `reference_basename` is null.

Exit codes:
    0 — success, at least one block found
    1 — success, zero blocks found (empty list printed)
    2 — file unreadable or missing
"""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path

MERMAID_FENCE_OPEN = re.compile(r"^```+\s*mermaid\s*$")
MERMAID_FENCE_CLOSE = re.compile(r"^```+\s*$")

# First-line keywords mermaid uses to declare diagram type. Order matters:
# longer prefixes must come first so `stateDiagram-v2` is matched before
# `stateDiagram`, etc.
DIAGRAM_TYPE_KEYWORDS = (
    "flowchart",
    "graph",
    "sequenceDiagram",
    "stateDiagram-v2",
    "stateDiagram",
    "classDiagram",
    "erDiagram",
    "gantt",
    "pie",
    "journey",
    "C4Context",
    "C4Container",
    "C4Component",
    "mindmap",
    "timeline",
    "quadrantChart",
    "sankey-beta",
    "xychart-beta",
    "block-beta",
    "requirementDiagram",
    "gitGraph",
    # Added 2026-10-18: missing, these five read as "unknown" (tests/test_extract_blocks.py).
    "radar-beta",
    "architecture-beta",
    "packet-beta",
    "packet",
    "kanban",
    "treemap-beta",
    "treemap",
)

# Maps the raw mermaid keyword to the basename of the file under
# references/diagram-types/. Anything not in the map renders fine but has no
# type-specific catalogue — the agent should only walk references/common-issues.md.
DIAGRAM_TYPE_TO_REFERENCE = {
    "flowchart": "flowchart",
    "graph": "flowchart",
    "sequenceDiagram": "sequence",
    "stateDiagram": "state",
    "stateDiagram-v2": "state",
    "classDiagram": "class",
    "erDiagram": "er",
    "gantt": "gantt",
    "pie": "pie",
    "journey": "journey",
    "C4Context": "c4",
    "C4Container": "c4",
    "C4Component": "c4",
    "mindmap": "mindmap",
    "timeline": "timeline",
    "quadrantChart": "quadrant",
    "sankey-beta": "sankey",
    "xychart-beta": "xyChart",
    "block-beta": "block",
    "radar-beta": "radar",
    "architecture-beta": "architecture",
}


def detect_diagram_type(source: str) -> str:
    """Return the mermaid diagram type from the first meaningful line."""
    for raw_line in source.splitlines():
        line = raw_line.strip()
        if not line:
            continue
        # Skip init directives: %%{init: ...}%%
        if line.startswith("%%{") and line.endswith("}%%"):
            continue
        # Skip frontmatter delimiters and frontmatter content.
        if line == "---":
            continue
        if ":" in line and not any(line.startswith(kw) for kw in DIAGRAM_TYPE_KEYWORDS):
            # Likely frontmatter key-value; skip.
            continue
        for kw in DIAGRAM_TYPE_KEYWORDS:
            if line.startswith(kw):
                return kw
        return "unknown"
    return "unknown"


def extract_title(source: str) -> str | None:
    """Return the title from a ---\ntitle: X\n--- frontmatter inside the mermaid block."""
    lines = source.splitlines()
    # Skip leading init directives to find the frontmatter.
    idx = 0
    while idx < len(lines) and (
        not lines[idx].strip() or (lines[idx].strip().startswith("%%{") and lines[idx].strip().endswith("}%%"))
    ):
        idx += 1
    if idx >= len(lines) or lines[idx].strip() != "---":
        return None
    # Parse until the closing ---
    idx += 1
    while idx < len(lines) and lines[idx].strip() != "---":
        line = lines[idx].strip()
        if line.startswith("title:"):
            return line[len("title:"):].strip()
        idx += 1
    return None


def extract_blocks(md_path: Path) -> list[dict]:
    text = md_path.read_text(encoding="utf-8")
    lines = text.splitlines()
    blocks: list[dict] = []
    i = 0
    idx = 0
    while i < len(lines):
        if MERMAID_FENCE_OPEN.match(lines[i]):
            start_line = i + 1  # 1-indexed line of opening fence
            # Find closing fence.
            j = i + 1
            while j < len(lines) and not MERMAID_FENCE_CLOSE.match(lines[j]):
                j += 1
            if j >= len(lines):
                # Unclosed fence — skip rest of file.
                break
            end_line = j + 1  # 1-indexed line of closing fence
            source = "\n".join(lines[i + 1:j])
            dt = detect_diagram_type(source)
            blocks.append({
                "index": idx,
                "start_line": start_line,
                "end_line": end_line,
                "diagram_type": dt,
                "reference_basename": DIAGRAM_TYPE_TO_REFERENCE.get(dt),
                "title": extract_title(source),
                "source": source,
            })
            idx += 1
            i = j + 1
        else:
            i += 1
    return blocks


def main(argv: list[str]) -> int:
    if len(argv) != 2:
        print("Usage: extract_blocks.py <path-to.md>", file=sys.stderr)
        return 2
    md_path = Path(argv[1])
    if not md_path.is_file():
        print(f"File not found: {md_path}", file=sys.stderr)
        return 2
    try:
        blocks = extract_blocks(md_path)
    except Exception as exc:  # noqa: BLE001 — surface any parsing error to stderr
        print(f"Parse error: {exc}", file=sys.stderr)
        return 2
    print(json.dumps(blocks, indent=2))
    return 0 if blocks else 1


if __name__ == "__main__":
    sys.exit(main(sys.argv))
