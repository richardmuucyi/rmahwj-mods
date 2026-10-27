"""Regression fixture for the stage-5e reviewer: fill its brief, and grade what it returns.

    python -I fixture.py fill  <agents/reviewer.md> seeded|clean   -> prints the filled brief
    python -I fixture.py grade seeded|clean <reviewer-output>      -> PASS/FAIL per check, exit 0/1

The same diagram as mermaid-visual-review's evals/fixtures/cloud-merge, drawn in d2. seeded.d2
carries the three errors a truth review caught (a conditional clone claim, a
citation to the wrong docs table, a missing PR-conflict case); clean.d2 is the fixed file.
Render first: scripts/render.py <v>.d2 -o <v>.svg, then scripts/rasterize.py <v>.svg --scale 1, and
save the PNGs as render-1.png (seeded) and render-2.png (clean) -- the reviewer sees the path.
"""
import json
import re
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
SKILL = HERE.parents[3]
sys.path.insert(0, str(SKILL / "scripts"))


def source_lines(text, tag):
    return [l.split(":", 1)[1].strip() for l in text.splitlines() if l.startswith(f"# {tag}:")]


def fill(template, variant):
    from quality import svg_labels
    inputs = json.loads((HERE / "inputs.json").read_text(encoding="utf-8"))
    src = (HERE / f"{variant}.d2").read_text(encoding="utf-8")
    facts = (source_lines(src, "SOURCE")
             + [f"EXEMPT (not checked): {x}" for x in source_lines(src, "SOURCE-EXEMPT")]
             + [f"NOT CLAIMED (left out on purpose): {x}" for x in source_lines(src, "NOT CLAIMED")])
    values = {
        "{TITLE}": inputs["title"], "{GENRE}": "sequence diagram",
        "{SYSTEM_DESCRIPTION}": inputs["system_description"][variant],
        "{DECLARED_FACTS}": "\n" + "\n".join(f"  - {f}" for f in facts),
        "{PNG_PATH}": str(HERE / {"seeded": "render-1.png", "clean": "render-2.png"}[variant]),  # neutral names: the reviewer sees this path
        "{SVG_LABELS}": "\n" + "\n".join(dict.fromkeys(svg_labels(HERE / f"{variant}.svg"))),
    }
    text = Path(template).read_text(encoding="utf-8")
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
