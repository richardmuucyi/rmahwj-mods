"""vulns.py: known advisories for the installed packages (OSV), and secrets committed to git history (gitleaks)."""
import shutil

import pytest

from conftest import load, run, save

PKGS = {"packages": [{"name": "requests", "version": "2.19.0", "ecosystem": "pypi", "licence": "Apache-2.0",
                      "class": "permissive"}], "check_count": 0, "not_scanned": []}
OSV = {"querybatch": {"results": [{"vulns": [{"id": "GHSA-x84v-xcm2-53pg"}]}]},
       "vulns": {"GHSA-x84v-xcm2-53pg": {"id": "GHSA-x84v-xcm2-53pg", "summary": "Insufficient credential protection",
                                         "affected": [{"package": {"name": "requests", "ecosystem": "PyPI"},
                                                       "ranges": [{"type": "ECOSYSTEM",
                                                                   "events": [{"introduced": "0"}, {"fixed": "2.20.0"}]}]}]}}}


def query(tmp_path, *args):
    save(tmp_path / "w" / "licences.json", PKGS)
    return run("vulns.py", "--licences", tmp_path / "w" / "licences.json", "--out", tmp_path / "w" / "vulns.json", *args)


def test_vulns_reads_osv_response(tmp_path):
    save(tmp_path / "osv.json", OSV)
    r = query(tmp_path, "--responses", tmp_path / "osv.json")
    assert r.returncode == 0, r.stderr
    v = load(tmp_path / "w" / "vulns.json")
    assert v["checked"] is True
    assert v["advisories"] == [{"package": "requests", "version": "2.19.0", "id": "GHSA-x84v-xcm2-53pg",
                                "summary": "Insufficient credential protection", "fixed": "2.20.0"}]


def test_vulns_network_error_is_not_checked(tmp_path):
    r = query(tmp_path, "--osv-url", "http://127.0.0.1:9")
    assert r.returncode == 3
    assert "not checked" in r.stdout
    assert load(tmp_path / "w" / "vulns.json")["checked"] is False


def test_vulns_offline_is_not_checked(tmp_path):
    r = query(tmp_path, "--offline")
    assert r.returncode == 0, r.stderr
    v = load(tmp_path / "w" / "vulns.json")
    assert v["checked"] is False and any("offline" in n for n in v["not_checked"])


@pytest.mark.skipif(shutil.which("gitleaks") is None, reason="gitleaks not installed")
def test_vulns_secret_value_never_written(repo, tmp_path):
    token = "ghp_" + "a1B2c3D4e5F6g7H8i9J0k1L2m3N4o5P6q7R8"
    root = repo({"config.py": f'GITHUB_TOKEN = "{token}"\n'})
    r = query(tmp_path, "--offline", "--repo", root, "--private", tmp_path / "w" / "private")
    assert r.returncode == 0, r.stderr
    v = load(tmp_path / "w" / "vulns.json")
    assert len(v["secrets"]) == 1 and v["secrets"][0]["file"] == "config.py"
    assert token not in (tmp_path / "w" / "vulns.json").read_text(encoding="utf-8") and token not in r.stdout
    assert repo.clean()


def test_vulns_fixed_is_a_version_never_a_commit(tmp_path):
    """Seen on the live OSV API: PYSEC advisories list a GIT range (a commit hash) beside the version range."""
    git_first = {"querybatch": {"results": [{"vulns": [{"id": "PYSEC-2018-28"}]}]},
                 "vulns": {"PYSEC-2018-28": {"id": "PYSEC-2018-28", "summary": "s", "affected": [
                     {"package": {"name": "requests", "ecosystem": "PyPI"},
                      "ranges": [{"type": "GIT", "events": [{"introduced": "0"}, {"fixed": "c45d7c49ea75"}]},
                                 {"type": "ECOSYSTEM", "events": [{"introduced": "0"}, {"fixed": "2.20.0"}]}]}]}}}
    save(tmp_path / "osv.json", git_first)
    query(tmp_path, "--responses", tmp_path / "osv.json")
    assert load(tmp_path / "w" / "vulns.json")["advisories"][0]["fixed"] == "2.20.0"


# ---- final review fixes ----------------------------------------------------------------------------

def test_vulns_unscanned_ecosystem_is_not_clean(tmp_path):
    """Review 1: a .NET-only repo has no package to query; that is "not checked", never "0 advisories"."""
    save(tmp_path / "w" / "licences.json", {"packages": [], "check_count": 0, "not_scanned": ["nuget"]})
    r = run("vulns.py", "--licences", tmp_path / "w" / "licences.json", "--out", tmp_path / "w" / "vulns.json",
            "--osv-url", "http://127.0.0.1:9")
    v = load(tmp_path / "w" / "vulns.json")
    assert v["checked"] is False and "0 known advisories" not in r.stdout


def test_vulns_batches_of_1000_and_one_fetch_per_id(monkeypatch):
    """Review 10: OSV takes at most 1,000 queries per batch; each advisory is fetched once."""
    import vulns
    posts, gets = [], []
    monkeypatch.setattr(vulns, "post", lambda url, body: posts.append(len(body["queries"])) or
                        {"results": [{"vulns": [{"id": "GHSA-1"}]} for _ in body["queries"]]})
    monkeypatch.setattr(vulns, "get", lambda url: gets.append(url) or {"id": "GHSA-1", "summary": "s", "affected": []})
    pkgs = [{"name": f"p{i}", "version": "1.0", "ecosystem": "npm"} for i in range(1500)]
    advisories, err = vulns.query(pkgs)
    assert err is None and posts == [1000, 500] and len(gets) == 1 and len(advisories) == 1500


def test_vulns_unreadable_gitleaks_report_is_not_checked(monkeypatch, tmp_path):
    """Regraded minor: a report that does not parse must not read as "0 secrets"."""
    import subprocess as sp
    import vulns

    def fake_run(args, **kw):
        out = args[args.index("--report-path") + 1]
        open(out, "w").write("{not json")
        return sp.CompletedProcess(args, 0, "", "")
    monkeypatch.setattr(vulns.shutil, "which", lambda name: "gitleaks")
    monkeypatch.setattr(vulns.subprocess, "run", fake_run)
    found, err = vulns.secrets(str(tmp_path), str(tmp_path / "private"))
    assert found is None and "not read" in err
