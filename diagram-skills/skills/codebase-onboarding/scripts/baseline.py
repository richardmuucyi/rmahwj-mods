"""Save which tests fail BEFORE you change anything, then judge a change by the difference.

  python baseline.py run  --repo R --out W/baseline [--runner auto|pytest|jest|vitest|cargo|dotnet]
                          [--pattern REGEX] [--junit GLOB] [--env KEY=VALUE ...] [--timeout S] -- <test command>
  python baseline.py parse LOG [--runner ...] [--pattern ...] [--junit GLOB]
  python baseline.py diff  W/baseline.txt W/after.txt

`run` writes <out>.log (the whole output), <out>.txt (one failing test ID per line, sorted) and
<out>.json (command, commit, platform, exit status, counts, warnings). It runs the command with the
repo as the working folder and no shell, so `--env` is how to set PYTHONPATH and the like. --junit is a
glob as given (make the runner write its XML into W, by absolute path, so nothing lands in the repo).
On a timeout the whole process tree is killed, so `npm` and the node it starts both stop.

A run of a repo's tests runs the repo's code. Do it only for a repo you trust, or inside a sandbox.

Exit status: 0 = saved and the parse looks sane; 3 = saved but a warning says the list cannot be
trusted (read it before you use the file); 1 = refused (the message says why); 2 = usage error.
`diff` exits 1 when there are new failures.
"""
import argparse
import glob
import json
import os
import platform
import shlex
import shutil
import subprocess
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))   # works under python -I too
import testlog  # noqa: E402


def head_commit(repo):
    r = subprocess.run(["git", "-C", repo, "rev-parse", "HEAD"], capture_output=True, text=True)
    return r.stdout.strip() or None


def resolve(argv):
    """Find the program the way a shell would, so `npm` finds npm.cmd on Windows."""
    found = shutil.which(argv[0])
    return [found or argv[0], *argv[1:]]


def kill_tree(proc):
    """Kill the process we started and its children: on Windows, killing npm.cmd alone leaves node
    holding the output pipes open, and the wait never ends. Only our own PID tree is touched."""
    if os.name == "nt":
        subprocess.run(["taskkill", "/T", "/F", "/PID", str(proc.pid)], capture_output=True)
    else:
        os.killpg(proc.pid, 9)


def run_tests(repo, command, env_pairs=(), timeout=3600):
    """Return (exit status or None on a timeout, output text, seconds, timed_out)."""
    env = dict(os.environ)
    for pair in env_pairs:
        key, _, value = pair.partition("=")
        env[key] = value
    start = time.time()
    group = {"creationflags": subprocess.CREATE_NEW_PROCESS_GROUP} if os.name == "nt" else {"start_new_session": True}
    try:
        proc = subprocess.Popen(resolve(command), cwd=repo, env=env, stdout=subprocess.PIPE,
                                stderr=subprocess.STDOUT, **group)
    except OSError as exc:
        return 127, f"could not start {command[0]!r}: {exc}\n", 0.0, False
    try:
        out, _ = proc.communicate(timeout=timeout)
        code, timed_out = proc.returncode, False
    except subprocess.TimeoutExpired:
        kill_tree(proc)
        out, _ = proc.communicate()
        out, code, timed_out = (out or b"") + f"\n[timed out after {timeout}s]\n".encode(), None, True
    return code, out.decode("utf-8", errors="replace"), round(time.time() - start, 1), timed_out


def parse_any(text, runner, pattern, junit_glob):
    if junit_glob:
        paths = sorted(glob.glob(junit_glob, recursive=True))
        if not paths:
            return "junit", [], {}, [f"no JUnit file matched {junit_glob}"]
        name, ids, counts = testlog.parse_junit(paths)
        return name, ids, counts, []
    name, ids, counts = testlog.parse_log(text, runner, pattern)
    return name, ids, counts, []


def cmd_run(a):
    if not a.command:
        sys.exit("give the test command after --")
    repo = os.path.abspath(a.repo)
    out = os.path.abspath(a.out)
    if os.path.commonpath([repo, out]) == repo:
        sys.exit(f"--out must be outside the repo ({repo}), so the baseline never lands in its git status")
    os.makedirs(os.path.dirname(out), exist_ok=True)
    code, text, secs, timed_out = run_tests(repo, a.command, a.env, a.timeout)
    with open(out + ".log", "w", encoding="utf-8", newline="\n") as fh:
        fh.write(text)
    name, ids, counts, extra = parse_any(text, a.runner, a.pattern, a.junit)
    warns = extra + testlog.sanity(code, name, ids, counts, timed_out)
    with open(out + ".txt", "w", encoding="utf-8", newline="\n") as fh:
        fh.write("".join(i + "\n" for i in ids))
    meta = {"command": shlex.join(a.command), "env": a.env, "repo": repo, "commit": head_commit(repo),
            "platform": f"{platform.system()} {platform.release()}", "python": platform.python_version(),
            "exit_status": code, "seconds": secs, "runner": name, "failing": len(ids), "counts": counts,
            "warnings": warns}
    with open(out + ".json", "w", encoding="utf-8") as fh:
        json.dump(meta, fh, indent=1)
    print(f"{len(ids)} failing  runner={name}  exit={code}  {secs}s  commit={str(meta['commit'])[:8]}")
    print(f"counts: {counts}")
    for w in warns:
        print(f"WARNING: {w}")
    print(f"wrote {out}.txt / .log / .json")
    sys.exit(3 if warns else 0)


def cmd_parse(a):
    with open(a.log, encoding="utf-8", errors="replace") as fh:
        text = fh.read()
    name, ids, counts, extra = parse_any(text, a.runner, a.pattern, a.junit)
    warns = extra + testlog.sanity(None, name, ids, counts, "[timed out after" in text)
    print(f"{len(ids)} failing  runner={name}  counts={counts}")
    for i in ids:
        print(i)
    for w in warns:
        print(f"WARNING: {w}")
    sys.exit(3 if warns else 0)


def read_ids(path):
    with open(path, encoding="utf-8") as fh:
        return {line.rstrip("\n") for line in fh if line.strip()}


def cmd_diff(a):
    before, after = read_ids(a.before), read_ids(a.after)
    new, fixed = sorted(after - before), sorted(before - after)
    print(f"{len(new)} new failures, {len(fixed)} fixed, {len(before & after)} still failing")
    for i in new:
        print(f"NEW    {i}")
    for i in fixed:
        print(f"FIXED  {i}")
    sys.exit(1 if new else 0)


def main():
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = p.add_subparsers(dest="cmd", required=True)
    for name in ("run", "parse"):
        s = sub.add_parser(name)
        s.add_argument("--runner", default="auto", choices=["auto", *testlog.PARSERS])
        s.add_argument("--pattern", help="regex; group 1 is a failing test ID (for a runner with no parser)")
        s.add_argument("--junit", help="glob of JUnit XML files, as given (use an absolute path in W)")
    r = sub.choices["run"]
    r.add_argument("--repo", required=True)
    r.add_argument("--out", required=True, help="path prefix outside the repo, e.g. W/baseline")
    r.add_argument("--env", action="append", default=[], metavar="KEY=VALUE")
    r.add_argument("--timeout", type=int, default=3600)
    r.add_argument("command", nargs=argparse.REMAINDER)
    sub.choices["parse"].add_argument("log")
    d = sub.add_parser("diff")
    d.add_argument("before")
    d.add_argument("after")
    a = p.parse_args()
    if a.cmd == "run" and a.command and a.command[0] == "--":
        a.command = a.command[1:]
    {"run": cmd_run, "parse": cmd_parse, "diff": cmd_diff}[a.cmd](a)


if __name__ == "__main__":
    main()
