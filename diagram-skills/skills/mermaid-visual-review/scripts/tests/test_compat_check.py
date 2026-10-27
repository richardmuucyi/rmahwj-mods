"""compat_check.py renders a diagram through both pinned toolchains and reports
whether the live fence will survive on an older, baseline mermaid (Obsidian's, by default)."""

from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

SKILL = Path(__file__).resolve().parents[2]
COMPAT = SKILL / "scripts" / "compat_check.py"

UNIVERSAL = "flowchart LR\n  A[Start] --> B[End]\n"
TARGET_ONLY = "cynefin-beta\n  title Test\n"


def _run(source: str, tmp_path: Path) -> dict:
    src = tmp_path / "d.mmd"
    src.write_text(source, encoding="utf-8")
    result = subprocess.run(
        [sys.executable, str(COMPAT), str(src)],
        capture_output=True,
        text=True,
    )
    assert result.stdout.strip(), f"no JSON on stdout; stderr={result.stderr}"
    return json.loads(result.stdout)


def test_universal_syntax_is_compatible(tmp_path):
    verdict = _run(UNIVERSAL, tmp_path)
    assert verdict["target_renders"] is True
    assert verdict["baseline_renders"] is True
    assert verdict["geometry_matches"] is True
    assert verdict["compatible"] is True


def test_target_only_syntax_is_flagged(tmp_path):
    """Negative control: cynefin-beta requires mermaid 11.16.0+, so it must
    render on target and fail on baseline. If this reports compatible, the
    baseline toolchain is not actually pinned to an older mermaid and the whole
    check is validating nothing."""
    verdict = _run(TARGET_ONLY, tmp_path)
    assert verdict["target_renders"] is True
    assert verdict["baseline_renders"] is False
    assert verdict["geometry_matches"] is None
    assert verdict["compatible"] is False


def test_unreadable_source_exits_two(tmp_path):
    """Invalid UTF-8 is an input error, not a crash — the docstring promises 2."""
    src = tmp_path / "bad.mmd"
    src.write_bytes(b"flowchart LR\n  A[\xff\xfe] --> B\n")
    result = subprocess.run(
        [sys.executable, str(COMPAT), str(src)], capture_output=True, text=True
    )
    assert result.returncode == 2, f"got {result.returncode}: {result.stderr}"
    assert "Traceback" not in result.stderr
