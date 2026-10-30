"""Cold-start bug test: does the onboarding pack help a fresh agent fix a real, already-fixed bug?

  python coldstart.py prepare --repo R --fix SHA --name bug-1633 --issue ISSUE.md --private W/private/coldstart
                              [--context RUNBOOK.md AGENTS.md ...] [--arms ctx,noctx] [--runs 2]
                              [--tests PATH ...] [--setup-cmd "npm ci --ignore-scripts"] [--arms-root DIR]
                              [--dry-run] [--force] [--allow-leaks]
  python coldstart.py grade   --manifest W/private/coldstart/bug-1633/manifest.json --arm parent|fixed|ctx1|...
                              --test-cmd "python -m pytest -q -p no:cacheprovider {tests}"
                              [--suite-cmd "python -m pytest -q -p no:cacheprovider"] [--env K=V ...]
                              [--runner auto|pytest|...] [--timeout S]

`prepare` takes the fix commit's parent as the starting point. Run it with --dry-run first: it prints the
hidden test list and the leak check and creates nothing.
  * Hidden tests: by default the test files the fix added or changed (data files under test folders too).
    A shared test file the fix only touched raises the total; keep it or pass --tests on purpose.
  * Leak check: identifiers that first appear in the fix, and the hidden test file names, searched for in
    the --context files. A hit means the notes describe the fix; prepare refuses unless --allow-leaks.
  * Arms: each gets <arms-root>/<random>/ws (default arms-root: the system temp folder). `ws/repo` is a
    one-commit snapshot of the parent, so its history cannot show the fix; `ws/ISSUE.md` is the issue
    text; arms whose name starts with "ctx" also get `ws/notes/` with the --context files.
  * --setup-cmd runs in every snapshot (arms and controls) before any agent starts, for dependencies that
    are not in git (node_modules). The agents are told not to use a package registry.
  * The hidden tests, the two controls (parent and fix, as snapshots) and the results stay in the private
    folder, which no agent is pointed at.

`grade` copies an arm's repo into the private folder (never the system temp folder, where an agent could
find the hidden tests), so the agent's tree is never changed. With --suite-cmd it runs the whole suite first
and compares the failures with the parent control's (grade `parent` first: that run is the baseline). Then
it copies the hidden tests in and runs --test-cmd, where {tests} becomes the hidden test files and {junit} a
JUnit XML path. Without {tests} the command runs as given, and only a {junit} file lets the hidden tests be
counted on their own. Results go to <private>/<name>/results.tsv and results.jsonl.

Grade both controls before any agent runs: `fixed` must pass every hidden test, and `parent` must fail at
least one (if it passes them all, the tests are not importing the arm's code: an editable install or a
PYTHONPATH pointing at the real repo). Grade the agent arms only after every agent has finished.
A run of a repo's tests runs the repo's code.

Exit status: 0 = done; 3 = a control failed or the result cannot be trusted; 1 = refused (the message
says why); 2 = usage error.
"""
import argparse
import datetime
import json
import os
import re
import secrets
import shlex
import shutil
import stat
import subprocess
import sys
import tempfile

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))   # works under python -I too
import baseline  # noqa: E402
import testlog  # noqa: E402

TEST_PATH = re.compile(r"(^|/)(tests?|__tests__|specs?|testing|testdata)/|(^|/)(test_[^/]+|[^/]+_test\.\w+"
                       r"|[^/]+\.(test|spec)\.\w+|[^/]+Tests?\.(java|kt|cs))$", re.I)
TEST_FILE = re.compile(r"(^|/)(test_[^/]+\.py|[^/]+_test\.\w+|[^/]+\.(test|spec)\.\w+|[^/]+Tests?\.(java|kt|cs))$"
                       r"|(^|/)__tests__/[^/]+\.(js|jsx|ts|tsx|mjs|cjs)$")
IDENT = re.compile(r"[A-Za-z_][A-Za-z0-9_]{3,}")
GIT_ID = ["-c", "user.name=coldstart", "-c", "user.email=coldstart@localhost", "-c", "core.hooksPath=.no-hooks"]


def git(cwd, *args, env=None, check=True):
    r = subprocess.run(["git", "-C", cwd, *args], capture_output=True, text=True, encoding="utf-8",
                       errors="replace", env=env)
    if check and r.returncode != 0:
        sys.exit(f"git {' '.join(args[:3])} failed in {cwd}: {r.stderr.strip()}")
    return r.stdout


def rmtree(path):
    """Delete a folder that holds a .git (read-only object files on Windows)."""
    def retry(fn, p, _exc):
        os.chmod(p, stat.S_IWRITE)
        fn(p)
    if sys.version_info >= (3, 12):
        shutil.rmtree(path, onexc=retry)
    else:
        shutil.rmtree(path, onerror=retry)


def snapshot(repo, sha, dest):
    """The files of one commit, as a fresh one-commit repo. A temporary index keeps the source repo's
    index and HEAD untouched; unlike git archive, export-ignore cannot drop the tests."""
    os.makedirs(dest)
    with tempfile.TemporaryDirectory() as tmp:
        env = dict(os.environ, GIT_INDEX_FILE=os.path.join(tmp, "index"))
        git(repo, "read-tree", sha, env=env)
        git(repo, f"--work-tree={dest}", "checkout-index", "-a", "-f", env=env)
    git(dest, "init", "-q")
    git(dest, "add", "-A")
    git(dest, *GIT_ID, "commit", "-q", "--no-verify", "-m", f"snapshot of {sha[:10]}")


def split_cmd(template):
    """A command string to argv. On Windows, backslashes become forward slashes first: POSIX splitting
    would eat them (C:\\venv\\python.exe -> C:venvpython.exe)."""
    if os.name == "nt":
        template = template.replace("\\", "/")
    return shlex.split(template)


def new_identifiers(repo, parent, fix):
    """Identifiers on the fix's added lines that appear nowhere in the parent's tree."""
    diff = git(repo, "diff", "--unified=0", parent, fix)
    added = {w for line in diff.splitlines() if line.startswith("+") and not line.startswith("+++")
             for w in IDENT.findall(line)}
    if not added:
        return set()
    with tempfile.NamedTemporaryFile("w", suffix=".txt", delete=False, encoding="utf-8") as fh:
        fh.write("\n".join(sorted(added)))
        words = fh.name
    try:
        found = git(repo, "grep", "-o", "-h", "-w", "-I", "-F", "-f", words, parent, check=False)
    finally:
        os.unlink(words)
    present = {line.rsplit(":", 1)[-1].strip() for line in found.splitlines()}
    return added - present


def leak_check(repo, parent, fix, added_tests, context):
    """Lines of the notes that name an identifier the fix introduced, or a test file the fix added.
    It cannot see a paraphrase of the fixed behaviour: that part stays the author's discipline."""
    names = new_identifiers(repo, parent, fix)
    names |= {os.path.splitext(os.path.basename(h))[0] for h in added_tests}
    hits = []
    for path in context:
        with open(path, encoding="utf-8", errors="replace") as fh:
            for n, line in enumerate(fh, 1):
                found = sorted(w for w in names if re.search(rf"(?<![A-Za-z0-9_]){re.escape(w)}(?![A-Za-z0-9_])", line))
                if found:
                    hits.append(f"{os.path.basename(path)}:{n}: {', '.join(found)}: {line.strip()[:120]}")
    return hits


def cmd_prepare(a):
    repo = os.path.abspath(a.repo)
    fix = git(repo, "rev-parse", a.fix).strip()
    parent = git(repo, "rev-parse", f"{fix}^").strip()
    private = os.path.join(os.path.abspath(a.private), a.name)
    for path in [a.issue, *a.context]:                          # pre-flight: refuse before creating anything
        if not os.path.isfile(path):
            sys.exit(f"missing input file: {path}")
    if os.path.commonpath([repo, private]) == repo:
        sys.exit("--private must be outside the repo")
    status = {}
    for line in git(repo, "diff", "--name-status", "--no-renames", parent, fix).splitlines():
        letter, _, path = line.partition("\t")
        status[path] = letter[:1]
    if a.tests:
        hidden = a.tests
    else:
        hidden = [p for p, s in status.items() if s in "AM" and TEST_PATH.search(p)]
    runnable = [h for h in hidden if TEST_FILE.search(h)]
    print(f"fix {fix[:10]}, parent {parent[:10]}")
    print(f"hidden: {len(hidden)} file(s), {len(runnable)} passed to {{tests}}")
    for h in hidden:
        print(f"  {'test' if h in runnable else 'data'}  {'added   ' if status.get(h) == 'A' else 'changed '}{h}")
    if not hidden:
        sys.exit("the fix commit changed no test file: pass --tests, or pick a bug whose fix came with a test")
    leaks = leak_check(repo, parent, fix, [h for h in runnable if status.get(h) == "A"], a.context)
    for hit in leaks:
        print(f"LEAK  {hit}")
    print(f"leak check: {len(leaks)} line(s) in the notes name something the fix added")
    if a.dry_run:
        print("dry run: nothing created")
        return
    if leaks and not a.allow_leaks:
        sys.exit("the notes describe the fix: rewrite those lines, or pass --allow-leaks and report the test as contaminated")
    if os.path.exists(private):
        if not a.force:
            sys.exit(f"{private} exists: pick a new --name, or pass --force to replace it and its arms")
        with open(os.path.join(private, "manifest.json"), encoding="utf-8") as fh:
            old = json.load(fh)
        for arm, path in old["arms"].items():
            if arm not in ("parent", "fixed") and os.path.isdir(path):
                rmtree(os.path.dirname(path))
        rmtree(private)

    os.makedirs(os.path.join(private, "hidden"))
    for rel in hidden:
        dest = os.path.join(private, "hidden", rel)
        os.makedirs(os.path.dirname(dest), exist_ok=True)
        data = subprocess.run(["git", "-C", repo, "show", f"{fix}:{rel}"], capture_output=True, check=True).stdout
        with open(dest, "wb") as fh:
            fh.write(data)
    arms = {"parent": os.path.join(private, "control-parent"), "fixed": os.path.join(private, "control-fixed")}
    snapshot(repo, parent, arms["parent"])
    snapshot(repo, fix, arms["fixed"])
    names = [f"{arm}{n}" for arm in a.arms.split(",") for n in range(1, a.runs + 1)]
    for arm in names:
        ws = os.path.join(os.path.abspath(a.arms_root or tempfile.gettempdir()), secrets.token_hex(6), "ws")
        snapshot(repo, parent, os.path.join(ws, "repo"))
        shutil.copy(a.issue, os.path.join(ws, "ISSUE.md"))
        if arm.startswith("ctx"):
            os.makedirs(os.path.join(ws, "notes"))
            for f in a.context:
                shutil.copy(f, os.path.join(ws, "notes", os.path.basename(f)))
        arms[arm] = ws
    if a.setup_cmd:
        for arm, path in arms.items():
            code, text, secs, _ = baseline.run_tests(arm_repo({"arms": arms}, arm), split_cmd(a.setup_cmd))
            print(f"setup {arm}: exit {code} in {secs}s")
            if code != 0:
                sys.exit(f"--setup-cmd failed in {arm}:\n{text[-1500:]}")
    manifest = {"name": a.name, "repo": repo, "fix": fix, "parent": parent, "hidden": hidden,
                "arms": arms, "context": [os.path.basename(f) for f in a.context], "leaks": leaks,
                "created": datetime.datetime.now().isoformat(timespec="seconds")}
    with open(os.path.join(private, "manifest.json"), "w", encoding="utf-8") as fh:
        json.dump(manifest, fh, indent=1)
    for arm, path in arms.items():
        print(f"  {arm:8} {path}")
    print(f"manifest: {os.path.join(private, 'manifest.json')}")
    print("Next: grade `fixed` (must pass every hidden test) and `parent` (must fail at least one), before any agent runs.")


def arm_repo(manifest, arm):
    path = manifest["arms"][arm]
    return path if arm in ("parent", "fixed") else os.path.join(path, "repo")


def expand(template, tests, junit):
    out = []
    for tok in split_cmd(template):
        if tok == "{tests}":
            out += tests
        else:
            out.append(tok.replace("{junit}", junit.replace("\\", "/")))
    return out


def hidden_only(junit, hidden):
    """Counts and failing IDs of the testcases that come from a hidden test file (JUnit file/classname)."""
    stems = [os.path.splitext(h)[0].replace("\\", "/") for h in hidden]
    keys = stems + [s.replace("/", ".") for s in stems] + [os.path.basename(s) for s in stems]
    import xml.etree.ElementTree as ET
    counts, ids = {"passed": 0, "failed": 0, "errors": 0, "skipped": 0}, []
    for case in ET.parse(junit).getroot().iter("testcase"):
        where = f"{case.get('file', '')} {case.get('classname', '')}"
        if not any(k and k in where for k in keys):
            continue
        test_id = testlog.safe_id(f"{case.get('classname', '')}::{case.get('name', '')}")
        if case.find("failure") is not None:
            counts["failed"] += 1
            ids.append(test_id)
        elif case.find("error") is not None:
            counts["errors"] += 1
            ids.append(test_id)
        elif case.find("skipped") is not None:
            counts["skipped"] += 1
        else:
            counts["passed"] += 1
    return ids, counts


def run_and_parse(cwd, argv, env, runner, junit, timeout):
    code, text, secs, timed_out = baseline.run_tests(cwd, argv, env, timeout)
    if os.path.exists(junit):
        name, ids, counts = testlog.parse_junit([junit])
    else:
        name, ids, counts = testlog.parse_log(text, runner)
    return code, text, secs, name, ids, counts, testlog.sanity(code, name, ids, counts, timed_out)


def cmd_grade(a):
    with open(a.manifest, encoding="utf-8") as fh:
        manifest = json.load(fh)
    private = os.path.dirname(os.path.abspath(a.manifest))
    src = arm_repo(manifest, a.arm)
    stamp = datetime.datetime.now().strftime("%Y%m%d-%H%M%S")
    result = {"arm": a.arm, "when": stamp}
    runnable = [rel for rel in manifest["hidden"] if TEST_FILE.search(rel)]
    uses_tests = "{tests}" in a.test_cmd
    if uses_tests and not runnable:
        sys.exit("no hidden file is named like a test file, so there is nothing to pass as {tests}")
    scratch = os.path.join(private, ".grading")
    os.makedirs(scratch, exist_ok=True)
    tmp = tempfile.mkdtemp(prefix=f"{a.arm}-", dir=scratch)
    try:
        work = os.path.join(tmp, "repo")
        shutil.copytree(src, work, symlinks=True)
        if a.arm not in ("parent", "fixed"):
            git(work, "add", "-A")
            diff = git(work, "diff", "--cached", "HEAD")
            with open(os.path.join(private, f"{a.arm}.diff"), "w", encoding="utf-8", newline="\n") as fh:
                fh.write(diff)
            result["diff_stat"] = git(work, "diff", "--cached", "--shortstat", "HEAD").strip()
        if a.suite_cmd:
            suite_xml = os.path.join(tmp, "suite.xml")
            code, _, secs, name, ids, counts, warns = run_and_parse(
                work, expand(a.suite_cmd, [], suite_xml), a.env, a.runner, suite_xml, a.timeout)
            with open(os.path.join(private, f"suite-{a.arm}.txt"), "w", encoding="utf-8", newline="\n") as fh:
                fh.write("".join(i + "\n" for i in ids))
            base_file = os.path.join(private, "suite-parent.txt")
            new = None
            if a.arm == "parent":
                new = 0
            elif os.path.exists(base_file):
                new_ids = sorted(set(ids) - baseline.read_ids(base_file))
                new = len(new_ids)
                result["suite_new"] = new_ids[:50]
            elif a.arm != "fixed":
                warns.append("no parent suite baseline yet: grade `parent` with --suite-cmd first")
            result["suite"] = {"failing": len(ids), "seconds": secs, "warnings": warns, "new_failures": new}
        for rel in manifest["hidden"]:
            dest = os.path.join(work, rel)
            os.makedirs(os.path.dirname(dest), exist_ok=True)
            shutil.copy(os.path.join(private, "hidden", rel), dest)
        junit = os.path.join(tmp, "hidden.xml")
        code, text, secs, name, ids, counts, warns = run_and_parse(
            work, expand(a.test_cmd, runnable, junit), a.env, a.runner, junit, a.timeout)
        if not uses_tests:
            if os.path.exists(junit):
                ids, counts = hidden_only(junit, manifest["hidden"])
            else:
                warns.append("no {tests} and no {junit} in --test-cmd: the counts cover the whole command, "
                             "not only the hidden tests")
        with open(os.path.join(private, f"hidden-{a.arm}.log"), "w", encoding="utf-8", newline="\n") as fh:
            fh.write(text)
    finally:
        rmtree(tmp)
    passed = counts.get("passed", 0)
    total = passed + counts.get("failed", 0) + counts.get("errors", 0)
    result["hidden"] = {"passed": passed, "total": total, "failing": ids, "counts": counts,
                        "exit_status": code, "seconds": secs, "warnings": warns}
    with open(os.path.join(private, "results.jsonl"), "a", encoding="utf-8") as fh:
        fh.write(json.dumps(result) + "\n")
    tsv = os.path.join(private, "results.tsv")
    new_tsv = not os.path.exists(tsv)
    suite_new = result.get("suite", {}).get("new_failures")
    with open(tsv, "a", encoding="utf-8", newline="\n") as fh:
        if new_tsv:
            fh.write("when\tarm\thidden_passed\thidden_total\tnew_suite_failures\tdiff\n")
        fh.write(f"{stamp}\t{a.arm}\t{passed}\t{total}\t{'' if suite_new is None else suite_new}\t"
                 f"{result.get('diff_stat', '')}\n")
    line = f"{a.arm}: hidden {passed}/{total} passed"
    if "suite" in result:
        line += f"; suite {result['suite']['failing']} failing, new vs parent: {suite_new}"
    if "diff_stat" in result:
        line += f"; diff: {result['diff_stat'] or 'none'}"
    print(line)
    all_warns = warns + result.get("suite", {}).get("warnings", [])
    for w in all_warns:
        print(f"WARNING: {w}")
    if a.arm == "fixed" and (total == 0 or passed != total):
        print("CONTROL FAILED: the real fix does not pass its own hidden tests here. Fix the test command, the "
              "environment or the hidden test list before running any agent.")
        sys.exit(3)
    if a.arm == "parent" and total and passed == total:
        print("CONTROL FAILED: the unfixed parent passes every hidden test, so the tests are not exercising the "
              "arm's code (an editable install or a PYTHONPATH pointing at the real repo?), or the bug is not real here.")
        sys.exit(3)
    if all_warns:
        sys.exit(3)


def main():
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = p.add_subparsers(dest="cmd", required=True)
    pr = sub.add_parser("prepare")
    pr.add_argument("--repo", required=True)
    pr.add_argument("--fix", required=True, help="the commit that fixed the bug")
    pr.add_argument("--name", required=True)
    pr.add_argument("--issue", required=True, help="a file with the issue text the agent will get")
    pr.add_argument("--private", required=True, help="folder for hidden tests, controls and results")
    pr.add_argument("--context", nargs="*", default=[])
    pr.add_argument("--arms", default="ctx,noctx")
    pr.add_argument("--runs", type=int, default=2, help="agent runs per arm; one run per arm is an anecdote")
    pr.add_argument("--tests", nargs="*", help="hidden test files (default: test files the fix added or changed)")
    pr.add_argument("--setup-cmd", help="run in every snapshot before agents start, e.g. 'npm ci --ignore-scripts'")
    pr.add_argument("--arms-root", help="where the arm folders go (default: the system temp folder)")
    pr.add_argument("--dry-run", action="store_true", help="print the hidden list and the leak check; create nothing")
    pr.add_argument("--force", action="store_true", help="replace an existing test of this name and its arms")
    pr.add_argument("--allow-leaks", action="store_true", help="go on although the notes name things the fix added")
    g = sub.add_parser("grade")
    g.add_argument("--manifest", required=True)
    g.add_argument("--arm", required=True)
    g.add_argument("--test-cmd", required=True, help="command; {tests} = hidden test files, {junit} = XML path")
    g.add_argument("--suite-cmd")
    g.add_argument("--env", action="append", default=[], metavar="KEY=VALUE")
    g.add_argument("--runner", default="auto", choices=["auto", *testlog.PARSERS])
    g.add_argument("--timeout", type=int, default=3600)
    a = p.parse_args()
    {"prepare": cmd_prepare, "grade": cmd_grade}[a.cmd](a)


if __name__ == "__main__":
    main()
