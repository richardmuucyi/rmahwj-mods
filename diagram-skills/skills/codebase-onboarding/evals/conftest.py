"""Helpers shared by the report-stage tests: a throwaway git repo from a dict of files, and a script runner."""
import json
import os
import subprocess
import sys
from pathlib import Path

import pytest

SCRIPTS = Path(__file__).resolve().parents[1] / "scripts"
sys.path.insert(0, str(SCRIPTS))           # tests may import a script to stub its network or git calls


def git(cwd, *args):
    subprocess.run(["git", "-C", str(cwd), "-c", "user.name=t", "-c", "user.email=t@example.com", *args],
                   check=True, capture_output=True)


def write(root, files):
    for rel, text in files.items():
        p = Path(root) / rel
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_text(text, encoding="utf-8")


@pytest.fixture
def repo(tmp_path):
    """repo(files) -> a git repo with those files in one commit; repo.commit(files, msg) adds another."""
    root = tmp_path / "repo"

    class Repo:
        path = root

        def __call__(self, files):
            root.mkdir(exist_ok=True)
            write(root, files)
            git(root, "init", "-q")
            git(root, "add", "-A")
            git(root, "commit", "-q", "-m", "start")
            return root

        def commit(self, files, msg="change"):
            write(root, files)
            git(root, "add", "-A")
            git(root, "commit", "-q", "-m", msg)

        def clean(self):
            r = subprocess.run(["git", "-C", str(root), "status", "--porcelain"], capture_output=True, text=True)
            return r.stdout == ""

    return Repo()


def run(script, *args):
    return subprocess.run([sys.executable, "-I", str(SCRIPTS / script), *map(str, args)],
                          capture_output=True, text=True, encoding="utf-8")


def load(path):
    return json.loads(Path(path).read_text(encoding="utf-8"))


def save(path, data):
    Path(path).parent.mkdir(parents=True, exist_ok=True)
    Path(path).write_text(json.dumps(data), encoding="utf-8")
