"""Tests for the optional truth-review pass: scripts/truth_inputs.py and agents/truth-reviewer.md.

The pass runs only when the source declares its facts with `%% SOURCE:` lines -- the
mermaid comment form of d2-diagram's `# SOURCE:` block. It exists because the visual
reviewer, by design, cannot see a wrong claim: on a Bitly architecture review the
d2-diagram truth reviewer caught two errors on the same diagram -- a 2014 service shown
reading a 2023 store, and a step order no source states -- that no visual check flags.
"""

import json
import re
import subprocess
import sys
from pathlib import Path

SKILL = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(SKILL / "scripts"))
sys.path.insert(0, str(SKILL / "scripts" / "toolchain"))
from truth_inputs import declared, svg_labels  # noqa: E402
from versions import resolve_bash  # noqa: E402

SCRIPT = SKILL / "scripts" / "truth_inputs.py"
TEMPLATE = SKILL / "agents" / "truth-reviewer.md"

SOURCED = """---
title: Sourced
---
%%{init: {'flowchart': {'padding': 18}}}%%
%% SOURCE: link data lives in Bigtable = blog post, 2023
%% SOURCE: the queue is NSQ = talk write-up, 2014
%% SOURCE-EXEMPT: the user (a generic person)
%% NOT CLAIMED: no cache -- neither source names one
%% an ordinary comment that is not a fact
flowchart LR
  user([user]) -->|"1 · opens the link"| svc["redirect service<br/>(2014 name)"]
  svc --> store[("link store<br/>Bigtable")]
"""


def test_source_lines_are_collected_and_switch_the_pass_on():
    d = declared(SOURCED)
    assert d["run_truth_review"] is True
    assert d["sources"] == ["link data lives in Bigtable = blog post, 2023",
                            "the queue is NSQ = talk write-up, 2014"]
    assert d["exempt"] == ["the user (a generic person)"]
    assert d["not_claimed"] == ["no cache -- neither source names one"]


def test_no_source_lines_means_no_truth_review():
    """SOURCE-EXEMPT, NOT CLAIMED, init blocks and plain comments are not facts to check."""
    src = SOURCED.replace("%% SOURCE: ", "%% note: ")
    d = declared(src)
    assert d["run_truth_review"] is False and d["sources"] == []


def test_labels_come_from_the_render_with_line_breaks_as_spaces(tmp_path):
    src = tmp_path / "s.mmd"
    src.write_text(SOURCED, encoding="utf-8")
    png = tmp_path / "s.png"
    subprocess.run([resolve_bash(), str(SKILL / "scripts" / "render.sh"), str(src), str(png)],
                   check=True, capture_output=True)
    labels = svg_labels(png.with_suffix(".svg").read_text(encoding="utf-8"))
    assert "Sourced" in labels                                  # the title, a <text> element
    assert "1 · opens the link" in labels                       # an edge label
    assert "redirect service (2014 name)" in labels             # <br/> is a space, not a glue
    assert "link store Bigtable" in labels
    assert not any("{" in l or "stroke" in l for l in labels)  # no CSS leaked in


def test_cli_prints_the_inputs_as_json(tmp_path):
    src = tmp_path / "s.mmd"
    src.write_text(SOURCED, encoding="utf-8")
    out = subprocess.run([sys.executable, str(SCRIPT), str(src)], capture_output=True, text=True)
    assert out.returncode == 0, out.stderr
    data = json.loads(out.stdout)
    assert data["run_truth_review"] is True and len(data["sources"]) == 2


def test_template_carries_every_placeholder_and_output_key():
    text = TEMPLATE.read_text(encoding="utf-8")
    for placeholder in ("{TITLE}", "{TYPE}", "{SYSTEM_DESCRIPTION}", "{DECLARED_FACTS}",
                        "{NOT_CLAIMED}", "{PNG_PATH}", "{LABELS}"):
        assert placeholder in text, f"template lost {placeholder}"
    for key in ("critical", "polish", "reading_order_ok", "semantic_mismatches", "verified_claims"):
        assert f'"{key}"' in text, f"template output lost {key}"
    assert re.search(r"NO TRUSTED SOURCE", text), "template must say what to do without a source"
