#!/usr/bin/env python3
"""ripe_learnings.py — promotion-latency sweep for the governed self-improvement loop.

WHY THIS EXISTS
The loop's rule is "capture is free; promotion is gated". Capture works — more than a
hundred learnings across a dozen skills. But nothing ever *pulls* a ripe finding through the
gates, so promotion only happens when something breaks. Worked example: one skill's
learnings/0003 item 2 recorded a template drift on 2026-06-10, marked `corroborated`, and sat
unpromoted for six weeks until it caused a real incident on 2026-07-25. This sweep turns
"we got lucky someone noticed" into a queue.

SCRIPT FINDS, MODEL JUDGES (write-path contract). This script never edits a skill and
never decides that something *should* be promoted — ripeness is an age + confidence
filter, nothing more. Whether a finding still deserves promotion is a judgment call that
stays with the reviewing model and the user.

THE PARTIAL-PROMOTION TRAP (the specific thing that bit us)
Promotion is logged per learning FILE (`promoted 0003: ...`) but findings are recorded
per ITEM — 0003 held three numbered findings and only some were promoted. The log said
"promoted 0003", which made the file look fully handled and masked item 2 for six weeks.
So a promoted-but-multi-finding learning is reported as `partial-risk`, not as done.

ROOT: the folder that holds `.claude/skills`. By default the script walks up from its own
location and takes the first such folder: the project when it sits in a project's skills, your
home folder when it is installed as a plugin. `--root` names another one.

Usage:
  python3 ripe_learnings.py [--days N] [--root PATH] [--date YYYY-MM-DD] [--json]
"""

from __future__ import annotations

import argparse
import datetime as dt
import json
import re
import sys
from pathlib import Path

RIPE_CONFIDENCE = {"corroborated", "mechanical-fact", "strong", "mechanical"}
CONTRACT_ENUM = {"hunch", "corroborated", "mechanical-fact"}
DEFAULT_DAYS = 30

CONF_RE = re.compile(r"^\s*[-*]?\s*\*\*Confidence:?\*\*:?\s*(.+)$", re.MULTILINE | re.IGNORECASE)
TITLE_DATE_RE = re.compile(r"\((\d{4}-\d{2}-\d{2})\)")
ANY_DATE_RE = re.compile(r"\b(\d{4}-\d{2}-\d{2})\b")
FINDING_RE = re.compile(r"^\s+\d+\.\s+\S", re.MULTILINE)
PROMOTED_ID_RE = re.compile(r"promoted\s+(\d{3,4})")
# `- **YYYY-MM-DD** — promoted NNNN` / `- YYYY-MM-DD — promoted NNNN` (both forms in use)
PROMOTED_DATED_RE = re.compile(r"^-\s*\*{0,2}(\d{4}-\d{2}-\d{2})\*{0,2}\s*[—-]\s*promoted\s+\*{0,2}(\d{3,4})",
                               re.MULTILINE)
# A promotion line names its learning in several shapes that the two patterns above
# cannot both cover: `promoted **0001**`, `promoted **learning 0023**`,
# `promoted **0025**, **0026**, **0028**`, `the actionable half of **0013**`.
# Requiring the id to sit immediately after the word "promoted" missed every bolded
# form -- and the bolded form is what the busiest log in the library actually uses,
# so four already-promoted entries were being reported as ripe. *(fixed 2026-09-21)*
#
# Extract every 3-4 digit token on a line that mentions a promotion, then keep only
# those that name a learning file that exists. Validating against the filenames is
# what makes the wide net safe: a stray year or count cannot be mistaken for an id.
PROMOTED_LINE_RE = re.compile(r"^.*\bpromoted\b.*$", re.MULTILINE | re.IGNORECASE)
ID_TOKEN_RE = re.compile(r"\b(\d{3,4})\b")


def promoted_ids_from(log_text, known_ids):
    """Learning ids a log records as promoted, in any of the shapes in use.

    Truncates each line at its first negation. Log entries routinely name ids on
    BOTH sides of one -- `promoted **0020 (part B only)** ... Not promoted: 0020
    part A`, or a tail listing `Remaining unpromoted: 0005, 0006, 0008, ...`. A
    naive scan of the whole line harvests the negated ids too and marks genuinely
    unpromoted learnings as done, which hides them from the queue: strictly worse
    than the narrow-match bug this replaced. Every real entry names the promoted
    id BEFORE its negation, so truncating there keeps the signal and drops the
    trap. *(2026-09-21 -- caught because a learning listed as "remaining
    unpromoted" showed up as promoted.)*
    """
    found = set()
    for line in PROMOTED_LINE_RE.findall(log_text):
        if line.lstrip().startswith("<!--"):
            continue  # the commented-out template line in a fresh log
        neg = NEGATED_PROMOTION_RE.search(line)
        head = line[:neg.start()] if neg else line
        low = head.lower()
        if "promoted" not in low:
            continue  # the only mention of promotion on this line was the negated one
        # Scope to the promotion CLAUSE, not the whole entry. The body of an entry
        # routinely cross-references other learnings -- the entry promoting 0013
        # mentions 0014 in its prose -- and counting those marks them promoted.
        # The clause runs from the word "promoted" to the colon that ends the
        # header, which covers every shape in use: `promoted **0001**:`,
        # `promoted **0020 (part B only)**:`, `promoted **0025**, **0026**, and
        # fixed ...`, `promoted the actionable half of **0013**:`.
        start = low.index("promoted")
        colon = head.find(":", start)
        clause = head[start:colon if colon != -1 else min(len(head), start + 200)]
        for tok in ID_TOKEN_RE.findall(clause):
            k = tok.lstrip("0") or "0"
            if k in known_ids:
                found.add(k)
    return found


def _selftest_promoted_ids():
    """Every shape observed in the library's real logs, plus the two traps."""
    known = {str(i) for i in range(1, 100)}
    cases = [
        ("- **2026-06-26** — promoted **0001**: added a validator.", {"1"}),
        ("- 2026-09-21 — promoted 0091: added two sections.", {"91"}),
        ("- **2026-08-10** — promoted **0020 (part B only)**: added components.", {"20"}),
        ("- **2026-09-04** — promoted **0025**, **0026**, **0028**, and fixed the detector.",
         {"25", "26", "28"}),
        ("- **2026-08-10** — promoted the actionable half of **0013**: SKILL.md cut, see 0014.",
         {"13"}),                                    # 0014 is a cross-reference, not a promotion
        ("- **2026-08-09** — promoted **0008**: added a mode, closing 0009 partially.", {"8"}),
        ("- **2026-08-09** — loop restarted. Remaining unpromoted: 0005, 0006, 0008.", set()),
        ("- **2026-08-24** — promoted 0036 + measurements. Not promoted: 0037.", {"36"}),
        ("<!-- - YYYY-MM-DD — promoted NNNN: template -->", set()),
    ]
    bad = 0
    for text, want in cases:
        got = promoted_ids_from(text, known)
        ok = got == want
        bad += not ok
        print(f"  {'ok ' if ok else 'FAIL'} {text[:64]:<66} -> {sorted(got)} want {sorted(want)}")
    print("promoted-id selftest:", "PASS" if not bad else f"FAIL ({bad})")
    return bad == 0
FRESH_PROMOTION_DAYS = 7  # a just-promoted entry isn't a partial-promotion risk yet
PROMOTED_BARE_RE = re.compile(r"promoted:")
# A promotion line with no learning id is only a hole in the trail if it OUGHT to
# have one. Two things were being miscounted as holes *(fixed 2026-09-21)*:
#
#   1. Negations. `unpromoted:` and `**not** promoted:` both contain the literal
#      `promoted:`, so a line saying what was DELIBERATELY not promoted was read
#      as a sloppy promotion record.
#   2. Promotions that never came from a capture. A change driven by a design
#      spec, a user request, an eval flow or a production bug is a legitimate
#      promotion with no learning id to cite. Treating those as holes trains the
#      reader to ignore the bucket.
#
# So: skip negations, skip lines that name a known learning id anywhere, and
# accept an explicit `(no learning — <source>)` marker as a complete trail.
NEGATED_PROMOTION_RE = re.compile(r"un\s*promoted|not\s*\*{0,2}\s*promoted", re.I)
# The partial-risk bucket exists because promotion is logged per FILE while
# findings are captured per ITEM, so a "promoted 0003" line cannot say whether
# item 2 landed. Nothing could ever clear it -- re-logging only snoozes it for
# the freshness window. An explicit per-item audit is the missing vocabulary:
#
#   - **YYYY-MM-DD** — audited 0003: items 1-3 all landed (<where>). | item 2 open: <why>
#
# A learning with an audit record leaves the bucket; one whose audit records an
# open item stays, which is the state worth surfacing. *(added 2026-09-21)*
AUDITED_RE = re.compile(r"\baudited\s+\*{0,2}(\d{3,4})", re.I)
# Deliberately generous about how "still open" is phrased. A narrow pattern here
# fails in the one direction that matters: an audit recording an unfinished item
# would clear the entry anyway, which is exactly the silent-completion failure the
# bucket was built to catch. Caught immediately -- two of the first sixteen audit
# lines said "items open" and "not verified" and slipped through a stricter form.
AUDIT_OPEN_RE = re.compile(
    r"\bitems?\s+(?:\d+(?:\s*[-,and]+\s*\d+)*\s+)?open\b"
    r"|\bstill\s+(?:captured-only|open|unpromoted)\b"
    r"|\bnot\s+verified\b"
    r"|\bpartially\s+promoted\b", re.I)
NO_LEARNING_MARKER_RE = re.compile(r"\(no learning\s*[—-]", re.I)


def untraceable_lines(log_text, known_ids):
    """Promotion records that cite neither a learning nor an explicit other source."""
    out = []
    for line in log_text.splitlines():
        s = line.strip()
        if not s.startswith("-") or not PROMOTED_BARE_RE.search(s):
            continue
        if NEGATED_PROMOTION_RE.search(s) or NO_LEARNING_MARKER_RE.search(s):
            continue
        if any((t.lstrip("0") or "0") in known_ids for t in ID_TOKEN_RE.findall(s)):
            continue
        out.append(s)
    return out
INLINE_PROMOTED_RE = re.compile(r"PROMOTED\s+(\d{4}-\d{2}-\d{2})")
ID_RE = re.compile(r"^(\d{3,4})-(.*)\.md$")


def root_from_script() -> Path | None:
    """The nearest folder above this script that holds `.claude/skills`, or None."""
    here = Path(__file__).resolve()
    for p in here.parents:
        if (p / ".claude" / "skills").is_dir():
            return p
    return None


def norm_confidence(raw: str) -> str:
    """First token of the confidence value, lowercased. Entries write prose after it
    ('mechanical-fact for the X', 'strong on this source class') — the leading token is
    the grade; the rest is scope commentary."""
    tok = re.split(r"[ ,;(]", raw.strip().lower(), 1)[0]
    return tok.rstrip(".").strip("*_`")


def parse_learning(path: Path) -> dict:
    m = ID_RE.match(path.name)
    text = path.read_text(encoding="utf-8", errors="replace")
    head = "\n".join(text.splitlines()[:4])

    conf_m = CONF_RE.search(text)
    conf_raw = conf_m.group(1).strip() if conf_m else ""
    conf = norm_confidence(conf_raw) if conf_raw else ""

    date_m = TITLE_DATE_RE.search(head) or ANY_DATE_RE.search(head)
    return {
        "id": m.group(1) if m else None,
        "slug": m.group(2) if m else path.stem,
        "path": None,  # filled by caller (relative to root)
        "date": date_m.group(1) if date_m else None,
        "confidence": conf,
        "confidence_raw": conf_raw,
        "off_enum": bool(conf) and conf not in CONTRACT_ENUM,
        "findings": len(FINDING_RE.findall(text)),
        "self_marked_promoted": bool(INLINE_PROMOTED_RE.search(text)),
    }


def sweep(root: Path, today: dt.date, days: int) -> dict:
    skills_dir = root / ".claude" / "skills"
    ripe, partial, untriageable, no_log, undated = [], [], [], [], []
    untraceable = []
    scanned = 0

    for learn_dir in sorted(skills_dir.glob("*/learnings")):
        skill_dir = learn_dir.parent
        skill = skill_dir.name
        log_path = skill_dir / "_self-improve-log.md"
        log_text = log_path.read_text(encoding="utf-8", errors="replace") if log_path.exists() else ""
        files_for_ids = sorted(p for p in learn_dir.glob("*.md") if p.is_file())
        known_ids = {(parse_learning(p)["id"] or "").lstrip("0") or "0"
                     for p in files_for_ids}
        promoted_ids = ({i.lstrip("0") or "0" for i in PROMOTED_ID_RE.findall(log_text)}
                        | promoted_ids_from(log_text, known_ids))
        promoted_on: dict[str, str] = {}
        for d, i in PROMOTED_DATED_RE.findall(log_text):
            k = i.lstrip("0") or "0"
            promoted_on[k] = max(promoted_on.get(k, ""), d)
        bare_promotions = len(untraceable_lines(log_text, known_ids))
        audited_ids = {i.lstrip("0") or "0" for i in AUDITED_RE.findall(log_text)}
        audit_open_ids = {i.lstrip("0") or "0"
                          for line in log_text.splitlines() if AUDIT_OPEN_RE.search(line)
                          for i in AUDITED_RE.findall(line)}

        files = sorted(p for p in learn_dir.glob("*.md") if p.is_file())
        if files and not log_path.exists():
            no_log.append({"skill": skill, "learnings": len(files)})

        for p in files:
            scanned += 1
            rec = parse_learning(p)
            rec["skill"] = skill
            rec["path"] = str(p.relative_to(root)).replace("\\", "/")
            rid = (rec["id"] or "").lstrip("0") or "0"
            is_promoted = rid in promoted_ids or rec["self_marked_promoted"]

            if not rec["confidence"]:
                untriageable.append(rec)
                continue
            if rec["confidence"] not in RIPE_CONFIDENCE:
                continue  # hunch — stays in the inbox until it earns promotion
            if not rec["date"]:
                undated.append(rec)
                continue

            age = (today - dt.date.fromisoformat(rec["date"])).days
            rec["age_days"] = age
            if is_promoted:
                # Promoted files are only interesting if they enumerate several findings —
                # that is how 0003 item 2 hid behind a "promoted 0003" log line. Skip ones
                # promoted in the last week: they were just reviewed, so flagging them is noise.
                promo_date = promoted_on.get(rid)
                fresh = (promo_date is not None
                         and (today - dt.date.fromisoformat(promo_date)).days < FRESH_PROMOTION_DAYS)
                # An explicit per-item audit resolves the ambiguity the bucket
                # exists to flag, so it leaves — unless that audit itself records
                # an item still open, which is precisely the state worth keeping
                # visible.
                audited = rid in audited_ids
                if rec["findings"] >= 2 and not fresh and (not audited or rid in audit_open_ids):
                    rec["promoted_on"] = promo_date
                    rec["audit_open"] = rid in audit_open_ids
                    partial.append(rec)
                continue
            if age >= days:
                ripe.append(rec)

        if bare_promotions:
            # `promoted:` with no learning id — the log entry can't be traced back to a
            # capture, so the audit trail has a hole even though a promotion happened.
            untraceable.append({"skill": skill, "entries": bare_promotions})

    ripe.sort(key=lambda r: -r["age_days"])
    partial.sort(key=lambda r: (r["skill"], r["id"] or ""))
    return {
        "today": today.isoformat(), "threshold_days": days, "scanned": scanned,
        "ripe": ripe, "partial_risk": partial, "untriageable": untriageable,
        "undated": undated, "skills_without_log": no_log,
        "untraceable_promotions": untraceable,
    }


def render(res: dict) -> str:
    out = [f"## Ripe learnings — {res['today']} (unpromoted ≥ {res['threshold_days']}d)",
           f"scanned {res['scanned']} learning file(s)"]

    if res["ripe"]:
        out.append(f"\n### Ripe for promotion ({len(res['ripe'])})")
        out.append("| Age | Skill | Learning | Confidence |")
        out.append("|--:|:--|:--|:--|")
        for r in res["ripe"]:
            out.append(f"| {r['age_days']}d | {r['skill']} | {r['id']}-{r['slug'][:44]} | {r['confidence']} |")
    else:
        out.append("\n### Ripe for promotion (0)\n*(nothing overdue — capture inbox is current)*")

    if res["partial_risk"]:
        out.append(f"\n### Partial-promotion risk ({len(res['partial_risk'])})")
        out.append("*Logged as promoted, but enumerates several findings — verify every item "
                   "made it, not just the headline one. This is how 0003 item 2 hid for six weeks.*")
        out.append("| Skill | Learning | Findings |")
        out.append("|:--|:--|--:|")
        for r in res["partial_risk"]:
            out.append(f"| {r['skill']} | {r['id']}-{r['slug'][:44]} | {r['findings']} |")

    if res["untriageable"]:
        out.append(f"\n### Untriageable — no `**Confidence:**` line ({len(res['untriageable'])})")
        by_skill: dict[str, int] = {}
        for r in res["untriageable"]:
            by_skill[r["skill"]] = by_skill.get(r["skill"], 0) + 1
        out.append(", ".join(f"{k} ×{v}" for k, v in sorted(by_skill.items())))
        out.append("*Can't be aged or graded — these are invisible to the sweep until they "
                   "carry a confidence grade (contract § Capture).*")

    if res["undated"]:
        out.append(f"\n### Undated ({len(res['undated'])})")
        out.append(", ".join(f"{r['skill']}/{r['id']}" for r in res["undated"]))

    if res["skills_without_log"]:
        out.append(f"\n### Skills with learnings but no `_self-improve-log.md` "
                   f"({len(res['skills_without_log'])})")
        for s in res["skills_without_log"]:
            out.append(f"- **{s['skill']}** — {s['learnings']} learning(s), nothing can be "
                       f"logged as promoted (contract § Log every promotion)")

    if res["untraceable_promotions"]:
        n = sum(s["entries"] for s in res["untraceable_promotions"])
        out.append(f"\n### Untraceable promotions ({n})")
        out.append(", ".join(f"{s['skill']} ×{s['entries']}" for s in res["untraceable_promotions"]))
        out.append("*Log says `promoted:` with no learning id — the change can't be traced "
                   "back to a capture, so the trail has a hole.*")

    off = [r for r in res["ripe"] + res["partial_risk"] if r.get("off_enum")]
    if off:
        out.append(f"\n*Note: {len(off)} entr(ies) use a confidence grade outside the contract "
                   f"enum (hunch | corroborated | mechanical-fact) — treated as ripe-eligible.*")
    return "\n".join(out)


def main() -> int:
    for stream in (sys.stdout, sys.stderr):
        if hasattr(stream, "reconfigure"):
            stream.reconfigure(encoding="utf-8", errors="replace")

    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--days", type=int, default=DEFAULT_DAYS,
                    help=f"age threshold in days (default {DEFAULT_DAYS})")
    ap.add_argument("--root", "--vault-root", dest="root", type=Path, default=None,
                    help="the folder that holds .claude/skills (default: the nearest one above "
                         "this script); --vault-root is an older name for it")
    ap.add_argument("--date", default=None, help="override 'today' (YYYY-MM-DD)")
    ap.add_argument("--json", action="store_true")
    args = ap.parse_args()

    root = args.root or root_from_script()
    if root is None or not (root / ".claude" / "skills").is_dir():
        where = root if root is not None else "no folder above this script"
        print(f"error: {where} has no .claude/skills — pass --root", file=sys.stderr)
        return 1
    try:
        today = dt.date.fromisoformat(args.date) if args.date else dt.date.today()
    except ValueError:
        print(f"error: invalid date {args.date!r} (expected YYYY-MM-DD)", file=sys.stderr)
        return 2

    res = sweep(root, today, max(0, args.days))
    print(json.dumps(res, ensure_ascii=False, indent=2) if args.json else render(res))
    return 0


if __name__ == "__main__":
    sys.exit(main())
