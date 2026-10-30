"""Architecture style: a verdict with the evidence behind it, DDD and TDD as approaches beside it, and practices.

  python -I arch.py R --map W/map.json --out W/arch.json

Read-only on the repo. The verdict is one of: monolith, modular monolith, microservices, mixed,
not determined, with the layout in front for one unit ("layered monolith", "vertical slice monolith",
"hexagonal monolith"). How it is decided, each signal cited by file:
  * deploy units  = folders holding a Dockerfile, Compose services with `build:`, Kubernetes Deployments.
                    Two or more units with their own builds: microservices, or mixed when their layouts differ;
  * layout        = per unit: vertical slice (a features/ or modules/ folder whose children each hold 2+ code
                    files, one a test) > hexagonal (ports/ and adapters/) > layered (2+ folders named by layer:
                    controllers, services, repositories, models, views, handlers, routes, dao; or 3+ projects
                    named <Name>.Domain / .Application / .Infrastructure / .Api, the .NET clean-architecture shape);
  * thin evidence = fewer than 5 code files and no layout: not determined.
DDD and TDD are approaches, not styles: a monolith can use both. DDD = a domain/ folder plus file names with
2+ of aggregate, entity, value object, repository, bounded context. TDD = numbers only: commits that change a
test and source together, and tests whose first commit came before their source file's. Never "TDD: yes".
"""
import argparse
import collections
import json
import os
import re
import subprocess
import sys

CODE = re.compile(r"\.(py|js|jsx|mjs|cjs|ts|tsx|cs|go|java|kt|rb|php|rs|swift)$")
TEST = re.compile(r"(^|/)(tests?|__tests__|specs?)/|(^|/)test_[^/]+$|_test\.\w+$|\.(test|spec)\.\w+$|Tests?\.(cs|java|kt)$")
LAYERS = {"controllers", "controller", "services", "service", "repositories", "repository", "models", "model",
          "views", "handlers", "routes", "dao", "dal"}
DOTTED_LAYER = re.compile(r"\.(Domain|Application|Infrastructure|Api|Web|Core|Persistence|Data|Contracts)$", re.I)
MONO_ROOTS = {"apps", "packages", "services", "projects", "libs"}
SLICE_ROOTS = {"features", "feature", "modules", "slices", "components"}
DDD_TERMS = {"aggregate": r"aggregate", "entity": r"entit", "value object": r"value_?object|valueobject",
             "repository": r"repositor", "bounded context": r"bounded_?context"}
CONVENTIONAL = re.compile(r"^(feat|fix|chore|docs|refactor|test|build|ci|perf|style|revert)(\(.+\))?!?: ")
PRACTICE_FILES = [
    ("formatter", re.compile(r"(^|/)(\.prettierrc[^/]*|\.editorconfig|\.clang-format|rustfmt\.toml|\.black)$")),
    ("linter", re.compile(r"(^|/)(ruff\.toml|\.ruff\.toml|\.flake8|\.pylintrc|\.eslintrc[^/]*|eslint\.config\.\w+|"
                          r"\.golangci\.ya?ml|\.rubocop\.yml|stylecop\.json|\.editorconfig)$")),
    ("type checking", re.compile(r"(^|/)(mypy\.ini|pyrightconfig\.json|tsconfig[^/]*\.json)$")),
    ("pre-commit hooks", re.compile(r"(^|/)(\.pre-commit-config\.yaml|\.husky/[^/]+|lefthook\.yml)$")),
]


def git(repo, *args):
    r = subprocess.run(["git", "-C", repo, "-c", "core.quotepath=off", *args],
                       capture_output=True, text=True, encoding="utf-8", errors="replace")
    if r.returncode != 0:
        sys.exit(f"git {args[0]} failed: {r.stderr.strip()}")
    return r.stdout


def read(repo, f):
    try:
        with open(os.path.join(repo, f), encoding="utf-8", errors="replace") as fh:
            return fh.read(200_000)
    except OSError:
        return ""


def under(f, unit):
    return unit == "." or f == unit or f.startswith(unit + "/")


def deploy_units(repo, files):
    units, evidence = set(), []
    for f in files:
        if re.search(r"(^|/)Dockerfile(\.[\w-]+)?$", f) and not f.endswith(".dockerignore"):
            units.add(os.path.dirname(f) or ".")
            evidence.append({"file": f})
        elif re.search(r"(^|/)(docker-)?compose[^/]*\.ya?ml$", f):
            lines = read(repo, f).splitlines()
            for i, line in enumerate(lines):
                m = re.match(r"^\s+build:\s*['\"]?([^\s'\"#]*)", line)
                if not m:
                    continue
                path = m.group(1)                       # `build: ./x`, or `build:` then `context: ./x`
                for nxt in lines[i + 1:i + 4]:
                    c = re.match(r"^\s+context:\s*['\"]?([^\s'\"#]+)", nxt)
                    if not path and c:
                        path = c.group(1)
                unit = os.path.normpath(os.path.join(os.path.dirname(f), path or ".")).replace("\\", "/")
                if not unit.startswith(".."):           # a context outside the repo builds nothing here
                    units.add(unit)
                evidence.append({"file": f})
        elif f.endswith((".yaml", ".yml")) and re.search(r"(?m)^kind:\s*Deployment\b", read(repo, f)):
            evidence.append({"file": f})
    if len(units) > 1:
        units.discard(".")      # a root build next to nested ones builds one of them (seen on a real repo)
    return sorted(units) or ["."], evidence


def layout(files):
    """(word, evidence files) for the files of one unit, or (None, [])."""
    parts = [f.split("/") for f in files]
    slices = collections.defaultdict(list)
    for p, f in zip(parts, files):
        for i, seg in enumerate(p[:-2]):
            if seg.lower() in SLICE_ROOTS:
                slices["/".join(p[:i + 2])].append(f)
                break
    full = [d for d, fs in slices.items() if len([x for x in fs if CODE.search(x)]) >= 2 and any(TEST.search(x) for x in fs)]
    if len(full) >= 2:
        return "vertical slice", sorted(full)
    folders = {seg.lower() for p in parts for seg in p[:-1]}
    if {"ports", "adapters"} <= folders:
        return "hexagonal", sorted({"/".join(p[:p.index(s) + 1]) for p in parts for s in p[:-1] if s in ("ports", "adapters")})
    found = sorted({seg for p in parts for seg in p[:-1] if seg.lower() in LAYERS})
    if len({s.lower().rstrip("s") for s in found}) >= 2:
        return "layered", found
    projects = sorted({seg for p in parts for seg in p[:-1] if DOTTED_LAYER.search(seg)})   # Acme.Domain, Acme.Api
    if len({DOTTED_LAYER.search(s).group(1).lower() for s in projects}) >= 3:
        return "layered", projects
    return None, []


def approaches(repo, files):
    out = []
    dom = [f for f in files if re.search(r"(^|/)domain/", f) and CODE.search(f)]
    hits = {t: [f for f in dom if re.search(rx, os.path.basename(f), re.I)] for t, rx in DDD_TERMS.items()}
    terms = [t for t, fs in hits.items() if fs]
    if dom and len(terms) >= 2:
        out.append({"name": "DDD", "value": "evidence found", "detail": ", ".join(terms),
                    "evidence": [{"file": f} for f in sorted({f for t in terms for f in hits[t]})]})
    else:
        out.append({"name": "DDD", "value": "not found", "evidence": []})
    log = git(repo, "log", "--no-merges", "--format=@%H", "--name-only")
    commits, cur = [], None
    for line in log.splitlines():
        if line.startswith("@"):
            cur = []
            commits.append(cur)
        elif line.strip() and cur is not None:
            cur.append(line.strip())
    code = [c for c in commits]
    together = sum(1 for c in code if any(TEST.search(f) for f in c) and any(CODE.search(f) and not TEST.search(f) for f in c))
    first = {}
    for line in git(repo, "log", "--reverse", "--no-merges", "--diff-filter=A", "--format=@%ct", "--name-only").splitlines():
        if line.startswith("@"):
            t = int(line[1:])
        elif line.strip():
            first.setdefault(line.strip(), t)
    stem = lambda f: re.sub(r"^test_|_test$|\.(test|spec)$|Tests?$", "", os.path.splitext(os.path.basename(f))[0])
    sources = {stem(f): f for f in files if CODE.search(f) and not TEST.search(f)}
    pairs = [(t, sources[stem(t)]) for t in files if TEST.search(t) and CODE.search(t) and stem(t) in sources]
    before = sum(1 for t, s in pairs if first.get(t, 1 << 62) < first.get(s, 0))
    out.append({"name": "TDD", "value": f"{together} of {len(code)} commits change a test and source together; "
                f"{before} of {len(pairs)} tests came before their code", "evidence": []})
    return out


def practices(repo, files, map_json):
    out = []
    for name, rx in PRACTICE_FILES:
        fs = [f for f in files if rx.search(f)]
        if fs:
            out.append({"name": name, "value": "configured", "evidence": [{"file": f} for f in fs[:5]]})
    tests = [f for f in files if TEST.search(f) and CODE.search(f)]
    src = [f for f in files if CODE.search(f) and not TEST.search(f)]
    out.append({"name": "tests", "value": f"{len(tests)} test files for {len(src)} source files", "evidence": []})
    ci = map_json.get("ci_commands", {})
    if ci:
        out.append({"name": "CI checks", "value": f"{sum(len(v) for v in ci.values())} commands",
                    "evidence": [{"file": f} for f in ci]})
    subjects = git(repo, "log", "-200", "--no-merges", "--format=%s").splitlines()
    if subjects:
        n = sum(1 for s in subjects if CONVENTIONAL.match(s))
        out.append({"name": "commit style", "value": f"{n} of {len(subjects)} subjects follow Conventional Commits",
                    "evidence": []})
    return out


def classify(repo, map_json):
    files = [f for f in git(repo, "ls-files", "-z").split("\0") if f]
    units, deploy_ev = deploy_units(repo, files)
    with_code = [u for u in units if any(CODE.search(f) and under(f, u) for f in files)]
    units = with_code or ["."]                       # docker/app, docker/worker hold no code: one app
    if units == ["."]:                               # apps/, packages/, services/: a monorepo without Docker
        kids = sorted({"/".join(f.split("/")[:2]) for f in files
                       if f.count("/") >= 2 and f.split("/")[0].lower() in MONO_ROOTS})
        found = {k: layout([f for f in files if under(f, k)])[0] for k in kids}
        found = {k: v for k, v in found.items() if v}
        if len(set(found.values())) >= 2:
            units = sorted(found)
    unit_rows, signals = [], [{"name": "deploy units", "value": str(len(units) if units != ["."] else 1),
                              "evidence": deploy_ev[:10]}]
    for u in units:
        word, ev = layout([f for f in files if len(units) == 1 or under(f, u)])   # one deployable: all the code
        unit_rows.append({"path": u, "verdict": word or "not determined"})
        if word:
            signals.append({"name": f"layout of {u}", "value": word, "evidence": [{"file": e} for e in ev[:8]]})
    code = [f for f in files if CODE.search(f)]
    words = {r["verdict"] for r in unit_rows if r["verdict"] != "not determined"}
    if len(unit_rows) > 1:
        verdict = "mixed" if len(words) > 1 else "microservices"
        confidence = "high" if deploy_ev else "medium"
    elif words:
        verdict, confidence = f"{words.pop()} monolith", "high" if deploy_ev else "medium"
    elif len(code) < 5:
        verdict, confidence = "not determined", "low"
    else:
        verdict, confidence = "monolith", "low"
    return {"verdict": verdict, "confidence": confidence, "units": unit_rows, "signals": signals,
            "approaches": approaches(repo, files), "practices": practices(repo, files, map_json)}


def main():
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("repo")
    p.add_argument("--map", required=True)
    p.add_argument("--out", required=True)
    a = p.parse_args()
    repo, out = os.path.abspath(a.repo), os.path.abspath(a.out)
    if os.path.commonpath([repo, out]) == repo:
        sys.exit("--out must be outside the repo")
    with open(a.map, encoding="utf-8") as fh:
        result = classify(repo, json.load(fh))
    os.makedirs(os.path.dirname(out), exist_ok=True)
    with open(out, "w", encoding="utf-8") as fh:
        json.dump(result, fh, indent=1)
    print(f"verdict: {result['verdict']} (confidence {result['confidence']})")
    for u in result["units"]:
        print(f"  unit {u['path']}: {u['verdict']}")
    for x in result["approaches"]:
        print(f"{x['name']}: {x['value']}")


if __name__ == "__main__":
    main()
