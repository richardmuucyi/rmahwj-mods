"""Regression fixture for both reviewers: fill a brief, and grade what the reviewer returns.

    python -I fixture.py fill  <template.md> seeded|clean        -> prints the filled truth brief
    python -I fixture.py grade <case> <reviewer-output>           -> PASS/FAIL per check, exit 0/1
        case: seeded | clean (truth reviewer) · visual-flag-crossed | visual-clean (visual reviewer)

seeded.mmd carries the three errors the first truth review caught (a conditional
clone claim, a citation to the wrong docs table, a missing PR-conflict case); clean.mmd is the
fixed file, which the second review passed. draft.png is the render where a lifeline split
`--cloud`, which the first visual review flagged CRITICAL; clean.png is the fixed render.
expected.json is the answer key; baseline/ holds the four real outputs, so `grade` can be checked
against known passes and a known fail (grade a clean output as `seeded`: it must fail).
"""
import json
import re
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
SKILL = HERE.parents[2]


def source_lines(text, tag):
    return [l.split(":", 1)[1].strip() for l in text.splitlines() if l.startswith(f"%% {tag}:")]


PNG = {"seeded": "render-1.png", "clean": "render-2.png",
       "visual-flag-crossed": "draft.png", "visual-clean": "render-2.png"}


def fill(template, variant):
    inputs = json.loads((HERE / "inputs.json").read_text(encoding="utf-8"))
    base = "seeded" if variant == "seeded" else "clean"  # visual cases reuse the clean source
    src = (HERE / f"{base}.mmd").read_text(encoding="utf-8")
    labels = json.loads(subprocess.run(
        [sys.executable, "-I", "-X", "utf8", str(SKILL / "scripts" / "truth_inputs.py"), str(HERE / f"{base}.mmd"), str(HERE / f"{base}.svg")],
        capture_output=True, text=True, encoding="utf-8", check=True).stdout)["labels"]
    facts = source_lines(src, "SOURCE") + [f"EXEMPT (not checked): {x}" for x in source_lines(src, "SOURCE-EXEMPT")]
    detection = [l.split("Detection:**", 1)[1].strip() for l in
                 (SKILL / "references" / "diagram-types" / "sequence.md").read_text(encoding="utf-8").splitlines()
                 if "Detection:**" in l]
    values = {
        "{TITLE}": inputs["title"], "{TYPE}": "sequenceDiagram", "{USE_CONTEXT}": "internal note",
        "{SYSTEM_DESCRIPTION}": inputs["system_description"].get(base, ""),
        "{DECLARED_FACTS}": "\n".join(f"  - {f}" for f in facts),
        "{NOT_CLAIMED}": "\n".join(f"  - {f}" for f in source_lines(src, "NOT CLAIMED")) or "none",
        "{PNG_PATH}": str(HERE / PNG[variant]),
        "{LABELS}": "\n".join(dict.fromkeys(labels)),
        "{TYPE_CHECKS}": "\n".join(f"- {d}" for d in detection),
    }
    text = Path(template).read_text(encoding="utf-8")
    m = re.search(r"````\n(.*?)\n````", text, re.S)  # the template's fenced brief, if it has one
    text = m.group(1) if m else text
    for k, v in values.items():
        text = text.replace(k, v)
    left = re.findall(r"\{[A-Z_]+\}", text)
    assert not left, f"unfilled placeholders: {left}"
    return text


def findings(path):
    raw = Path(path).read_text(encoding="utf-8")
    m = re.search(r"```json\s*(\{.*?\})\s*```", raw, re.S) or re.search(r"(\{.*\})", raw, re.S)
    return json.loads(m.group(1))


def grade(variant, path):
    key = json.loads((HERE / "expected.json").read_text(encoding="utf-8"))[variant]
    out = findings(path)
    ok = True
    for check in key.get("must_catch", []):
        pool = [s if isinstance(s, str) else json.dumps(s) for f in check["where"] for s in out.get(f, [])]
        hit = any(all(re.search(p, s) for p in check["all"]) for s in pool)
        print(f"{'PASS' if hit else 'FAIL'}  {check['id']}  (looked in {', '.join(check['where'])})")
        ok &= hit
    for field in key.get("must_be_empty", []):
        empty = not out.get(field)
        print(f"{'PASS' if empty else 'FAIL'}  {field} is empty" + ("" if empty else f": {out[field]}"))
        ok &= empty
    return ok


if __name__ == "__main__":
    cmd = sys.argv[1]
    if cmd == "fill":
        sys.stdout.reconfigure(encoding="utf-8")
        print(fill(sys.argv[2], sys.argv[3]))
    elif cmd == "grade":
        sys.exit(0 if grade(sys.argv[2], sys.argv[3]) else 1)
    else:
        sys.exit(f"unknown command {cmd}")
