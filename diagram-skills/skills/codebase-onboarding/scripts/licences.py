"""Licences: each installed package's licence, and which ones may need a paid licence before the code can run.

  python -I licences.py --map W/map.json --out W/licences.json [--repo R]
                        [--python W/venv/<bin>/python | --site-packages DIR] [--node-modules DIR]

Read-only. It reads package metadata from the environment stage 2 built (Python dist-info METADATA files;
npm package.json files under node_modules), never from the network and never by importing a package.
  * permissive      MIT, BSD, Apache, ISC, PSF, Unlicense, 0BSD, Zlib, CC0, BSL-1.0
  * weak-copyleft   LGPL, MPL, EPL, CDDL: free, with duties when you change the library itself
  * strong-copyleft GPL, AGPL: free, with duties for the whole program (AGPL: also over a network)
  * check           anything else: Proprietary, Commercial, UNLICENSED, "SEE LICENSE IN …", or none stated.
                    These may need a paid licence: ask the owner. Prices are never guessed.
An "A OR B" expression takes the best option, "A AND B" the worst. Ecosystems the manifests declare but this
script does not read (nuget, go, cargo, maven, rubygems, packagist) are listed under not_scanned, never as clean.
"""
import argparse
import json
import os
import re
import subprocess
import sys

RANK = {"permissive": 0, "weak-copyleft": 1, "strong-copyleft": 2, "check": 3}
CLASSIFIERS = [("MIT", "MIT"), ("BSD", "BSD"), ("Apache", "Apache-2.0"), ("ISC", "ISC"),
               ("Python Software Foundation", "PSF-2.0"), ("Lesser General Public", "LGPL"),
               ("Affero", "AGPL"), ("General Public License", "GPL"), ("Mozilla", "MPL-2.0"),
               ("Eclipse", "EPL"), ("Unlicense", "Unlicense"), ("Zlib", "Zlib"), ("Boost", "BSL-1.0"),
               ("Public Domain", "Unlicense"), ("CC0", "CC0-1.0")]
DECLARED = [(r"(^|/)(requirements[^/]*\.txt|pyproject\.toml|setup\.(py|cfg)|Pipfile|poetry\.lock)$", "pypi"),
            (r"(^|/)package\.json$", "npm")]
ECOSYSTEMS = [(r"\.(cs|fs|vb)proj$|(^|/)packages\.config$|(^|/)Directory\.Packages\.props$", "nuget"),
              (r"(^|/)go\.mod$", "go"), (r"(^|/)Cargo\.toml$", "cargo"),
              (r"(^|/)(pom\.xml|build\.gradle(\.kts)?)$", "maven"), (r"(^|/)Gemfile$", "rubygems"),
              (r"(^|/)composer\.json$", "packagist")]


def one_class(lic):
    s = lic.strip().strip("()").upper()
    if not s:
        return "check"
    if re.match(r"^(MIT|BSD|APACHE|ISC|PYTHON|PSF|UNLICENSE$|0BSD|ZLIB|CC0|BSL-1\.0|BOOST|HPND|PUBLIC DOMAIN)", s):
        return "permissive"
    if re.match(r"^(LGPL|MPL|EPL|CDDL|LESSER)", s):
        return "weak-copyleft"
    if re.match(r"^(GPL|AGPL|AFFERO|GNU GENERAL)", s):
        return "strong-copyleft"
    return "check"


def classify(lic):
    if not lic:
        return "check"
    options = re.split(r"\s+OR\s+", lic, flags=re.I)
    return min((max((one_class(p) for p in re.split(r"\s+AND\s+", o, flags=re.I)), key=RANK.get)
                for o in options), key=RANK.get)


def python_licence(meta):
    m = re.search(r"(?m)^License-Expression:\s*(.+)$", meta)
    if m:
        return m.group(1).strip()
    found = [spdx for c in re.findall(r"(?m)^Classifier:\s*License ::(.+)$", meta)
             for key, spdx in CLASSIFIERS if key.lower() in c.lower()][:1]
    if found:
        return found[0]
    m = re.search(r"(?m)^License:\s*(.+)$", meta)
    return m.group(1).strip()[:60] if m and m.group(1).strip().upper() not in ("UNKNOWN", "") else ""


def site_dirs(python):
    r = subprocess.run([python, "-I", "-c", "import site, sys; print('\\n'.join(site.getsitepackages()))"],
                       capture_output=True, text=True)
    return [d for d in r.stdout.splitlines() if os.path.isdir(d)]


def from_site(site):
    out = []
    for d in sorted(os.listdir(site)):
        if not d.endswith(".dist-info"):
            continue
        try:
            with open(os.path.join(site, d, "METADATA"), encoding="utf-8", errors="replace") as fh:
                meta = fh.read(200_000)
        except OSError:
            continue
        name = re.search(r"(?m)^Name:\s*(.+)$", meta)
        ver = re.search(r"(?m)^Version:\s*(.+)$", meta)
        lic = python_licence(meta)
        out.append({"name": name.group(1).strip() if name else d, "version": ver.group(1).strip() if ver else "",
                    "ecosystem": "pypi", "licence": lic or "none stated", "class": classify(lic)})
    return out


def from_node_modules(nm):
    out = []
    for dirpath, dirnames, filenames in os.walk(nm):
        if "package.json" in filenames and os.path.normpath(dirpath) != os.path.normpath(nm):
            dirnames[:] = [d for d in dirnames if d == "node_modules"]
            try:
                with open(os.path.join(dirpath, "package.json"), encoding="utf-8") as fh:
                    pkg = json.load(fh)
            except (OSError, ValueError):
                continue
            if not isinstance(pkg, dict) or not pkg.get("name"):
                continue
            lic = pkg.get("license") or pkg.get("licenses") or ""
            if isinstance(lic, dict):
                lic = lic.get("type", "")
            if isinstance(lic, list):
                lic = " OR ".join(x.get("type", "") if isinstance(x, dict) else str(x) for x in lic)
            out.append({"name": pkg["name"], "version": str(pkg.get("version", "")), "ecosystem": "npm",
                        "licence": lic or "none stated", "class": classify(lic)})
    return out


def repo_files(repo):
    r = subprocess.run(["git", "-C", repo, "-c", "core.quotepath=off", "ls-files", "-z"],
                       capture_output=True, text=True, encoding="utf-8", errors="replace")
    return [f for f in r.stdout.split("\0") if f] if r.returncode == 0 else []


def collect(python, site_packages, node_modules, map_json, repo=None):
    packages = []
    for site in ([site_packages] if site_packages else site_dirs(python) if python else []):
        packages += from_site(site)
    if node_modules and os.path.isdir(node_modules):
        packages += from_node_modules(node_modules)
    manifests = set(map_json.get("manifests", [])) | {s["manifest"] for s in map_json.get("stack", [])}
    manifests |= set(repo_files(repo)) if repo else set()     # .csproj under central package management
    not_scanned = {eco for m in manifests for rx, eco in ECOSYSTEMS if re.search(rx, m)}
    read = {p["ecosystem"] for p in packages}
    for rx, eco in DECLARED:                          # declared, but no environment was given to read
        if eco not in read and any(re.search(rx, m) for m in manifests):
            not_scanned.add(eco)
    not_scanned = sorted(not_scanned)
    seen, unique = set(), []
    for p in sorted(packages, key=lambda p: (RANK[p["class"]] * -1, p["name"].lower())):
        if (p["ecosystem"], p["name"].lower(), p["version"]) not in seen:
            seen.add((p["ecosystem"], p["name"].lower(), p["version"]))
            unique.append(p)
    return {"packages": unique, "check_count": sum(p["class"] == "check" for p in unique), "not_scanned": not_scanned}


def main():
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--map", required=True)
    p.add_argument("--out", required=True)
    g = p.add_mutually_exclusive_group()
    g.add_argument("--python", help="the virtual environment's python (stage 2)")
    g.add_argument("--site-packages", help="a site-packages folder to read directly")
    p.add_argument("--node-modules")
    p.add_argument("--repo", help="R: find declared ecosystems from the repo's own files too")
    a = p.parse_args()
    with open(a.map, encoding="utf-8") as fh:
        result = collect(a.python, a.site_packages, a.node_modules, json.load(fh), a.repo)
    os.makedirs(os.path.dirname(os.path.abspath(a.out)), exist_ok=True)
    with open(a.out, "w", encoding="utf-8") as fh:
        json.dump(result, fh, indent=1)
    counts = {c: sum(x["class"] == c for x in result["packages"]) for c in RANK}
    print(f"{len(result['packages'])} packages: " + ", ".join(f"{n} {c}" for c, n in counts.items()))
    for x in result["packages"]:
        if x["class"] == "check":
            print(f"  check: {x['name']} {x['version']} ({x['licence']}): may need a paid licence, ask the owner")
    for e in result["not_scanned"]:
        print(f"not scanned: {e} (declared in the manifests, not read by this script)")


if __name__ == "__main__":
    main()
