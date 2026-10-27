#!/usr/bin/env python3
"""Prove the reviewer's fixtures render, stay in sync with their committed
renders, keep the seeded/clean defect intact, and its prompt template is
complete.

This does NOT dispatch the subagent -- that costs 25-50k tokens per run.
Instead it checks what silently rots between runs: a fixture that no longer
compiles; a `.d2` edited without regenerating its committed `.svg`/`.png`,
which would show the reviewer a picture that disagrees with its own labels;
a seeded fixture whose defect (the clerk nested inside the "no human access"
container) has been edited away, which would make it a second clean fixture
with nothing left to catch; and a template that lost a placeholder during an
edit, which would send the reviewer a prompt with a literal "{PNG_PATH}" in it.
The design critic's template (agents/critic.md) gets the same placeholder check,
plus its six-area rubric and its hand-off of facts to the reviewer.
"""
import re
import subprocess
import sys
import tempfile
from pathlib import Path

SKILL = Path(__file__).resolve().parents[1]
FIX = SKILL / "tests" / "fixtures" / "reviewer"
AGENT = SKILL / "agents" / "reviewer.md"
RENDER = SKILL / "scripts" / "render.py"

REQUIRED = ["{TITLE}", "{GENRE}", "{SYSTEM_DESCRIPTION}",
            "{DECLARED_FACTS}", "{PNG_PATH}", "{SVG_LABELS}"]
REQUIRED_JSON_KEYS = ["critical", "polish", "reading_order_ok", "semantic_mismatches"]

# seeded.d2 nests `clerk:` inside the `box:` container (indented); clean.d2
# declares it outside, at column 0. That indentation IS the fixture pair's
# whole contract -- assert it structurally, not just that both files compile.
CLERK_LINE = re.compile(r"^([ \t]*)clerk:", re.MULTILINE)


def _lf(data: bytes) -> bytes:
    """LF-normalize before comparing rendered bytes -- a checked-out .svg carries
    CRLF on Windows while a freshly rendered one does not, and raw byte comparison
    across that boundary reports drift that was never actually there."""
    return data.replace(b"\r\n", b"\n")


def check_template() -> list:
    if not AGENT.exists():
        return [f"missing {AGENT}"]
    text = AGENT.read_text(encoding="utf-8")
    bad = [p for p in REQUIRED if p not in text]
    bad += [f"json key {k} not documented" for k in REQUIRED_JSON_KEYS if k not in text]
    if "author's reasoning" not in text.lower():
        bad.append("template does not state that author reasoning is withheld")
    return bad


CRITIC = SKILL / "agents" / "critic.md"
CRITIC_REQUIRED = ["{PNG_PATH}", "{DARK_PNG_PATH}", "{SOURCE_PATH}", "{PURPOSE}", "{MEDIUM}"]
CRITIC_RUBRIC = ["Purpose fit", "Claim and mechanism", "Layout and balance",
                 "Labels and encoding", "Colour and theme", "Legibility", "overall score out of 10"]


def check_critic_template() -> list:
    """The design critic's template keeps its placeholders, its six-area rubric with an
    overall /10, and its boundary: facts belong to reviewer.md, not to the critic."""
    if not CRITIC.exists():
        return [f"missing {CRITIC}"]
    text = CRITIC.read_text(encoding="utf-8")
    bad = [f"critic: {p}" for p in CRITIC_REQUIRED if p not in text]
    bad += [f"critic rubric lost {r!r}" for r in CRITIC_RUBRIC if r.lower() not in text.lower()]
    if "reviewer.md" not in text:
        bad.append("critic template does not hand facts to reviewer.md")
    return bad


def check_fixtures() -> list:
    bad = []
    for name in ("seeded", "clean"):
        src = FIX / f"{name}.d2"
        svg = FIX / f"{name}.svg"
        png = FIX / f"{name}.png"
        if not src.exists():
            bad.append(f"missing fixture {src}")
            continue

        # Render to a TEMPORARY path -- never over the committed .svg. Rendering
        # directly onto the tracked file (the old behaviour) meant running this
        # eval silently mutated a tracked artefact and never touched the .png,
        # so the two could disagree with each other and nothing would notice.
        with tempfile.TemporaryDirectory() as tmp:
            fresh = Path(tmp) / f"{name}.svg"
            p = subprocess.run([sys.executable, str(RENDER), str(src), "-o", str(fresh)],
                               capture_output=True, text=True, timeout=180)
            if p.returncode != 0:
                bad.append(f"{name}.d2 failed to render: {p.stderr.strip()[:120]}")
                continue
            if not svg.exists():
                bad.append(f"missing committed render {svg}")
            elif _lf(fresh.read_bytes()) != _lf(svg.read_bytes()):
                bad.append(
                    f"{name}.d2 no longer matches the committed {name}.svg -- "
                    f"the source changed; regenerate both {name}.svg and {name}.png"
                )

        if not svg.exists():
            bad.append(f"missing {svg}")
        if not png.exists():
            bad.append(f"missing {png}")

    seeded_text = (FIX / "seeded.d2").read_text(encoding="utf-8") if (FIX / "seeded.d2").exists() else ""
    clean_text = (FIX / "clean.d2").read_text(encoding="utf-8") if (FIX / "clean.d2").exists() else ""
    seeded_match = CLERK_LINE.search(seeded_text)
    clean_match = CLERK_LINE.search(clean_text)
    if seeded_text and not (seeded_match and seeded_match.group(1)):
        bad.append("seeded.d2's clerk: line is not indented -- the seeded defect "
                    "(clerk inside the server-only container) is gone")
    if clean_text and not (clean_match and clean_match.group(1) == ""):
        bad.append("clean.d2's clerk: line is indented -- it must sit outside the "
                    "container, at column 0, or the pair stops being minimal")

    return bad


def main() -> int:
    problems = check_template() + check_critic_template() + check_fixtures()
    for p in problems:
        print(f"  FAIL {p}")
    if problems:
        print(f"{len(problems)} problem(s)")
        return 1
    print("reviewer and critic templates complete; both fixtures render, match their "
          "committed images, and keep the seeded/clean defect intact")
    return 0


if __name__ == "__main__":
    sys.exit(main())
