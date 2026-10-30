"""Part 5 of the runbook, the knowledge-transfer session, built from the skill's question bank.

  python kt_bank.py list     [--bank BANK]
  python kt_bank.py skeleton [--bank BANK] [--out FILE]
  python kt_bank.py check    --runbook W/out/RUNBOOK.md [--bank BANK] [--min-tailored 0.5]

The bank is `references/kt-question-bank.md`, a copy the skill carries of the vault note Knowledge Transfer
Question Bank (without its link to the page version), so the skill runs from a plugin too; evals/test_portable.py
fails when the copy drifts from the note. The script finds it from its own folder; --bank overrides. A bank question is a bold
line `**A1 ★ "…"**` (★ = must-ask) under an area heading `### A. …`, followed by `- *Means:*`,
`- *Good answer:*` and `- *If vague, ask:*`.

`skeleton` prints a starting part 5: the bank's whole How to ask (opening, follow-up ladder, phrases for while you listen, "Instead of … ask …"
table, hard answers, closing, after the session; copied, so the runbook stands alone without the vault), then every must-ask question in session
order with TODO slots. Rewrite each question for this repo, add any other bank question the repo gives you a
fact for, and list each must-ask that does not apply as `Skipped: <ID> — <reason>`.

`check` reads part 5, from a heading `## 5.` to the next `## ` heading. Each question is a numbered item that
carries its bank id in brackets, `1. ★ [E2] "…"`, then a `Why:` line and a `Listen for:` line. A Why is
*tailored* when it names a file in backticks (the same test `factcheck.py cite` uses); otherwise write
`Why: generic: <why the repo has no fact for it>`. Exit 0 = part 5 has a How to ask section; every must-ask is
asked or skipped with a reason; every id is in the bank; every question has Why and Listen for and no TODO; and
at least --min-tailored of the questions are tailored. Exit 3 = one of those fails, each failure printed.
1 = refused (no bank); 2 = usage error. Run `factcheck.py cite` as well: it checks the named files and symbols.
"""
import argparse
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))   # works under python -I too
from factcheck import is_file  # noqa: E402

DEFAULT_BANK = os.path.join(os.path.dirname(os.path.abspath(__file__)), os.pardir, "references", "kt-question-bank.md")
SESSIONS = [("The business", "AB"), ("How it works", "CDE"), ("The code", "K"), ("Where it runs", "FGH"),
            ("Speed and running it", "IJ"), ("AI parts and taking over", "ML")]
HOW_TO_ASK = ("Opening the session", "The follow-up ladder", "While you listen", "Instead of",
              "When an answer is hard to use", "Closing", "After the session")

QUESTION = re.compile(r'^\*\*([A-Z]\d+)( ★)? "(.*?)"\*\*', re.M | re.S)
AREA = re.compile(r"^### ([A-Z])\. (.+)$", re.M)
FIELD = r"^- \*{label}:\* (.*?)(?=\n- \*|\n\n|\Z)"
ITEM = re.compile(r"^\s*\d+\.\s+(★\s+)?\[([A-Z]\d+)\]")
SKIP = re.compile(r"^\s*[-*]?\s*Skipped:\s*([A-Z]\d+)\b\s*[—–:-]*\s*(.*)$", re.I)
WHY = re.compile(r"^[\s>*-]*why:\**\s*(.*)$", re.I)
LISTEN = re.compile(r"^[\s>*-]*listen for:\**\s*(.*)$", re.I)
SPAN = re.compile(r"`([^`\n]+)`")


def flat(text):
    return " ".join(text.split())


def read_bank(path):
    if not os.path.isfile(path):
        sys.exit(f"refused: no question bank at {os.path.normpath(path)} (pass --bank)")
    with open(path, encoding="utf-8") as fh:
        text = fh.read()
    body = text.split("## The questions", 1)[-1]
    areas = {m.group(1): m.group(2).strip() for m in AREA.finditer(body)}
    found = list(QUESTION.finditer(body))
    questions = []
    for i, m in enumerate(found):
        end = found[i + 1].start() if i + 1 < len(found) else len(body)
        block = body[m.end():end].split("\n### ", 1)[0].split("\n## ", 1)[0]
        field = {}
        for key, label in (("means", "Means"), ("good", "Good answer"), ("vague", "If vague, ask")):
            f = re.search(FIELD.format(label=re.escape(label)), block, re.M | re.S)
            field[key] = flat(f.group(1)) if f else ""
        questions.append({"id": m.group(1), "star": bool(m.group(2)), "text": flat(m.group(3)),
                          "area": m.group(1)[0], **field})
    return text, areas, questions


def section(text, title):
    """A `### <title>…` section of the bank, up to the next heading of level 2 or 3."""
    m = re.search(r"^### " + re.escape(title) + r".*?$\n(.*?)(?=^#{2,3} |\Z)", text, re.M | re.S)
    return m and (m.group(0).split("\n", 1)[0].lstrip("# ").strip(), m.group(1).strip())


def cmd_list(a):
    _, areas, qs = read_bank(a.bank)
    print(f"bank: {os.path.normpath(a.bank)}")
    print(f"{len(qs)} questions, {sum(q['star'] for q in qs)} must-ask (★)")
    for letter, name in areas.items():
        print(f"\n{letter}. {name}")
        for q in (q for q in qs if q["area"] == letter):
            print(f"  {q['id']} {'★' if q['star'] else ' '} {q['text']}")


def cmd_skeleton(a):
    text, areas, qs = read_bank(a.bank)
    must = [q for q in qs if q["star"]]
    out = ["## 5. Knowledge-transfer session", "",
           f"Built from the Knowledge Transfer Question Bank ({len(qs)} questions, {len(must)} must-ask). Each "
           "question carries its bank id; each says why it matters in this repo and what a good answer contains.",
           "", "### How to ask", ""]
    for title in HOW_TO_ASK:
        found = section(text, title)
        if found:
            out += [f"#### {found[0]}", "", found[1], ""]
    n = 0
    placed = set()
    for i, (name, letters) in enumerate(SESSIONS):
        if i == len(SESSIONS) - 1:   # an area the bank adds later lands in the last session
            letters += "".join(sorted(set(areas) - set("".join(s for _, s in SESSIONS))))
        group = [q for q in must if q["area"] in letters]
        if not group:
            continue
        names = ", ".join(f"{l}. {areas[l]}" for l in letters if l in areas)
        out += [f"### Session {i + 1} — {name} ({names})", ""]
        for q in group:
            n += 1
            placed.add(q["id"])
            out += [f'{n}. ★ [{q["id"]}] "{q["text"]}"',
                    "   Why: TODO: a fact from this repo with its file and symbol, or \"generic: <why the repo has none>\".",
                    f"   Listen for: TODO (bank sample: {q['good']})", ""]
    out += ["Skipped: (none yet. List each must-ask that does not apply as `Skipped: <ID> — <reason>`.)", ""]
    page = "\n".join(out)
    if a.out:
        with open(a.out, "w", encoding="utf-8", newline="\n") as fh:
            fh.write(page)
        print(f"wrote {a.out}: {n} must-ask questions in {len(SESSIONS)} sessions")
    else:
        print(page)


def items_of(part5):
    """[(id, star, block lines)] for each numbered question in part 5, and [(id, reason)] for each skip."""
    items, skips, cur = [], [], None
    for line in part5.splitlines():
        m = ITEM.match(line)
        s = SKIP.match(line)
        if m:
            cur = (m.group(2), bool(m.group(1)), [line])
            items.append(cur)
        elif s:
            skips.append((s.group(1).upper(), s.group(2).strip()))
            cur = None
        elif line.startswith("#"):
            cur = None
        elif cur is not None:
            cur[2].append(line)
    return items, skips


def cmd_check(a):
    _, _, qs = read_bank(a.bank)
    bank_ids = {q["id"] for q in qs}
    must = [q["id"] for q in qs if q["star"]]
    with open(a.runbook, encoding="utf-8") as fh:
        text = fh.read()
    m = re.search(r"^## 5\.[^\n]*\n(.*?)(?=^## |\Z)", text, re.M | re.S)
    if not m:
        print("FAIL: no part 5 (a heading starting '## 5.') in the runbook")
        sys.exit(3)
    part5 = m.group(1)
    problems = []
    if not re.search(r"^#{3,4} How to ask", part5, re.M):
        problems.append("no 'How to ask' section in part 5")
    items, skips = items_of(part5)
    tailored = 0
    for qid, _, lines in items:
        if qid not in bank_ids:
            problems.append(f"UNKNOWN id {qid}: not in the bank")
        why_at = next((i for i, l in enumerate(lines) if WHY.match(l)), None)
        listen_at = next((i for i, l in enumerate(lines) if LISTEN.match(l)), None)
        if why_at is None:
            problems.append(f"{qid}: no 'Why:'")
        if listen_at is None:
            problems.append(f"{qid}: no 'Listen for:'")
        if any("TODO" in l for l in lines):
            problems.append(f"{qid}: TODO left")
        if why_at is not None:
            why = " ".join(lines[why_at:listen_at if listen_at and listen_at > why_at else len(lines)])
            if any(is_file(s) for s in SPAN.findall(why)):
                tailored += 1
    skipped = set()
    for qid, reason in skips:
        if qid not in bank_ids:
            problems.append(f"UNKNOWN id {qid}: skipped but not in the bank")
        elif len(reason.split()) < 3:
            problems.append(f"{qid} skipped with no reason (write `Skipped: {qid} — <why it does not apply>`)")
        else:
            skipped.add(qid)
    asked = {qid for qid, _, _ in items}
    for qid in must:
        if qid not in asked and qid not in skipped:
            problems.append(f"MISSING must-ask {qid} (ask it, or `Skipped: {qid} — <reason>`)")
    covered = sum(1 for q in must if q in asked or q in skipped)
    n = len(items)
    print(f"part 5: {n} questions, must-ask {covered}/{len(must)} ({len(skipped & set(must))} skipped), "
          f"tailored {tailored} of {n}")
    if n == 0 or tailored < a.min_tailored * n:
        problems.append(f"tailored {tailored} of {n}: below {a.min_tailored:.0%}. Ground more questions in a file "
                        "and symbol from this repo")
    for p in problems:
        print("FAIL:", p)
    sys.exit(3 if problems else 0)


def main():
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)
    for name in ("list", "skeleton", "check"):
        p = sub.add_parser(name)
        p.add_argument("--bank", default=DEFAULT_BANK)
        if name == "skeleton":
            p.add_argument("--out")
        if name == "check":
            p.add_argument("--runbook", required=True)
            p.add_argument("--min-tailored", type=float, default=0.5)
    a = ap.parse_args()
    {"list": cmd_list, "skeleton": cmd_skeleton, "check": cmd_check}[a.cmd](a)


if __name__ == "__main__":
    main()
