"""Outside services and keys: which accounts (LLM, payments, email, cloud …) the code needs, and which secrets it reads.

  python -I services.py R --map W/map.json --out W/services.json

Read-only on the repo. Two sources, each cited by file:
  * packages the manifests declare (W/map.json § stack), matched against references/known-services.json;
  * key names: the left side of .env.example / .env.sample / .env.template, Compose `environment:`,
    appsettings*.json, and code reads (os.environ[...], os.getenv(...), process.env.X,
    Environment.GetEnvironmentVariable(...)). A key counts when its name holds KEY, TOKEN, SECRET or PASSWORD
    and does not end like a setting (…_ENDPOINT, …_URL, …ExpiryMinutes);
    a key whose prefix is known (OPENAI_, STRIPE_ …) adds that service even when no package names it.
`accounts` = the number of distinct services. Values are never read into the output: only names.
Every committed env file is read for names (.env, .env.production …); one that is not a template
(.example, .sample, .template, .dist) is also flagged: it may hold real values, which should be rotated.
"""
import argparse
import fnmatch
import json
import os
import re
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
KNOWN = os.path.join(HERE, os.pardir, "references", "known-services.json")
SECRET = re.compile(r"KEY|TOKEN|SECRET|PASSWORD|PASSWD", re.I)
SETTING = re.compile(r"(ENDPOINT|URL|URI|HOST|PORT|EXPIRY|EXPIRES|MINUTES|SECONDS|TTL|LIFETIME|PATH|FILE|NAME)$", re.I)
NAME = r"([A-Z][A-Z0-9_]{2,})"
ENV_FILE = re.compile(r"(^|/)\.env(\.[\w.-]+)?$")
TEMPLATE = re.compile(r"\.env\.(example|sample|template|dist)$")
COMPOSE = re.compile(r"(^|/)(docker-)?compose[^/]*\.ya?ml$")
APPSETTINGS = re.compile(r"(^|/)appsettings[^/]*\.json$", re.I)
CODE = re.compile(r"\.(py|js|jsx|mjs|cjs|ts|tsx|cs|go|java|kt|rb|php)$")
READS = re.compile(r"os\.environ(?:\.get)?\s*[\[(]\s*['\"]" + NAME + r"|os\.getenv\(\s*['\"]" + NAME
                   + r"|process\.env\.(?:\[\s*['\"])?" + NAME
                   + r"|GetEnvironmentVariable\(\s*\"" + NAME + r"|System\.getenv\(\s*\"" + NAME
                   + r"|os\.Getenv\(\s*\"" + NAME)
TEXT_LIMIT = 1_000_000


def git_files(repo):
    r = subprocess.run(["git", "-C", repo, "-c", "core.quotepath=off", "ls-files", "-z"],
                       capture_output=True, text=True, encoding="utf-8", errors="replace")
    if r.returncode != 0:
        sys.exit(f"git ls-files failed: {r.stderr.strip()}")
    return [f for f in r.stdout.split("\0") if f]


def read(repo, f):
    try:
        if os.path.getsize(os.path.join(repo, f)) > TEXT_LIMIT:
            return ""
        with open(os.path.join(repo, f), encoding="utf-8", errors="replace") as fh:
            return fh.read()
    except OSError:
        return ""


def match_package(name, packages):
    for pattern, hit in packages.items():
        if fnmatch.fnmatchcase(name.lower(), pattern.lower()):
            return hit
    return None


def key_names(path, text):
    """(name, symbol) pairs a file declares or reads. The symbol says how it was found."""
    if ENV_FILE.search(path):
        return [(m.group(1), "env file") for m in re.finditer(r"(?m)^\s*(?:export\s+)?" + NAME + r"\s*=", text)]
    if COMPOSE.search(path):
        return [(m.group(1), "environment") for m in re.finditer(r"(?m)^\s*-?\s*" + NAME + r"\s*[:=]", text)]
    if APPSETTINGS.search(path):
        return [(m.group(1), "appsettings") for m in re.finditer(r'"(\w*(?:Key|Token|Secret|Password)\w*)"\s*:', text)]
    if CODE.search(path):
        return [(next(g for g in m.groups() if g), "env read") for m in READS.finditer(text)]
    return []


def scan(repo, map_json, known):
    services, keys, not_checked = {}, {}, []

    def add(service, kind, file, symbol):
        s = services.setdefault(service, {"name": service, "kind": kind, "evidence": []})
        if {"file": file, "symbol": symbol} not in s["evidence"]:
            s["evidence"].append({"file": file, "symbol": symbol})

    for item in map_json.get("stack", []):
        hit = match_package(item["name"], known["packages"])
        if hit:
            add(hit[0], hit[1], item["manifest"], item["name"])
    for f in git_files(repo):
        if ENV_FILE.search(f) and not TEMPLATE.search(f):
            not_checked.append(f"{f}: a committed env file, may hold real values: rotate them "
                               "(names read, values never)")
        for name, how in key_names(f, read(repo, f)):
            if not SECRET.search(name) or SETTING.search(name):    # TOKEN_ENDPOINT is a setting, not a secret
                continue
            k = keys.setdefault(name, {"name": name, "files": [], "service": None})
            if f not in k["files"]:
                k["files"].append(f)
            for prefix, (service, kind) in known["key_prefixes"].items():
                if name.upper().startswith(prefix):
                    k["service"] = service
                    add(service, kind, f, name)
    out = {"accounts": len(services), "services": sorted(services.values(), key=lambda s: (s["kind"], s["name"])),
           "keys": sorted(keys.values(), key=lambda k: k["name"]), "not_checked": not_checked}
    return out


def main():
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("repo")
    p.add_argument("--map", required=True, help="W/map.json from map_repo.py")
    p.add_argument("--out", required=True, help="W/services.json, outside the repo")
    p.add_argument("--known", default=KNOWN)
    a = p.parse_args()
    repo, out = os.path.abspath(a.repo), os.path.abspath(a.out)
    if os.path.commonpath([repo, out]) == repo:
        sys.exit("--out must be outside the repo")
    with open(a.map, encoding="utf-8") as fh:
        map_json = json.load(fh)
    with open(a.known, encoding="utf-8") as fh:
        known = json.load(fh)
    result = scan(repo, map_json, known)
    os.makedirs(os.path.dirname(out), exist_ok=True)
    with open(out, "w", encoding="utf-8") as fh:
        json.dump(result, fh, indent=1)
    print(f"{result['accounts']} outside account{'' if result['accounts'] == 1 else 's'}: "
          + (", ".join(f"{s['name']} ({s['kind']})" for s in result["services"]) or "none found"))
    print(f"{len(result['keys'])} secret key name{'' if len(result['keys']) == 1 else 's'} (names only, never values)")
    for n in result["not_checked"]:
        print(f"not checked: {n}")


if __name__ == "__main__":
    main()
