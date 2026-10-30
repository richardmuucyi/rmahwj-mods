"""Planted-claim fact-check: a checker that passes a claim you know is false has checked nothing.

  python factcheck.py cite  --runbook W/out/RUNBOOK.md --repo R [--since <sha the runbook was built on>]
  python factcheck.py make  --claims real.txt --planted planted.txt --sample 17 --seed 7
                            --sheet CHECKER_DIR/claims.md --key PRIVATE_DIR/key.json
  python factcheck.py score --key PRIVATE_DIR/key.json --verdicts verdicts.txt

`cite` comes first and needs no model: every backticked symbol on a runbook line that also names a backticked
file must appear in that file (a dotted name is checked by its last part; a bare file name is found by its
base name; code blocks are skipped). A line with a symbol and no file is counted, not failed. A file named
with no symbol beside it that is not in the repo is listed, not failed (it may be W or a tool). Exit status
3 = a cited file is missing or a symbol is not in its file: fix the runbook, or, when the backticked word is
not a symbol (a tool, a value), write it without backticks. A backticked commit
hash (7-40 hex characters, with a digit and a letter, on a line that says "commit") must name a commit in the repo: part 4's design facts
cite the commit or pull request that made the choice. `--since` also lists the cited files that changed
since that commit, with the runbook lines that cite them: the claims to check again with a new sheet.

Input files hold one claim per line (a leading "- " or "1. " is ignored, blank lines and lines starting
with # are skipped). Real claims come from the runbook; planted claims are 2 or more plausible but false
statements about the same repo, written by you, of the same shape as the real ones (a wrong file, a wrong
default, a behaviour the code does not have). `make` samples the real claims, mixes in every planted one,
shuffles, numbers them and writes the sheet for the checker and the answer key for you.

What `make` refuses, because each would hand the checker the answers: the key, the real-claims file or the
planted file in the sheet's folder or the folder above it (keep all three in W/private); the key inside the
repo. A real claim that shares most of its words with a planted one is left out of the sample (a sheet that
holds "X defaults to true" and "X defaults to false" tells the checker which one is planted).

`score` reads the checker's answer: one line per claim, starting with its number and a verdict word
TRUE, FALSE, PARTLY (or PARTIAL) or UNSURE, e.g. "12: FALSE - parser_tools.py has no tokenizer".
It prints how many planted claims were caught and every real claim the checker did not call TRUE.
Exit status: 0 = every planted claim called FALSE; 3 = not good enough to count: a planted claim passed
as TRUE, got no verdict, or got only PARTLY or UNSURE; 1 = refused (the message says why); 2 = usage error.
"""
import argparse
import json
import os
import random
import re
import subprocess
import sys

ITEM = re.compile(r"^\s*(?:(?:[-*]|\d+[.)])\s+)?(.+?)\s*$")    # "1.5 s is the default" keeps its 1.5
WORD = re.compile(r"[A-Za-z_][A-Za-z0-9_]{2,}")
VERDICT = re.compile(r"^\W*#?(\d+)\W+\**\s*(TRUE|FALSE|PARTLY|PARTIAL|PARTIALLY|UNSURE)\b", re.I)

SHEET_HEAD = """# Claims to check

Each claim below is about the repository at `{repo}`. Some are true and some are false: you are not told
how many. For each one, find the evidence in the code and give a verdict.

- Answer with one line per claim: `<number>: <TRUE|FALSE|PARTLY|UNSURE> - <file and symbol, one sentence>`.
- A claim about behaviour (what the code does when run) is checked by running the code, not by reading a
  comment or a docstring: comments go stale.{run_hint}
- PARTLY means part of the claim is true and part is not; say which part.
- Do not edit any file.

"""


def read_claims(path):
    out = []
    with open(path, encoding="utf-8") as fh:
        for line in fh:
            if not line.strip() or line.lstrip().startswith("#"):
                continue
            m = ITEM.match(line)
            if m:
                out.append(m.group(1))
    return out


def inside(child, parent):
    child, parent = os.path.abspath(child), os.path.abspath(parent)
    return os.path.commonpath([child, parent]) == parent


STOP = set("the and for with from that this are was were when which its not but into than then has have had "
           "does did can will each any all one two also only".split())


def overlap(a, b):
    """Share of the shorter claim's words that the other claim also uses (stop words left out). Aggressive on
    purpose: a false alarm only drops one real claim from the sample."""
    wa = set(WORD.findall(a.lower())) - STOP
    wb = set(WORD.findall(b.lower())) - STOP
    shared = len(wa & wb)
    return 0.0 if shared < 3 else shared / min(len(wa), len(wb))    # short claims share "src index" by chance


def cmd_make(a):
    real, planted = read_claims(a.claims), read_claims(a.planted)
    if len(planted) < 2:
        sys.exit("give at least 2 planted false claims: with one, a lucky checker passes")
    near = os.path.dirname(os.path.dirname(os.path.abspath(a.sheet)))     # the sheet's folder and the one above
    for label, path in (("key", a.key), ("real-claims file", a.claims), ("planted file", a.planted)):
        if inside(path, near):
            sys.exit(f"the {label} is in or beside the sheet's folder, where the checker can read it: "
                     "put it in W/private")
        if a.repo and inside(path, a.repo):
            sys.exit(f"the {label} is inside the repo the checker reads: put it in W/private")
    twins = [c for c in real if any(overlap(c, p) >= 0.4 for p in planted)]
    pool = [c for c in real if c not in twins]
    for c in twins:
        print(f"left out (too close to a planted claim): {c}")
    rng = random.Random(a.seed)
    sample = rng.sample(pool, min(a.sample, len(pool)))
    items = [{"claim": c, "planted": False} for c in sample] + [{"claim": c, "planted": True} for c in planted]
    rng.shuffle(items)
    for n, item in enumerate(items, 1):
        item["n"] = n
    os.makedirs(os.path.dirname(os.path.abspath(a.sheet)), exist_ok=True)
    os.makedirs(os.path.dirname(os.path.abspath(a.key)), exist_ok=True)
    with open(a.sheet, "w", encoding="utf-8", newline="\n") as fh:
        hint = f"\n  Run code from the repository folder like this: `{a.run_hint}`" if a.run_hint else ""
        fh.write(SHEET_HEAD.format(repo=a.repo or "the repository you were given", run_hint=hint))
        fh.write("".join(f"{i['n']}. {i['claim']}\n" for i in items))
    with open(a.key, "w", encoding="utf-8") as fh:
        json.dump(items, fh, indent=1, ensure_ascii=False)
    print(f"sheet: {len(items)} claims ({len(sample)} real of {len(real)}, {len(planted)} planted) -> {a.sheet}")
    print(f"key -> {a.key}  (keep it away from the checker)")


def read_verdicts(path):
    got = {}
    with open(path, encoding="utf-8") as fh:
        for line in fh:
            m = VERDICT.match(line)
            if m:
                word = m.group(2).upper()
                got[int(m.group(1))] = {"PARTIAL": "PARTLY", "PARTIALLY": "PARTLY"}.get(word, word)
    return got


def cmd_score(a):
    with open(a.key, encoding="utf-8") as fh:
        key = json.load(fh)
    got = read_verdicts(a.verdicts)
    planted = [i for i in key if i["planted"]]
    real = [i for i in key if not i["planted"]]
    caught = [i for i in planted if got.get(i["n"]) == "FALSE"]
    half = [i for i in planted if got.get(i["n"]) in ("PARTLY", "UNSURE")]
    passed = [i for i in planted if got.get(i["n"]) == "TRUE"]
    silent = [i for i in key if i["n"] not in got]
    flagged = [i for i in real if got.get(i["n"]) in ("FALSE", "PARTLY", "UNSURE")]
    true_real = [i for i in real if got.get(i["n"]) == "TRUE"]
    print(f"planted caught: {len(caught)}/{len(planted)}  (half-caught as PARTLY/UNSURE: {len(half)})")
    print(f"real claims called TRUE: {len(true_real)}/{len(real)}")
    void = bool(passed) or any(i["planted"] for i in silent)
    for i in passed:
        print(f"VOID: planted claim #{i['n']} passed as TRUE: {i['claim']}")
    for i in half:
        print(f"WEAK: planted claim #{i['n']} got only {got[i['n']]}: {i['claim']}")
    for i in silent:
        print(f"NO VERDICT: #{i['n']}{' (planted)' if i['planted'] else ''}: {i['claim']}")
    for i in flagged:
        print(f"FIX OR DEFEND #{i['n']} ({got[i['n']]}): {i['claim']}")
    if void:
        print("The check is void: its TRUE verdicts prove nothing. Re-brief the checker or use a stronger one.")
    elif half:
        print("The check is too weak to count: a checker that cannot call a planted claim FALSE may pass a real error.")
    elif flagged:
        print("Open each flagged claim in the code yourself before changing the runbook: the checker can be wrong too.")
    sys.exit(3 if void or half else 0)


SPAN = re.compile(r"`([^`\n]+)`")
SYMBOL = re.compile(r"^[A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)*(?:\(\))?$")
SHA = re.compile(r"^(?=[0-9a-f]*[0-9])(?=[0-9a-f]*[a-f])[0-9a-f]{7,40}$")    # hex with a digit and a letter
LITERALS = {"true", "false", "null", "none", "nil", "undefined", "self", "this"}
FILE_EXT = set("py pyi js jsx mjs cjs ts tsx mts cts vue svelte go java kt kts cs rs rb php c h cpp cc hpp swift "
               "scala md rst txt json toml yaml yml cfg ini xml html css scss sql sh ps1 bat lock gradle".split())


def is_file(span):
    if " " in span or "://" in span:
        return False
    return "/" in span or os.path.splitext(span)[1][1:].lower() in FILE_EXT


def git_out(repo, *args):
    r = subprocess.run(["git", "-C", repo, "-c", "core.quotepath=off", *args],
                       capture_output=True, text=True, encoding="utf-8", errors="replace")
    if r.returncode != 0:
        sys.exit(f"git {' '.join(args[:2])} failed: {r.stderr.strip()}")
    return r.stdout


def runbook_lines(path):
    """(line number, text) outside fenced code blocks: commands there are not citations."""
    fence = None
    with open(path, encoding="utf-8") as fh:
        for n, line in enumerate(fh, 1):
            m = re.match(r"^\s*(```|~~~)", line)
            if m:
                fence = None if fence == m.group(1) else (fence or m.group(1))
                continue
            if not fence:
                yield n, line


def cmd_cite(a):
    tracked = [f for f in git_out(a.repo, "ls-files", "-z").split("\0") if f]
    folders = {os.path.dirname(f) for f in tracked}
    text_of = {}

    def resolve(span):
        span = span.strip("/") if span.endswith("/") else span
        if span in folders:
            return "folder"
        return [f for f in tracked if f == span or f.endswith("/" + span)]

    def holds(f, symbol):
        if f not in text_of:
            try:
                with open(os.path.join(a.repo, f), encoding="utf-8", errors="replace") as fh:
                    text_of[f] = fh.read()
            except OSError:
                text_of[f] = ""
        return re.search(r"\b" + re.escape(symbol) + r"\b", text_of[f]) is not None

    checked = found = unpaired = 0
    problems, strays, cites, shas = [], set(), {}, []
    for n, line in runbook_lines(a.runbook):
        spans = SPAN.findall(line)
        files = [s for s in spans if is_file(s)]
        if re.search(r"\bcommit", line, re.I):    # a hex constant elsewhere is not a commit
            shas += [(s, n) for s in spans if SHA.match(s)]
        symbols = [s[:-2] if s.endswith("()") else s for s in spans
                   if not is_file(s) and not SHA.match(s) and SYMBOL.match(s) and s.lower() not in LITERALS]
        hits = {}
        for s in files:
            r = resolve(s)
            if r != "folder":
                hits[s] = r
        if symbols and not hits:
            unpaired += 1
            continue
        for s, r in hits.items():
            for f in r:
                cites.setdefault(f, []).append(n)
            if not r:
                if symbols:
                    problems.append(f"NO SUCH FILE: {s} (runbook line {n})")
                else:
                    strays.add(s)
        real = [f for r in hits.values() for f in r]
        for sym in symbols:
            if not real:
                break
            checked += 1
            if any(holds(f, sym.split(".")[-1]) for f in real):
                found += 1
            else:
                problems.append(f"NOT FOUND: `{sym}` in {', '.join(sorted(set(real)))} (runbook line {n})")
    print(f"{found} of {checked} citations found (a backticked symbol checked in the backticked files on its line)")
    print(f"{unpaired} line{' names' if unpaired == 1 else 's name'} a symbol but no file: not checked")
    if shas:
        missing = [(s, n) for s, n in shas
                   if subprocess.run(["git", "-C", a.repo, "cat-file", "-e", s + "^{commit}"],
                                     capture_output=True).returncode != 0]
        print(f"{len(shas) - len(missing)} of {len(shas)} cited commits found")
        problems += [f"NO SUCH COMMIT: {s} (runbook line {n})" for s, n in missing]
    for s in sorted(strays):
        print(f"named, not in the repo (no symbol on its line, so not counted): {s}")
    for p in problems:
        print(p)
    if a.since:
        changed = set(git_out(a.repo, "diff", "--name-only", f"{a.since}..HEAD").split())
        moved = {f: sorted(set(ns)) for f, ns in cites.items() if f in changed}
        if moved:
            print(f"cited files changed since {a.since[:8]}: check these claims again with a new sheet (make)")
            for f, ns in sorted(moved.items()):
                print(f"  {f}: {len(ns)} line{'' if len(ns) == 1 else 's'} ({', '.join(map(str, ns))})")
        else:
            print(f"no cited file changed since {a.since[:8]}")
    if problems:
        print("Fix the runbook (or write a word that is not a symbol without backticks), then run cite again.")
    sys.exit(3 if problems else 0)


def main():
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = p.add_subparsers(dest="cmd", required=True)
    c = sub.add_parser("cite")
    c.add_argument("--runbook", required=True)
    c.add_argument("--repo", required=True)
    c.add_argument("--since", help="the commit the runbook was built on: list cited files changed since then")
    m = sub.add_parser("make")
    m.add_argument("--claims", required=True)
    m.add_argument("--planted", required=True)
    m.add_argument("--sample", type=int, default=17)
    m.add_argument("--seed", type=int, default=None)
    m.add_argument("--sheet", required=True)
    m.add_argument("--key", required=True)
    m.add_argument("--repo", help="the repo the checker reads (named on the sheet; the key may not be inside it)")
    m.add_argument("--run-hint", help="how to run a snippet against this repo, printed on the sheet")
    s = sub.add_parser("score")
    s.add_argument("--key", required=True)
    s.add_argument("--verdicts", required=True)
    a = p.parse_args()
    {"cite": cmd_cite, "make": cmd_make, "score": cmd_score}[a.cmd](a)


if __name__ == "__main__":
    main()
