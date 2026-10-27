"""Tests for scripts/merge_theme.py — covers the theme-init merge bug."""

import json
import re
import subprocess
import sys
import tempfile
from pathlib import Path

HERE = Path(__file__).parent
SCRIPT = HERE.parent / "merge_theme.py"

THEME = {
    "name": "test-theme",
    "themeVariables": {
        "background": "#FFFFFF",
        "primaryColor": "#f8f8f9",
        "lineColor": "#939394",
    },
}


def run_merge(source: str) -> str:
    with tempfile.TemporaryDirectory() as tmp:
        tmp = Path(tmp)
        theme_path = tmp / "theme.json"
        src_path = tmp / "src.mmd"
        out_path = tmp / "out.mmd"
        theme_path.write_text(json.dumps(THEME))
        src_path.write_text(source)
        result = subprocess.run(
            [sys.executable, str(SCRIPT), str(theme_path), str(src_path), str(out_path)],
            capture_output=True,
            text=True,
        )
        assert result.returncode == 0, result.stderr
        return out_path.read_text()


def count_init_blocks(text: str) -> int:
    return len(re.findall(r"%%\{\s*init\s*:", text))


def test_no_existing_init_no_frontmatter():
    src = "flowchart LR\n    A --> B\n"
    out = run_merge(src)
    assert count_init_blocks(out) == 1
    assert out.startswith("%%{init:")
    assert "flowchart LR" in out
    # Theme vars present
    assert "#939394" in out


def test_no_existing_init_with_frontmatter():
    src = "---\ntitle: Demo\n---\nflowchart LR\n    A --> B\n"
    out = run_merge(src)
    assert count_init_blocks(out) == 1
    # Frontmatter preserved as the very first thing
    assert out.startswith("---\ntitle: Demo\n---\n")
    # Init block immediately after frontmatter
    body = out[len("---\ntitle: Demo\n---\n"):]
    assert body.startswith("%%{init:")


def test_existing_init_is_merged_not_duplicated():
    """The bug we are fixing: existing init was being duplicated, causing
    mermaid to silently drop one. After the fix there must be exactly one init
    block, and both the Phase A directives and the theme themeVariables must
    be present in it."""
    src = (
        "---\ntitle: Demo\n---\n"
        "%%{init: {'theme':'base','themeVariables':{'fontSize':'14px'},"
        "'flowchart':{'padding':18,'nodeSpacing':55}}}%%\n"
        "flowchart LR\n    A --> B\n"
    )
    out = run_merge(src)
    assert count_init_blocks(out) == 1, f"Expected 1 init block, got {count_init_blocks(out)}:\n{out}"
    # Phase A's flowchart settings preserved
    assert "padding" in out and "18" in out
    assert "nodeSpacing" in out and "55" in out
    # Phase A's pre-existing themeVariable preserved
    assert "fontSize" in out and "14px" in out
    # Theme's themeVariables merged in
    assert "#939394" in out
    assert "primaryColor" in out


def test_theme_themevariables_override_existing_for_same_key():
    src = (
        "%%{init: {'themeVariables':{'lineColor':'#000000','fontSize':'14px'}}}%%\n"
        "flowchart LR\n    A --> B\n"
    )
    out = run_merge(src)
    assert count_init_blocks(out) == 1
    # Theme's lineColor wins over existing
    assert "#939394" in out
    # Existing fontSize kept (theme doesn't set it)
    assert "14px" in out


def test_unparseable_existing_init_falls_back_safely():
    """If the existing init has syntax we can't parse, we should not crash —
    we preserve the existing block verbatim and add a theme-only block ahead
    of the diagram body. Two init blocks here is acceptable: mermaid will at
    least apply the theme."""
    src = (
        "%%{init: {weird: not valid json or jsonish}}%%\n"
        "flowchart LR\n    A --> B\n"
    )
    out = run_merge(src)
    # We don't assert exactly 1 here because the fallback preserves the
    # original. The important guarantee is the script didn't crash and the
    # theme is present.
    assert "#939394" in out
    assert "flowchart LR" in out


def test_idempotent_when_run_twice():
    """Running merge twice should not duplicate blocks or grow the file
    unboundedly. The second pass merges the theme block produced by the
    first pass."""
    src = "flowchart LR\n    A --> B\n"
    once = run_merge(src)
    # Re-run merge on output of first run
    with tempfile.TemporaryDirectory() as tmp:
        tmp = Path(tmp)
        theme_path = tmp / "theme.json"
        src_path = tmp / "src.mmd"
        out_path = tmp / "out.mmd"
        theme_path.write_text(json.dumps(THEME))
        src_path.write_text(once)
        result = subprocess.run(
            [sys.executable, str(SCRIPT), str(theme_path), str(src_path), str(out_path)],
            capture_output=True,
            text=True,
        )
        assert result.returncode == 0
        twice = out_path.read_text()
    assert count_init_blocks(twice) == 1, f"Idempotency broken:\n{twice}"


# --- themeCSS: CSS a theme needs that no themeVariable can set ---------------------------------
# Mermaid draws the timeline axis in the section *label* colour and its directive sanitizer drops
# packet block colours, so the zinc themes carry a little CSS. It must reach the
# init block, keep an author's own themeCSS (after the theme's, so the author's tweak wins), and
# not pile up when merged twice.

CSS_THEME = {**THEME, "themeCSS": ".lineWrapper line{stroke:#939394;}"}


def run_merge_with(theme: dict, source: str) -> str:
    with tempfile.TemporaryDirectory() as tmp:
        tmp = Path(tmp)
        (tmp / "theme.json").write_text(json.dumps(theme))
        (tmp / "src.mmd").write_text(source)
        result = subprocess.run([sys.executable, str(SCRIPT), str(tmp / "theme.json"), str(tmp / "src.mmd"),
                                 str(tmp / "out.mmd")], capture_output=True, text=True)
        assert result.returncode == 0, result.stderr
        return (tmp / "out.mmd").read_text()


def init_payload(text: str) -> dict:
    m = re.search(r"%%\{init: (\{.*\})\}%%", text)
    assert m, text
    return json.loads(m.group(1))


def test_theme_css_reaches_the_init_block():
    out = run_merge_with(CSS_THEME, "timeline\n  A : one\n")
    assert init_payload(out)["themeCSS"] == ".lineWrapper line{stroke:#939394;}"


def test_author_theme_css_is_kept_after_the_theme_css():
    src = "%%{init: {'themeCSS': '.node rect{rx:8;}'}}%%\nflowchart LR\n  A --> B\n"
    css = init_payload(run_merge_with(CSS_THEME, src))["themeCSS"]
    assert css.index(".lineWrapper line") < css.index(".node rect"), css


def test_theme_css_is_not_duplicated_when_merged_twice():
    once = run_merge_with(CSS_THEME, "timeline\n  A : one\n")
    twice = run_merge_with(CSS_THEME, once)
    assert init_payload(twice)["themeCSS"].count(".lineWrapper line") == 1


def test_theme_without_css_adds_no_theme_css_key():
    assert "themeCSS" not in init_payload(run_merge_with(THEME, "flowchart LR\n  A --> B\n"))
