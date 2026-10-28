"""Stage a change to a skill in a scratch copy, test it there, diff it, and apply it only if nobody changed the same files in the meantime.

    python stage_skill_change.py stage SKILL [--with OTHER ...] [--skip PATTERN ...] [--stage-dir DIR]
    python stage_skill_change.py diff STAGE [--out FILE] [--context N]
    python stage_skill_change.py test STAGE -- COMMAND ARGS ...
    python stage_skill_change.py apply STAGE [--backup DIR] [--force]
    python stage_skill_change.py clean STAGE
    (all commands: --skills-root DIR when the skills are not next to this skill)

Why it exists *(2026-10-17, the idea-sets session)*: a change to a canonical skill goes propose, show the diff, wait, apply, test. Done by hand that meant a throwaway copy, a patch script, a path hack so the skill's own tests would run in the copy (they find their sibling skills with `SKILL/../other`), a diff, and a copy back that could silently overwrite an edit another session had made in between. Five times in one session. The helper does it once:

  stage   copies the skill into STAGE/skills/SKILL (bytes, nothing rewritten; __pycache__ and the --skip patterns left out) and links every `--with OTHER` skill (a junction on Windows, a symlink elsewhere) into STAGE/skills/OTHER, so a test that reads `../other` finds the REAL sibling unchanged (link every sibling the tests reach, directly or through another skill: idea-sets needs `--with krea2 --with comfy-shared`, because krea2 imports comfy-shared; a missing one shows as a ModuleNotFoundError). It records the sha256 of every real file it copied in STAGE/manifest.json. Edit the files under STAGE/skills/SKILL, with any tool.
  diff    unified diff of the staged files against the real ones (new files too); `--out` writes it. Line endings are kept: a CRLF file is diffed as CRLF.
  test    runs COMMAND in STAGE/skills/SKILL and returns its exit code, so the skill's own eval runs on the staged copy.
  apply   copies the changed staged files over the real skill, after copying each real file it replaces to the backup folder (default STAGE/backup). It REFUSES (exit 2, nothing written) when a real file differs from what was staged from, because someone else changed it: look at it, restage, or pass --force. Deleting a file is never done by this helper (a deleted staged file is reported and left alone).
  clean   removes the STAGE folder; the links are removed first, so the real sibling skills are never touched.

It never edits a skill by itself and never commits. Exit codes: 0 ok, 1 error, 2 refused (real files changed since staging).
"""
import argparse
import difflib
import fnmatch
import hashlib
import json
import os
import shutil
import stat
import subprocess
import sys
import tempfile
import time

HERE = os.path.dirname(os.path.abspath(__file__))
DEFAULT_ROOT = os.path.dirname(os.path.dirname(HERE))   # .../skills (this file is skills/self-improving-skills/scripts/x.py)
ALWAYS_SKIP = ["__pycache__", "*.pyc", ".pytest_cache"]


def sha(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def skipped(name, patterns):
    return any(fnmatch.fnmatch(name, p) for p in patterns)


def walk_files(root, patterns):
    """Relative paths (forward slashes) of every file under root, leaving out the skipped names."""
    out = []
    for dp, dn, fn in os.walk(root):
        dn[:] = [d for d in dn if not skipped(d, patterns)]
        for f in fn:
            if not skipped(f, patterns):
                out.append(os.path.relpath(os.path.join(dp, f), root).replace("\\", "/"))
    return sorted(out)


def link_dir(link, target):
    if os.name == "nt":
        r = subprocess.run(["cmd", "/c", "mklink", "/J", link, target], capture_output=True, text=True)
        if r.returncode != 0:
            raise SystemExit(f"could not link {link} -> {target}: {(r.stdout + r.stderr).strip()}")
    else:
        os.symlink(target, link, target_is_directory=True)


def is_link(path):
    if os.path.islink(path):
        return True
    if os.name == "nt" and os.path.isdir(path):
        try:
            return bool(os.lstat(path).st_file_attributes & stat.FILE_ATTRIBUTE_REPARSE_POINT)
        except (AttributeError, OSError):
            return False
    return False


def force_rmtree(path):
    """Remove a folder even when it holds read-only files; a link inside is removed, never followed."""
    if not os.path.exists(path):
        return
    for dp, dn, fn in os.walk(path):
        for d in list(dn):
            p = os.path.join(dp, d)
            if is_link(p):
                os.rmdir(p) if os.name == "nt" else os.unlink(p)
                dn.remove(d)

    def onerr(func, p, exc):
        os.chmod(p, stat.S_IWRITE)
        func(p)
    shutil.rmtree(path, onerror=onerr)


def manifest_of(stage):
    p = os.path.join(stage, "manifest.json")
    if not os.path.isfile(p):
        raise SystemExit(f"{stage} is not a stage folder (no manifest.json)")
    return json.load(open(p, encoding="utf-8"))


def cmd_stage(a):
    root = os.path.abspath(a.skills_root)
    real = os.path.join(root, a.skill)
    if not os.path.isdir(real):
        raise SystemExit(f"no skill folder {real}")
    stage = os.path.abspath(a.stage_dir or os.path.join(tempfile.gettempdir(), "skill-stage", f"{a.skill}-{time.strftime('%Y%m%d-%H%M%S')}"))
    if os.path.exists(stage):
        raise SystemExit(f"{stage} exists already: pick another --stage-dir or run `clean` first")
    patterns = ALWAYS_SKIP + list(a.skip)
    dest = os.path.join(stage, "skills", a.skill)
    baseline = {}
    for rel in walk_files(real, patterns):
        src = os.path.join(real, rel)
        dst = os.path.join(dest, rel)
        os.makedirs(os.path.dirname(dst), exist_ok=True)
        shutil.copyfile(src, dst)
        baseline[rel] = sha(src)
    for other in a.with_:
        t = os.path.join(root, other)
        if not os.path.isdir(t):
            raise SystemExit(f"--with {other}: no such skill folder {t}")
        link_dir(os.path.join(stage, "skills", other), t)
    json.dump({"skill": a.skill, "real": real, "skip": patterns, "with": a.with_, "baseline": baseline, "created": time.strftime("%Y-%m-%d %H:%M:%S")},
              open(os.path.join(stage, "manifest.json"), "w", encoding="utf-8"), indent=1)
    print(f"STAGE {stage}")
    print(f"edit the files under {dest}; {len(baseline)} files copied; linked: {', '.join(a.with_) or 'none'}")
    if a.skip:
        print(f"NOTE: --skip {', '.join(a.skip)} is left out of the copy, so a file you add or change under it is NOT diffed and NOT applied: copy those by hand and show them to the owner as a separate diff")
    return 0


def changes(stage):
    m = manifest_of(stage)
    sdir = os.path.join(stage, "skills", m["skill"])
    cur = walk_files(sdir, m["skip"])
    changed = [rel for rel in cur if rel not in m["baseline"] or sha(os.path.join(sdir, rel)) != m["baseline"][rel]]
    deleted = [rel for rel in m["baseline"] if rel not in cur]
    return m, sdir, changed, deleted


def read_text(path):
    if not os.path.isfile(path):
        return None
    return open(path, "rb").read().decode("utf-8", errors="replace")


def cmd_diff(a):
    m, sdir, changed, deleted = changes(a.stage)
    out = []
    for rel in changed:
        ta, tb = read_text(os.path.join(m["real"], rel)), read_text(os.path.join(sdir, rel))
        nl = "\r\n" if "\r\n" in (ta or tb) else "\n"
        out += list(difflib.unified_diff((ta or "").split(nl) if ta is not None else [], tb.split(nl), f"a/{m['skill']}/{rel}", f"b/{m['skill']}/{rel}", lineterm="", n=a.context))
    text = "\n".join(out) + "\n" if out else ""
    if a.out:
        open(a.out, "w", encoding="utf-8", newline="\n").write(text)
    else:
        sys.stdout.write(text)
    print(f"{len(changed)} file(s) changed, {sum(1 for l in out if l[:1] in '+-' and l[:3] not in ('+++', '---'))} diff line(s)" + (f"; deleted in the stage and LEFT ALONE: {deleted}" if deleted else ""), file=sys.stderr)
    return 0


def cmd_test(a):
    m = manifest_of(a.stage)
    cmd = a.command[1:] if a.command and a.command[0] == "--" else a.command
    if not cmd:
        raise SystemExit("test: give the command after `--`")
    env = dict(os.environ, SKILL_STAGE=a.stage, PYTHONDONTWRITEBYTECODE="1")
    r = subprocess.run(cmd, cwd=os.path.join(a.stage, "skills", m["skill"]), env=env)
    return r.returncode


def cmd_apply(a):
    m, sdir, changed, deleted = changes(a.stage)
    conflicts = []
    for rel in changed:
        real = os.path.join(m["real"], rel)
        if os.path.isfile(real) and rel in m["baseline"] and sha(real) != m["baseline"][rel]:
            conflicts.append(rel)
        elif os.path.isfile(real) and rel not in m["baseline"]:
            conflicts.append(rel)   # a new staged file that now exists for real: someone else made it
    if conflicts and not a.force:
        print("REFUSED: these real files changed since the stage was made (restage, merge by hand, or pass --force):", file=sys.stderr)
        for rel in conflicts:
            print("  " + rel, file=sys.stderr)
        return 2
    backup = os.path.abspath(a.backup or os.path.join(a.stage, "backup"))
    for rel in changed:
        real = os.path.join(m["real"], rel)
        if os.path.isfile(real):
            os.makedirs(os.path.dirname(os.path.join(backup, m["skill"], rel)), exist_ok=True)
            shutil.copyfile(real, os.path.join(backup, m["skill"], rel))
        os.makedirs(os.path.dirname(real), exist_ok=True)
        shutil.copyfile(os.path.join(sdir, rel), real)
    print(f"applied {len(changed)} file(s) to {m['real']}; originals in {backup}" + (f"; FORCED over {len(conflicts)} changed file(s)" if conflicts else ""))
    for rel in changed:
        print("  " + rel)
    if deleted:
        print(f"deleted in the stage and left alone: {deleted}")
    return 0


def cmd_clean(a):
    manifest_of(a.stage)
    force_rmtree(a.stage)
    print(f"removed {a.stage}")
    return 0


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--skills-root", default=DEFAULT_ROOT, help="the folder that holds the skills (default: the one this skill sits in)")
    sub = ap.add_subparsers(dest="cmd", required=True)
    s = sub.add_parser("stage")
    s.add_argument("skill")
    s.add_argument("--with", dest="with_", action="append", default=[], help="a sibling skill to link into the stage (repeatable)")
    s.add_argument("--skip", action="append", default=[], help="a file or folder name pattern to leave out of the copy (repeatable)")
    s.add_argument("--stage-dir", default="")
    d = sub.add_parser("diff")
    d.add_argument("stage")
    d.add_argument("--out", default="")
    d.add_argument("--context", type=int, default=1)
    t = sub.add_parser("test")
    t.add_argument("stage")
    t.add_argument("command", nargs=argparse.REMAINDER)
    p = sub.add_parser("apply")
    p.add_argument("stage")
    p.add_argument("--backup", default="")
    p.add_argument("--force", action="store_true")
    c = sub.add_parser("clean")
    c.add_argument("stage")
    a = ap.parse_args(argv)
    return {"stage": cmd_stage, "diff": cmd_diff, "test": cmd_test, "apply": cmd_apply, "clean": cmd_clean}[a.cmd](a)


if __name__ == "__main__":
    sys.exit(main())
