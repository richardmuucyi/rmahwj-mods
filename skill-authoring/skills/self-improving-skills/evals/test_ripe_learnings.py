#!/usr/bin/env python3
"""Regression test for ripe_learnings.py — the promotion-latency sweep.

Frozen fixture, pinned "today" = 2026-07-26, so ages never drift.
Run:  python3 test_ripe_learnings.py        (stdlib only; exit 0 = pass)
"""

import json
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

HERE = Path(__file__).resolve().parent
SCRIPT = HERE.parent / "scripts" / "ripe_learnings.py"
DATE = "2026-07-26"

FAILS, TOTAL = [], 0


def check(label, cond, detail=""):
    global TOTAL
    TOTAL += 1
    if cond:
        print(f"  ok  {label}")
    else:
        FAILS.append(label)
        print(f"FAIL  {label}  {detail}")


def w(p: Path, text: str):
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(text, encoding="utf-8")


def run(root, *extra, flag="--root", script=SCRIPT):
    root_args = [flag, str(root)] if flag else []
    r = subprocess.run([sys.executable, str(script), *root_args, "--date", DATE, *extra],
                       capture_output=True, text=True, encoding="utf-8", errors="replace")
    return r.returncode, r.stdout, r.stderr


tmp = Path(tempfile.mkdtemp(prefix="ripe-"))
try:
    sk = tmp / ".claude" / "skills"  # the root is found by .claude/skills alone; nothing else is needed

    # alpha: one ripe (old + corroborated + unpromoted), one hunch, one fresh
    w(sk / "alpha/learnings/0001-old-corroborated.md",
      "# 0001 — an old finding (2026-05-01)\n\n- **What:** thing.\n- **Confidence:** corroborated\n")
    w(sk / "alpha/learnings/0002-old-hunch.md",
      "# 0002 — a hunch (2026-05-01)\n\n- **Confidence:** hunch\n")
    w(sk / "alpha/learnings/0003-recent.md",
      "# 0003 — recent (2026-07-20)\n\n- **Confidence:** mechanical-fact\n")
    w(sk / "alpha/_self-improve-log.md", "# log\n")

    # beta: promoted long ago but multi-finding → partial risk; plus a bare `promoted:`
    w(sk / "beta/learnings/0001-multi.md",
      "# 0001 — three findings (2026-05-01)\n\n- **What:** several things:\n"
      "  1. first thing\n  2. second thing\n  3. third thing\n- **Confidence:** corroborated\n")
    w(sk / "beta/_self-improve-log.md",
      "- **2026-05-10** — promoted 0001: the headline one. Gates: all✓.\n"
      "- **2026-05-11** — promoted: a change with no learning id.\n")

    # gamma: promoted THIS WEEK and multi-finding → suppressed as fresh
    w(sk / "gamma/learnings/0001-just-done.md",
      "# 0001 — fresh multi (2026-05-01)\n\n  1. a\n  2. b\n- **Confidence:** corroborated\n")
    w(sk / "gamma/_self-improve-log.md", f"- **{DATE}** — promoted 0001: done today.\n")

    # delta: no confidence line → untriageable; and no log file at all
    w(sk / "delta/learnings/0001-no-confidence.md", "# 0001 — undocumented (2026-05-01)\n\nprose\n")

    # epsilon: off-enum grade, and an undated ripe-eligible entry
    w(sk / "epsilon/learnings/0001-strong.md",
      "# 0001 — strong grade (2026-05-01)\n\n- **Confidence:** strong on this source class\n")
    w(sk / "epsilon/learnings/0002-undated.md", "# 0002 — no date in title\n\n- **Confidence:** corroborated\n")
    w(sk / "epsilon/_self-improve-log.md", "# log\n")

    rc, out, err = run(tmp, "--json")
    check("exits 0", rc == 0, err[:200])
    res = json.loads(out)

    ripe = {(r["skill"], r["id"]) for r in res["ripe"]}
    check("ripe: old + corroborated + unpromoted is flagged", ("alpha", "0001") in ripe, str(ripe))
    check("ripe: a hunch is never flagged", ("alpha", "0002") not in ripe, str(ripe))
    check("ripe: a recent entry is under the 30d threshold", ("alpha", "0003") not in ripe, str(ripe))
    check("ripe: off-enum grade ('strong') still counts as ripe-eligible",
          ("epsilon", "0001") in ripe, str(ripe))
    check("ripe: sorted oldest-first", res["ripe"][0]["age_days"] >= res["ripe"][-1]["age_days"])

    partial = {(r["skill"], r["id"]) for r in res["partial_risk"]}
    check("partial: promoted-but-multi-finding is flagged", ("beta", "0001") in partial, str(partial))
    check("partial: promoted entry is NOT also in ripe", ("beta", "0001") not in ripe, str(ripe))
    check("partial: promoted within 7 days is suppressed as fresh",
          ("gamma", "0001") not in partial, str(partial))

    check("untriageable: no-confidence entry is reported",
          any(r["skill"] == "delta" for r in res["untriageable"]), str(res["untriageable"]))
    check("undated: dateless entry is reported, not silently dropped",
          any(r["id"] == "0002" for r in res["undated"]), str(res["undated"]))
    check("no-log: skill with learnings and no log file is reported",
          any(s["skill"] == "delta" for s in res["skills_without_log"]),
          str(res["skills_without_log"]))
    check("untraceable: bare `promoted:` entry is counted",
          any(s["skill"] == "beta" for s in res["untraceable_promotions"]),
          str(res["untraceable_promotions"]))
    check("scanned count covers every learning file", res["scanned"] == 8, res["scanned"])

    rc, out, err = run(tmp)
    check("text render exits 0 and names the ripe table", rc == 0 and "Ripe for promotion" in out)
    check("text render surfaces the partial-promotion warning", "Partial-promotion risk" in out)

    rc, out, err = run(tmp, "--days", "0")
    res0 = json.loads(run(tmp, "--days", "0", "--json")[1])
    check("--days 0 makes every unpromoted graded entry ripe",
          any(r["id"] == "0003" for r in res0["ripe"]), str(res0["ripe"]))

    rc, out, err = run(tmp, "--date", "nonsense")
    check("garbage --date → clean exit 2", rc == 2 and "invalid date" in err, f"rc={rc}")
    check("no traceback leaked", "Traceback" not in err)

    rc, out, err = run(tmp / "nowhere")
    check("a root without .claude/skills → exit 1 with a hint", rc == 1 and "--root" in err, f"rc={rc}")

    rc, out, err = run(tmp, "--json", flag="--vault-root")
    check("--vault-root still works as an older name for --root",
          rc == 0 and json.loads(out)["scanned"] == 8, f"rc={rc} {err[:120]}")

    # No flag: the script must find the fixture root by walking up from where it sits.
    # A copy inside the fixture's own skills finds the fixture, not the real library.
    inner = sk / "self-improving-skills" / "scripts" / "ripe_learnings.py"
    inner.parent.mkdir(parents=True)
    shutil.copyfile(SCRIPT, inner)
    rc, out, err = run(None, "--json", flag=None, script=inner)
    found = json.loads(out) if rc == 0 else {}
    check("no flag: the root is the nearest folder above the script that holds .claude/skills",
          rc == 0 and found.get("scanned") == 8, f"rc={rc} scanned={found.get('scanned')} {err[:120]}")

    # Installed as a plugin, the script sits deep in the plugin cache under the home folder:
    # <home>/.claude/plugins/cache/<market>/<plugin>/<version>/skills/<skill>/scripts/. A fixed
    # depth lands inside the cache; walking up must reach <home>, which holds .claude/skills.
    plugin = (tmp / ".claude" / "plugins" / "cache" / "market" / "skill-authoring" / "0.3.0"
              / "skills" / "self-improving-skills" / "scripts" / "ripe_learnings.py")
    plugin.parent.mkdir(parents=True)
    shutil.copyfile(SCRIPT, plugin)
    rc, out, err = run(None, "--json", flag=None, script=plugin)
    found = json.loads(out) if rc == 0 else {}
    check("no flag, plugin-cache layout: walks up to the home folder's .claude/skills",
          rc == 0 and found.get("scanned") == 8, f"rc={rc} scanned={found.get('scanned')} {err[:120]}")
finally:
    shutil.rmtree(tmp, ignore_errors=True)

print(f"\n{'PASS' if not FAILS else 'FAIL'} — {TOTAL - len(FAILS)}/{TOTAL} checks"
      + (f"; failed: {FAILS}" if FAILS else ""))
sys.exit(1 if FAILS else 0)
