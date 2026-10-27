"""The render toolchains must pin mermaid to exact versions, not caret ranges.

A floating range is what let the QA engine drift ahead of the baseline renderer and
approve diagrams it could not draw. These tests read the committed lockfiles, so
they fail loudly if someone regenerates one against a newer mermaid.
"""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path

TOOLCHAIN = Path(__file__).resolve().parents[1] / "toolchain"

# The VERSIONS parser is shared with compat_check.py — import it rather than
# hand-rolling a second copy that can drift from the one the pin tests assert
# against.
sys.path.insert(0, str(TOOLCHAIN))
from versions import read_versions  # noqa: E402

EXACT_VERSION = re.compile(r"^\d+\.\d+\.\d+$")


def _locked_mermaid(which: str) -> str:
    lock = json.loads((TOOLCHAIN / which / "package-lock.json").read_text(encoding="utf-8"))
    return lock["packages"]["node_modules/mermaid"]["version"]


def test_versions_file_declares_both_pins():
    versions = read_versions()
    assert versions["MERMAID_TARGET"] == "11.16.1"
    assert versions["MERMAID_BASELINE"] == "11.13.0"


def test_target_lockfile_pins_mermaid_exactly():
    assert _locked_mermaid("target") == read_versions()["MERMAID_TARGET"]


def test_baseline_lockfile_pins_mermaid_exactly():
    assert _locked_mermaid("baseline") == read_versions()["MERMAID_BASELINE"]


def test_target_and_baseline_actually_differ():
    """Negative control: if both toolchains resolved the same mermaid, the
    compat check in Task 4 would silently always pass and validate nothing."""
    assert _locked_mermaid("target") != _locked_mermaid("baseline")


def test_no_floating_ranges_in_manifests():
    for which in ("target", "baseline"):
        manifest = json.loads((TOOLCHAIN / which / "package.json").read_text(encoding="utf-8"))
        for key, spec in {**manifest["dependencies"], **manifest["overrides"]}.items():
            assert EXACT_VERSION.match(spec), f"{which}: {key} has non-exact version {spec!r}"


def test_render_sh_uses_pinned_toolchain_not_npx():
    """render.sh must not INVOKE npx — that is the floating path.

    The word legitimately appears in comments explaining why npx is avoided, so
    strip comment lines before asserting. A naive `"npx" not in src` would fail
    on the very comment documenting the fix.
    """
    src = (TOOLCHAIN.parent / "render.sh").read_text(encoding="utf-8")
    assert "toolchain/target/node_modules/.bin/mmdc" in src
    code = "\n".join(
        line for line in src.splitlines() if not line.lstrip().startswith("#")
    )
    assert "npx" not in code, "render.sh still invokes npx; the pin is bypassed"
