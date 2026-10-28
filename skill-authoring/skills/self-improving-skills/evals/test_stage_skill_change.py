"""Offline test of scripts/stage_skill_change.py (no network, no GPU). Run: python evals/test_stage_skill_change.py

*(2026-10-17, the idea-sets session: a change to a canonical skill was staged, tested, diffed and applied by hand five times.)*

What it pins, each with a negative control:
  * `stage` copies the bytes of a skill (CRLF stays CRLF), leaves out __pycache__ and the --skip patterns, and links a `--with` sibling so a test that reads `../other` finds the real sibling;
  * `diff` shows an edited file and a new file; `test` runs a command in the staged skill and returns its exit code (a failing command fails);
  * `apply` copies the changed files, puts the originals in the backup folder, and keeps CRLF;
  * REFUSES (exit 2, nothing written) when a real file changed after staging, and when a new staged file now exists for real; `--force` overrides;
  * a deleted staged file is never deleted for real;
  * `clean` removes a stage that holds a read-only file and does NOT touch the linked sibling skill.
"""
import os
import stat
import subprocess
import sys
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
SK = os.path.dirname(HERE)
SCRIPT = os.path.join(SK, "scripts", "stage_skill_change.py")
FAILS = []


def check(label, got, want):
    if got != want:
        FAILS.append(f"{label}: got {got!r}, want {want!r}")


def run(root, *args):
    r = subprocess.run([sys.executable, SCRIPT, "--skills-root", root, *args], capture_output=True, text=True)
    return r.returncode, r.stdout + r.stderr


def write(path, data):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    open(path, "wb").write(data)


def read(path):
    return open(path, "rb").read()


def stage_path(out):
    for line in out.splitlines():
        if line.startswith("STAGE "):
            return line[6:].strip()
    return ""


with tempfile.TemporaryDirectory() as tmp:
    root = os.path.join(tmp, "skills")
    write(os.path.join(root, "alpha", "SKILL.md"), b"line one\r\nline two\r\n")
    write(os.path.join(root, "alpha", "ref", "a.md"), b"alpha ref\n")
    write(os.path.join(root, "alpha", "__pycache__", "x.pyc"), b"junk")
    write(os.path.join(root, "alpha", "tests", "fixture.txt"), b"fixture")
    write(os.path.join(root, "beta", "data.txt"), b"beta data")
    # a test inside alpha that reads its sibling the way the real skills do
    write(os.path.join(root, "alpha", "check_sibling.py"), b"import os, sys\nsys.exit(0 if open(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'beta', 'data.txt')).read() == 'beta data' else 1)\n")

    rc, out = run(root, "stage", "alpha", "--with", "beta", "--skip", "tests", "--stage-dir", os.path.join(tmp, "st1"))
    st = stage_path(out)
    check("stage exits 0", rc, 0)
    sd = os.path.join(st, "skills", "alpha")
    check("the bytes are copied (CRLF stays CRLF)", read(os.path.join(sd, "SKILL.md")), b"line one\r\nline two\r\n")
    check("__pycache__ is left out", os.path.exists(os.path.join(sd, "__pycache__")), False)
    check("--skip tests is left out", os.path.exists(os.path.join(sd, "tests")), False)
    rc, out = run(root, "test", st, "--", sys.executable, "check_sibling.py")
    check("a staged test finds the linked real sibling at ../beta", rc, 0)
    rc, out = run(root, "test", st, "--", sys.executable, "-c", "import sys; sys.exit(3)")
    check("negative control: a failing command returns its exit code", rc, 3)
    rc, out = run(root, "stage", "alpha", "--stage-dir", os.path.join(tmp, "st1"))
    check("negative control: staging into an existing folder is refused", rc != 0, True)

    # edit one file, add one, delete one
    write(os.path.join(sd, "SKILL.md"), b"line one\r\nline TWO changed\r\nline three\r\n")
    write(os.path.join(sd, "new.md"), b"brand new\n")
    os.remove(os.path.join(sd, "ref", "a.md"))
    diff_file = os.path.join(tmp, "x.diff")
    rc, out = run(root, "diff", st, "--out", diff_file)
    d = open(diff_file, encoding="utf-8").read()
    check("diff exits 0", rc, 0)
    check("diff shows the edit", "+line TWO changed" in d and "-line two" in d, True)
    check("diff shows the new file", "+brand new" in d, True)
    check("the deleted file is reported and left alone", "deleted in the stage and LEFT ALONE" in out and "ref/a.md" in out, True)

    # apply
    backup = os.path.join(tmp, "bk")
    rc, out = run(root, "apply", st, "--backup", backup)
    check("apply exits 0", rc, 0)
    check("the real file now holds the edit, with CRLF kept", read(os.path.join(root, "alpha", "SKILL.md")), b"line one\r\nline TWO changed\r\nline three\r\n")
    check("the new file exists for real", read(os.path.join(root, "alpha", "new.md")), b"brand new\n")
    check("the original is in the backup", read(os.path.join(backup, "alpha", "SKILL.md")), b"line one\r\nline two\r\n")
    check("the deleted staged file was NOT deleted for real", os.path.isfile(os.path.join(root, "alpha", "ref", "a.md")), True)

    # a second stage: someone changes the real file after staging
    rc, out = run(root, "stage", "alpha", "--stage-dir", os.path.join(tmp, "st2"))
    st2 = stage_path(out)
    sd2 = os.path.join(st2, "skills", "alpha")
    write(os.path.join(sd2, "SKILL.md"), b"my staged text\n")
    write(os.path.join(sd2, "ref", "a.md"), b"my staged ref\n")
    write(os.path.join(root, "alpha", "SKILL.md"), b"someone else edited this meanwhile\n")
    before_ref = read(os.path.join(root, "alpha", "ref", "a.md"))
    rc, out = run(root, "apply", st2)
    check("negative control: apply REFUSES (exit 2) when a real file changed since staging", rc, 2)
    check("... and names the file", "SKILL.md" in out, True)
    check("... and writes nothing, not even the file that did not conflict", (read(os.path.join(root, "alpha", "SKILL.md")), read(os.path.join(root, "alpha", "ref", "a.md"))), (b"someone else edited this meanwhile\n", before_ref))
    rc, out = run(root, "apply", st2, "--force")
    check("--force applies over the change", (rc, read(os.path.join(root, "alpha", "SKILL.md"))), (0, b"my staged text\n"))
    check("... and the other session's text is in the backup", read(os.path.join(st2, "backup", "alpha", "SKILL.md")), b"someone else edited this meanwhile\n")

    # a new staged file that now exists for real is a conflict too
    rc, out = run(root, "stage", "alpha", "--stage-dir", os.path.join(tmp, "st3"))
    st3 = stage_path(out)
    write(os.path.join(st3, "skills", "alpha", "fresh.md"), b"staged fresh\n")
    write(os.path.join(root, "alpha", "fresh.md"), b"real fresh\n")
    rc, out = run(root, "apply", st3)
    check("negative control: a new staged file that exists for real is refused", rc, 2)

    # clean: a read-only file inside, and the linked sibling must survive
    rc, out = run(root, "stage", "alpha", "--with", "beta", "--stage-dir", os.path.join(tmp, "st4"))
    st4 = stage_path(out)
    ro = os.path.join(st4, "skills", "alpha", "SKILL.md")
    os.chmod(ro, stat.S_IREAD)
    rc, out = run(root, "clean", st4)
    check("clean exits 0 even with a read-only file", rc, 0)
    check("clean removed the stage", os.path.exists(st4), False)
    check("negative control: clean never touched the linked real sibling", read(os.path.join(root, "beta", "data.txt")), b"beta data")

if FAILS:
    print("FAIL")
    for f in FAILS:
        print(" -", f)
    sys.exit(1)
print("ok: stage_skill_change.py (stage with a linked sibling, a failing command, an existing stage folder refused, diff of an edit and a new file, apply with backup and CRLF kept, a deleted staged file left alone, apply refused when the real file changed or a new file now exists, --force, clean with a read-only file that leaves the linked sibling alone)")
