"""Vulnerabilities already in the code: known advisories for the installed packages, and secrets in git history.

  python -I vulns.py --licences W/licences.json --out W/vulns.json [--offline]
                     [--repo R --private W/private]   (secrets in history, with gitleaks)
                     [--responses FILE] [--osv-url URL] (tests: replay a saved OSV answer / another server)

Advisories: one POST to OSV (https://api.osv.dev/v1/querybatch) with the name and version of every package in
licences.json, then one GET per advisory id for its summary and fixed version. This sends package names and
versions off the machine: run it only after the user's yes at hard stop 1; --offline skips it.
Exit status 3 = the query failed (network, rate limit): the section says "not checked", never "0 found".
Secrets: `gitleaks git R --redact`; its full report stays in W/private, and only the rule, file and commit
reach vulns.json. Code-level review (injection, auth flaws) is not done here: point the user to /claude-security.
"""
import argparse
import json
import os
import shutil
import subprocess
import sys
import urllib.error
import urllib.request

OSV = "https://api.osv.dev/v1"
ECOSYSTEM = {"pypi": "PyPI", "npm": "npm"}
BATCH = 1000


def post(url, body):
    req = urllib.request.Request(url, data=json.dumps(body).encode(), headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.load(r)


def get(url):
    with urllib.request.urlopen(url, timeout=30) as r:
        return json.load(r)


def fixed_version(vuln, name):
    for aff in vuln.get("affected", []):
        if (aff.get("package") or {}).get("name", "").lower() != name.lower():
            continue
        for rng in aff.get("ranges", []):
            if rng.get("type") == "GIT":            # a commit hash, not a version a person can install
                continue
            for ev in rng.get("events", []):
                if "fixed" in ev:
                    return ev["fixed"]
    return None


def query(packages, url=OSV, responses=None):
    """(advisories, error). error is None when the query ran."""
    pkgs = [p for p in packages if p["ecosystem"] in ECOSYSTEM and p.get("version")]
    if not pkgs:
        return [], "nothing to query: no package of a scanned ecosystem (pypi, npm) was read"
    saved = None
    if responses:
        with open(responses, encoding="utf-8") as fh:
            saved = json.load(fh)
    try:
        results = []
        for start in range(0, len(pkgs), BATCH):          # OSV takes at most 1,000 queries per batch
            chunk = pkgs[start:start + BATCH]
            body = {"queries": [{"package": {"name": p["name"], "ecosystem": ECOSYSTEM[p["ecosystem"]]},
                                 "version": p["version"]} for p in chunk]}
            batch = saved["querybatch"] if saved else post(url + "/querybatch", body)
            results += batch.get("results", [])
        out, seen = [], {}
        for p, res in zip(pkgs, results):
            for v in res.get("vulns") or []:
                if v["id"] not in seen:
                    seen[v["id"]] = saved["vulns"][v["id"]] if saved else get(f"{url}/vulns/{v['id']}")
                full = seen[v["id"]]
                out.append({"package": p["name"], "version": p["version"], "id": v["id"],
                            "summary": (full.get("summary") or full.get("details", "")[:160]).strip(),
                            "fixed": fixed_version(full, p["name"])})
        return out, None
    except (urllib.error.URLError, OSError, ValueError, KeyError) as e:
        return [], f"OSV query failed ({type(e).__name__}: {str(e)[:80]})"


def secrets(repo, private):
    if not shutil.which("gitleaks"):
        return None, "gitleaks not installed"
    os.makedirs(private, exist_ok=True)
    report = os.path.join(private, "gitleaks.json")
    r = subprocess.run(["gitleaks", "git", repo, "--report-format", "json", "--report-path", report,
                        "--redact", "--no-banner", "--exit-code", "0", "--log-level", "error"],
                       capture_output=True, text=True)
    if r.returncode != 0:
        return None, f"gitleaks failed: {r.stderr.strip()[:120]}"
    try:
        with open(report, encoding="utf-8") as fh:
            found = json.load(fh) or []
    except (OSError, ValueError) as e:
        return None, f"gitleaks report not read ({type(e).__name__}): not checked, never 0"
    seen, out = set(), []
    for f in found:
        key = (f.get("RuleID"), f.get("File"), f.get("Commit"))
        if key not in seen:
            seen.add(key)
            out.append({"rule": f.get("RuleID", ""), "file": f.get("File", ""), "commit": (f.get("Commit") or "")[:8]})
    return out, None


def main():
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--licences", required=True)
    p.add_argument("--out", required=True)
    p.add_argument("--offline", action="store_true")
    p.add_argument("--repo")
    p.add_argument("--private", help="W/private: gitleaks' full report goes here, never into vulns.json")
    p.add_argument("--responses")
    p.add_argument("--osv-url", default=OSV)
    a = p.parse_args()
    with open(a.licences, encoding="utf-8") as fh:
        lic = json.load(fh)
    result = {"checked": False, "advisories": [], "secrets": [], "not_checked": []}
    code = 0
    if a.offline:
        result["not_checked"].append("advisories: offline (no OSV query made)")
    else:
        advisories, err = query(lic.get("packages", []), a.osv_url, a.responses)
        if err:
            result["not_checked"].append(f"advisories: {err}")
            code = 0 if err.startswith("nothing to query") else 3
        else:
            result["checked"], result["advisories"] = True, advisories
    result["not_checked"] += [f"advisories for {e}: not scanned" for e in lic.get("not_scanned", [])]
    if a.repo:
        found, err = secrets(os.path.abspath(a.repo), a.private or os.path.join(os.path.dirname(os.path.abspath(a.out)), "private"))
        if err:
            result["not_checked"].append(f"secrets: {err}")
        else:
            result["secrets"] = found
    else:
        result["not_checked"].append("secrets: no --repo given")
    os.makedirs(os.path.dirname(os.path.abspath(a.out)), exist_ok=True)
    with open(a.out, "w", encoding="utf-8") as fh:
        json.dump(result, fh, indent=1)
    if result["checked"]:
        print(f"{len(result['advisories'])} known advisories in installed packages")
        for x in result["advisories"]:
            print(f"  {x['package']} {x['version']}: {x['id']} (fixed in {x['fixed'] or 'no fixed version'})")
    print(f"{len(result['secrets'])} secrets found in git history (values hidden)" if a.repo and not any(
        n.startswith("secrets:") for n in result["not_checked"]) else "secrets: not checked")
    for n in result["not_checked"]:
        print(f"not checked: {n}")
    sys.exit(code)


if __name__ == "__main__":
    main()
