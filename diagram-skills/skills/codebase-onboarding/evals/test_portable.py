"""The skill ships in a plugin, away from the vault: it must carry its own question bank and name nothing private.

Run from the skill folder: python -m pytest -q evals/
In the vault, two tests also compare against the vault: the bundled bank against its source note, and every
file against the leak patterns the mods sync uses. Outside the vault both skip.
"""
import glob
import importlib.util
import os
import sys
from pathlib import Path

import pytest

SKILL = Path(__file__).resolve().parents[1]
ROOT = Path(__file__).resolve().parents[4]        # the vault root when the skill sits in .claude/skills/
sys.path.insert(0, str(SKILL / "scripts"))
import kt_bank  # noqa: E402

BANK_NOTE = "Knowledge Transfer Question Bank.md"
SHIPPED = ("learnings/", "__pycache__/", ".pytest_cache/", "node_modules/")


def vault_file(pattern):
    hits = glob.glob(str(ROOT / "*" / pattern))
    return Path(hits[0]) if hits else None


def bundle(note_text):
    """The bundled bank is the vault note, LF line ends, without its link to the vault-only page version."""
    lines = note_text.replace("\r\n", "\n").split("\n")
    return "\n".join(line for line in lines if "|Page version]]" not in line)


def test_kt_default_bank_is_bundled():
    assert Path(kt_bank.DEFAULT_BANK).as_posix().endswith("references/kt-question-bank.md")
    assert Path(kt_bank.DEFAULT_BANK).is_file()


def test_bundled_bank_matches_vault_note():
    note = vault_file(os.path.join("Reference Materials", BANK_NOTE))
    if note is None:
        pytest.skip("not in the vault")
    bundled = (SKILL / "references" / "kt-question-bank.md").read_text(encoding="utf-8").replace("\r\n", "\n")
    assert bundled == bundle(note.read_text(encoding="utf-8")), \
        "the bundled bank drifted from the vault note: copy it again with bundle()"


def test_skill_has_no_leak_terms():
    sync = vault_file(os.path.join("Scripts", "sync_mods_repo.py"))
    if sync is None:
        pytest.skip("not in the vault")
    spec = importlib.util.spec_from_file_location("sync_mods_repo", sync)
    mod = importlib.util.module_from_spec(spec)
    sys.modules["sync_mods_repo"] = mod           # its dataclasses look themselves up there
    spec.loader.exec_module(mod)
    hits = []
    for f in sorted(SKILL.rglob("*")):
        rel = f.relative_to(SKILL).as_posix()
        if not f.is_file() or any(s in rel + "/" for s in SHIPPED):
            continue
        try:
            text = f.read_text(encoding="utf-8")
        except (UnicodeDecodeError, OSError):
            continue
        text = mod.BASE64.sub("", text)
        for old, new in mod.REWRITES:
            text = text.replace(old, new)
        hits += [f"{rel}: {label}" for label, rx in mod.LEAKS if rx.search(text)]
    assert hits == []
