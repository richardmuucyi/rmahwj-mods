"""Tests for evals/assertions/check_no_white_bg.py.

An adversarial review hand-wrote SVGs and found two Critical false-PASS
holes in this checker — cases where it declared an opaque white background
transparent, which is the exact failure this assertion exists to prevent:

1. The style-attribute regex only matched double quotes; a single-quoted
   `style='background-color: white;'` root was invisible to it.
2. The root-element search ran on the raw document, so an XML comment
   containing `<svg style="...">`-shaped text ahead of the real root could
   mask a white root (or manufacture a false FAIL against a transparent
   one).

Each case below writes a small hand-built SVG to `tmp_path` and invokes the
checker as a subprocess, asserting only the exit code (0 pass, 1 fail,
2 error) so this file cannot regress a fourth time.
"""

from __future__ import annotations

import subprocess
import sys
from pathlib import Path

import pytest

HERE = Path(__file__).resolve().parent
SCRIPTS = HERE.parent
SKILL_ROOT = SCRIPTS.parent
SCRIPT = SKILL_ROOT / "evals" / "assertions" / "check_no_white_bg.py"
TOOLCHAIN = SCRIPTS / "toolchain"

sys.path.insert(0, str(TOOLCHAIN))
from versions import resolve_mmdc  # noqa: E402


def run_checker(tmp_path: Path, svg: str) -> subprocess.CompletedProcess:
    svg_path = tmp_path / "test.svg"
    svg_path.write_text(svg, encoding="utf-8")
    return subprocess.run(
        [sys.executable, str(SCRIPT), str(svg_path)],
        capture_output=True,
        text=True,
    )


def _assert_exit(result: subprocess.CompletedProcess, expected: int) -> None:
    assert result.returncode == expected, (
        f"expected exit {expected}, got {result.returncode}\n"
        f"stdout: {result.stdout}\nstderr: {result.stderr}"
    )


# --- opaque backgrounds: must FAIL (exit 1) -------------------------------


def test_double_quoted_white_fails(tmp_path):
    svg = '<svg xmlns="http://www.w3.org/2000/svg" style="background-color: white;"><rect/></svg>'
    _assert_exit(run_checker(tmp_path, svg), 1)


def test_single_quoted_white_fails(tmp_path):
    """Critical 1 regression: the style attribute may be single-quoted."""
    svg = "<svg xmlns=\"http://www.w3.org/2000/svg\" style='background-color: white;'><rect/></svg>"
    _assert_exit(run_checker(tmp_path, svg), 1)


def test_mixed_case_property_and_value_fails(tmp_path):
    svg = '<svg xmlns="http://www.w3.org/2000/svg" style="Background-Color:WHITE"><rect/></svg>'
    _assert_exit(run_checker(tmp_path, svg), 1)


def test_hex_white_fails(tmp_path):
    svg = '<svg xmlns="http://www.w3.org/2000/svg" style="background-color: #fff;"><rect/></svg>'
    _assert_exit(run_checker(tmp_path, svg), 1)


def test_rgb_white_fails(tmp_path):
    svg = '<svg xmlns="http://www.w3.org/2000/svg" style="background-color: rgb(255,255,255);"><rect/></svg>'
    _assert_exit(run_checker(tmp_path, svg), 1)


# --- transparent backgrounds: must PASS (exit 0) --------------------------


def test_transparent_passes(tmp_path):
    svg = '<svg xmlns="http://www.w3.org/2000/svg" style="background-color: transparent;"><rect/></svg>'
    _assert_exit(run_checker(tmp_path, svg), 0)


def test_transparent_case_insensitive_passes(tmp_path):
    svg = '<svg xmlns="http://www.w3.org/2000/svg" style="background-color: TRANSPARENT;"><rect/></svg>'
    _assert_exit(run_checker(tmp_path, svg), 0)


def test_rgba_zero_alpha_passes(tmp_path):
    svg = '<svg xmlns="http://www.w3.org/2000/svg" style="background-color: rgba(0, 0, 0, 0);"><rect/></svg>'
    _assert_exit(run_checker(tmp_path, svg), 0)


def test_no_style_attribute_passes(tmp_path):
    svg = '<svg xmlns="http://www.w3.org/2000/svg"><rect/></svg>'
    _assert_exit(run_checker(tmp_path, svg), 0)


def test_style_without_background_passes(tmp_path):
    svg = '<svg xmlns="http://www.w3.org/2000/svg" style="max-width:100px;"><rect/></svg>'
    _assert_exit(run_checker(tmp_path, svg), 0)


def test_transparent_root_with_edge_label_chip_css_passes(tmp_path):
    """A transparent root plus mermaid's always-emitted `.edgeLabel` chip
    background (unrelated page furniture) must still PASS — this is the
    false-positive the whole-document scan used to produce."""
    svg = (
        '<svg xmlns="http://www.w3.org/2000/svg" style="background-color: transparent;">'
        "<style>.edgeLabel{background-color:#FFF;}</style><rect/></svg>"
    )
    _assert_exit(run_checker(tmp_path, svg), 0)


# --- comment decoys: Critical 2 regression, both directions ---------------


def test_comment_decoy_transparent_before_white_root_fails(tmp_path):
    """A comment claiming transparent must not mask a genuinely white root."""
    svg = (
        '<!-- decoy: <svg style="background-color:transparent"> -->\n'
        '<svg xmlns="http://www.w3.org/2000/svg" style="background-color: white;"><rect/></svg>'
    )
    _assert_exit(run_checker(tmp_path, svg), 1)


def test_comment_decoy_white_before_transparent_root_passes(tmp_path):
    """Mirror case: a comment claiming white must not manufacture a false
    FAIL against a genuinely transparent root."""
    svg = (
        '<!-- decoy: <svg style="background-color:white"> -->\n'
        '<svg xmlns="http://www.w3.org/2000/svg" style="background-color: transparent;"><rect/></svg>'
    )
    _assert_exit(run_checker(tmp_path, svg), 0)


# --- error cases: exit 2 ---------------------------------------------------


def test_no_svg_element_exits_2(tmp_path):
    svg = "<?xml version=\"1.0\"?>\n<html><body>not an svg</body></html>\n"
    _assert_exit(run_checker(tmp_path, svg), 2)


def test_empty_file_exits_2(tmp_path):
    _assert_exit(run_checker(tmp_path, ""), 2)


# --- resolve_mmdc input validation ------------------------------------------


def test_resolve_mmdc_rejects_unknown_toolchain():
    with pytest.raises(ValueError):
        resolve_mmdc("nonsense")
