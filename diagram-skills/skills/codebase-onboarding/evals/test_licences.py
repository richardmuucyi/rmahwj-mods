"""licences.py: each installed package's licence, and which ones may need a paid licence."""
import json
from pathlib import Path

from conftest import load, run, save


def dist_info(site, name, version, *headers):
    d = Path(site) / f"{name}-{version}.dist-info"
    d.mkdir(parents=True)
    (d / "METADATA").write_text("Metadata-Version: 2.4\n" + f"Name: {name}\nVersion: {version}\n"
                                + "".join(h + "\n" for h in headers), encoding="utf-8")


def collect(tmp_path, *args, stack=()):
    save(tmp_path / "w" / "map.json", {"stack": list(stack), "manifests": [s["manifest"] for s in stack]})
    r = run("licences.py", "--map", tmp_path / "w" / "map.json", "--out", tmp_path / "w" / "licences.json", *args)
    assert r.returncode == 0, r.stderr
    return load(tmp_path / "w" / "licences.json")


def test_licences_classifies(tmp_path):
    site = tmp_path / "site"
    dist_info(site, "requests", "2.32.0", "License-Expression: Apache-2.0")
    dist_info(site, "gplthing", "1.0", "Classifier: License :: OSI Approved :: GNU General Public License v3 (GPLv3)")
    dist_info(site, "mystery", "0.1")
    out = collect(tmp_path, "--site-packages", site)
    by = {p["name"]: p for p in out["packages"]}
    assert by["requests"]["class"] == "permissive"
    assert by["gplthing"]["class"] == "strong-copyleft"
    assert by["mystery"]["class"] == "check"
    assert out["check_count"] == 1


def test_licences_reads_node_modules(tmp_path):
    nm = tmp_path / "node_modules"
    for name, lic in (("a", "ISC"), ("b", "UNLICENSED"), ("@scope/c", {"type": "MIT"})):
        (nm / name).mkdir(parents=True)
        (nm / name / "package.json").write_text(json.dumps({"name": name, "version": "1.0.0", "license": lic}))
    out = collect(tmp_path, "--node-modules", nm)
    by = {p["name"]: p["class"] for p in out["packages"]}
    assert by == {"a": "permissive", "b": "check", "@scope/c": "permissive"}


def test_licences_lists_unscanned_ecosystems(tmp_path):
    out = collect(tmp_path, stack=[{"manifest": "src/App/App.csproj", "name": "Serilog", "version": "3.1.1"},
                                   {"manifest": "go.mod", "name": "github.com/gin-gonic/gin", "version": "v1.10.0"}])
    assert out["not_scanned"] == ["go", "nuget"]


def test_licences_or_expression_takes_the_best_option(tmp_path):
    site = tmp_path / "site"
    dist_info(site, "dual", "1.0", "License-Expression: GPL-2.0-only OR MIT")
    assert collect(tmp_path, "--site-packages", site)["packages"][0]["class"] == "permissive"


def test_licences_detects_ecosystems_from_repo_files(repo, tmp_path):
    """Seen on a real C# repo: central package management leaves .csproj files out of map.json's stack."""
    root = repo({"Directory.Packages.props": "<Project/>\n", "src/App/App.csproj": "<Project/>\n"})
    out = collect(tmp_path, "--repo", root)
    assert out["not_scanned"] == ["nuget"]


def test_licences_missing_environment_is_not_scanned(tmp_path):
    """Review 2: requirements.txt declared but no environment given: pypi is not scanned, not clean."""
    out = collect(tmp_path, stack=[{"manifest": "requirements.txt", "name": "requests", "version": "==2.19.0"},
                                   {"manifest": "web/package.json", "name": "react", "version": "^18.3.1"}])
    assert out["not_scanned"] == ["npm", "pypi"]
