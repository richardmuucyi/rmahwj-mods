"""Tests for scripts/extract_blocks.py."""

import json
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).parent
SCRIPT = HERE.parent / "extract_blocks.py"
FIXTURES = HERE / "fixtures"
SKILL = HERE.parents[1]
sys.path.insert(0, str(HERE.parent))


def run_script(fixture_name: str):
    """Run extract_blocks.py on a fixture and return (exit_code, parsed_json_or_none)."""
    result = subprocess.run(
        [sys.executable, str(SCRIPT), str(FIXTURES / fixture_name)],
        capture_output=True,
        text=True,
    )
    stdout = result.stdout.strip()
    parsed = json.loads(stdout) if stdout else None
    return result.returncode, parsed, result.stderr


def test_single_block_returns_one_entry():
    code, blocks, _ = run_script("single-block.md")
    assert code == 0
    assert len(blocks) == 1
    assert blocks[0]["index"] == 0
    assert blocks[0]["diagram_type"] == "flowchart"
    assert blocks[0]["title"] == "Order Lifecycle"
    assert "flowchart LR" in blocks[0]["source"]
    assert "A --> B" in blocks[0]["source"]


def test_single_block_line_numbers_are_1_indexed():
    code, blocks, _ = run_script("single-block.md")
    assert blocks[0]["start_line"] >= 1
    assert blocks[0]["end_line"] > blocks[0]["start_line"]


def test_multi_block_returns_three_entries_in_order():
    code, blocks, _ = run_script("multi-block.md")
    assert code == 0
    assert len(blocks) == 3
    assert [b["index"] for b in blocks] == [0, 1, 2]
    assert blocks[0]["diagram_type"] == "flowchart"
    assert blocks[1]["diagram_type"] == "sequenceDiagram"
    assert blocks[1]["title"] == "Sequence example"
    assert blocks[2]["diagram_type"] == "stateDiagram-v2"
    assert blocks[0]["title"] is None
    assert blocks[2]["title"] is None


def test_no_block_exits_1_with_empty_list():
    code, blocks, _ = run_script("no-block.md")
    assert code == 1
    assert blocks == []


def test_block_with_init_directive_detects_type_after_init():
    code, blocks, _ = run_script("with-init-block.md")
    assert code == 0
    assert len(blocks) == 1
    assert blocks[0]["diagram_type"] == "flowchart"
    assert blocks[0]["title"] == "Themed"


def test_reference_basename_normalises_aliases():
    """diagram_type carries the raw mermaid keyword; reference_basename maps
    it to the file under references/diagram-types/. The mapping is what the
    agent used to do in its head and get wrong (stateDiagram-v2 → state, not
    stateDiagram-v2.md)."""
    code, blocks, _ = run_script("multi-block.md")
    by_type = {b["diagram_type"]: b for b in blocks}
    assert by_type["flowchart"]["reference_basename"] == "flowchart"
    assert by_type["sequenceDiagram"]["reference_basename"] == "sequence"
    assert by_type["stateDiagram-v2"]["reference_basename"] == "state"


def test_reference_basename_present_for_single_block():
    code, blocks, _ = run_script("single-block.md")
    assert blocks[0]["reference_basename"] == "flowchart"


def test_nonexistent_file_exits_2():
    result = subprocess.run(
        [sys.executable, str(SCRIPT), "/nonexistent/path.md"],
        capture_output=True,
        text=True,
    )
    assert result.returncode == 2


def test_every_corpus_type_is_detected():
    """Every sample in the all-types corpus must come back as its own keyword, not "unknown".

    On 2026-10-18 radar-beta, architecture-beta, packet-beta, kanban and treemap-beta were
    missing from the keyword list, so five of the twenty-two types read as "unknown": no
    catalogue was ever offered for them, and compare_layouts would have said "layout has no
    effect on unknown"."""
    from extract_blocks import detect_diagram_type
    corpus = SKILL / "lab" / "corpus" / "all-types"
    got = {p.stem: detect_diagram_type(p.read_text(encoding="utf-8")) for p in sorted(corpus.glob("*.mmd"))}
    assert len(got) >= 22
    assert [stem for stem, kind in got.items() if kind == "unknown"] == []
    assert got["21-radar"] == "radar-beta" and got["22-treemap"] == "treemap-beta"


def test_new_catalogues_are_offered():
    from extract_blocks import DIAGRAM_TYPE_TO_REFERENCE
    for keyword, basename in (("radar-beta", "radar"), ("architecture-beta", "architecture")):
        assert DIAGRAM_TYPE_TO_REFERENCE.get(keyword) == basename
        assert (SKILL / "references" / "diagram-types" / f"{basename}.md").is_file()
