#!/usr/bin/env python3
"""Prove from_drawio.py brings draw.io edits back into the d2 source, and says when it cannot.

Three round trips, each starting from a file to_drawio.py made:

    control     the cloud-merge sequence diagram, unedited: nothing to carry, and the .d2 must
                come back byte for byte (line endings aside)
    sequence    the same diagram with eleven edits (tests/drawio/round_trip_edits.py), five of
                them where place matters: a message added inside Route A must land after A3,
                one re-pointed must keep its line and class, a new actor must follow vm
    plain       01-plain with eight edits in and around a container, one of which d2 cannot
                express (a shape dragged into another container): exit 1, and that one only

Three negative controls, because a round trip that reports success on its own is not evidence:

    fingerprint   the .d2 changed after conversion: refused, exit 2, nothing written
    fallback      a .d2 the statement reader does not trust (a block string): messages are
                  appended instead of placed, and the order check must report it
    check         faults planted in a good result -- a colour line dropped, a message moved to
                  another group -- must each be reported by the same check the script runs

Usage:
    python tests/eval_from_drawio.py

Exit 0 only when every round trip and both controls behave as described.
"""

from __future__ import annotations

import shutil
import subprocess
import sys
from pathlib import Path
from xml.etree import ElementTree as ET

HERE = Path(__file__).resolve().parent
SKILL = HERE.parent
OUT = HERE / "_out" / "from_drawio"
sys.path.insert(0, str(SKILL / "scripts"))
sys.path.insert(0, str(HERE / "drawio"))
from from_drawio import read_page, verify  # noqa: E402
from review_cases import CASES as REVIEW_CASES, base_quoted  # noqa: E402
from round_trip_edits import edit_plain, edit_sequence  # noqa: E402
from to_drawio import build  # noqa: E402

SEQ = HERE / "fixtures" / "reviewer" / "cloud-merge" / "clean.d2"
PLAIN = HERE / "all-types" / "01-plain.d2"
SCRIPTS = SKILL / "scripts"


def convert(src: Path, out: Path) -> None:
    subprocess.run([sys.executable, str(SCRIPTS / "to_drawio.py"), str(src), "-o", str(out)], check=True,
                   capture_output=True)


def edited_copy(drawio: Path, out: Path, edit) -> None:
    tree = ET.parse(drawio)
    edit(tree.getroot().find("diagram").find("mxGraphModel").find("root"))
    tree.write(out, encoding="utf-8")


def bring_back(drawio: Path, base: Path, out: Path) -> tuple[int, str]:
    p = subprocess.run([sys.executable, str(SCRIPTS / "from_drawio.py"), str(drawio), "--base", str(base), "-o",
                        str(out)], capture_output=True, text=True, encoding="utf-8", errors="replace")
    return p.returncode, p.stdout + p.stderr


def lf(path: Path) -> str:
    return path.read_text(encoding="utf-8").replace("\r\n", "\n")


def main() -> int:
    shutil.rmtree(OUT, ignore_errors=True)
    OUT.mkdir(parents=True)
    results = []

    # control
    convert(SEQ, OUT / "seq.drawio")
    code, log = bring_back(OUT / "seq.drawio", SEQ, OUT / "control.d2")
    problems = [f"exit {code}"] if code else []
    if (OUT / "control.d2").is_file() and lf(OUT / "control.d2").rstrip("\n") != lf(SEQ).rstrip("\n"):
        problems.append("the .d2 did not come back unchanged")
    results.append(("control", problems, log))

    # sequence
    edited_copy(OUT / "seq.drawio", OUT / "seq-edited.drawio", edit_sequence)
    code, log = bring_back(OUT / "seq-edited.drawio", SEQ, OUT / "sequence.d2")
    problems = [f"exit {code}"] if code else []
    text = lf(OUT / "sequence.d2") if (OUT / "sequence.d2").is_file() else ""
    lines = text.split("\n")
    for want in ['you.label: "You\\n(your laptop)"', 'pr.style.fill: "#ffe4e6"',
                 'route_a.(pr -> main)[0].label: "A3 · Merge it"', "route_b.(you -> main)[0].style.stroke-dash: 0",
                 "start.(you -> main)[0].target-arrowhead.shape: diamond",
                 'route_a.pr."Not happy? Close the PR unmerged.\\nmain stays as it was.": null']:
        if want not in lines:
            problems.append(f"missing: {want}")

    def at(fragment: str) -> int:
        return next((i for i, line in enumerate(lines) if fragment in line), -1)

    if not (at("A3 · Merge pull request") < at("A3b · tell you") < at("A4 · git pull")) or at("A3b") < 0:
        problems.append("A3b is not between A3 and A4")
    if not (at("A2 · review") < at('you."pull first"') < at("A3 · Merge pull request")):
        problems.append("the new note is not a note on you between A2 and A3")
    if at("branch -> main") < 0 or at("{ class: alt }") < 0 or "branch -> you:" in text:
        problems.append("B1 was not re-pointed in place")
    if at('vm: "Cloud session') < 0 or at('reviewer: "Reviewer"') != at('vm: "Cloud session') + 1:
        problems.append("Reviewer does not follow vm")
    if "verified" not in log:
        problems.append("the check did not pass")
    results.append(("sequence", problems, log))

    # plain
    convert(PLAIN, OUT / "plain.drawio")
    edited_copy(OUT / "plain.drawio", OUT / "plain-edited.drawio", edit_plain)
    code, log = bring_back(OUT / "plain-edited.drawio", PLAIN, OUT / "plain.d2")
    problems = [] if code == 1 else [f"exit {code}, wanted 1"]
    text = lf(OUT / "plain.d2") if (OUT / "plain.d2").is_file() else ""
    for want in ['svc.api.label: "API gateway"', "svc.api.shape: oval", 'svc.store.style.fill: "#fde68a"',
                 'svc.cache: "Cache"', 'svc.api -> svc.cache: "reads"', "(svc.api -> user)[0]: null",
                 'link_store: "link store" {shape: cylinder; style.fill: "#fde68a"}']:
        if want not in text.split("\n"):
            problems.append(f"missing: {want}")
    reported = [line for line in log.split("\n") if line.strip().startswith("- ")]
    if len(reported) != 1 or "'user' moved into another container" not in reported[0]:
        problems.append(f"wanted exactly the container move reported, got {reported}")
    results.append(("plain", problems, log))

    # the 2026-10-19 review's cases (tests/drawio/review_cases.py): mostly former false passes
    for n, (name, base, edit, check) in enumerate(REVIEW_CASES, 1):
        if base is None:
            src = SEQ
        elif base == "plain":
            src = PLAIN
        else:
            src = OUT / f"review-{n}.d2"
            text_in = {"quoted": base_quoted(lf(SEQ)), "odd": lf(SEQ) + "\nexplain: |md the merge, in short |\n"}
            src.write_text(text_in.get(base, base), encoding="utf-8")
        convert(src, OUT / f"review-{n}.drawio")
        edited_copy(OUT / f"review-{n}.drawio", OUT / f"review-{n}-edited.drawio", edit)
        code, log = bring_back(OUT / f"review-{n}-edited.drawio", src, OUT / f"review-{n}-out.d2")
        out_text = lf(OUT / f"review-{n}-out.d2") if (OUT / f"review-{n}-out.d2").is_file() else ""
        results.append((name, check(out_text, log, code), log))

    # -o pointing at the draw.io file itself must be refused before anything is written
    victim = OUT / "self-target.drawio"  # a copy: a failure here overwrites the file it is given
    shutil.copy(OUT / "seq-edited.drawio", victim)
    before = victim.read_bytes()
    code, log = bring_back(victim, SEQ, victim)
    problems = [] if code == 2 and victim.read_bytes() == before else [f"exit {code}, file overwritten: "
                                                                       f"{victim.read_bytes() != before}"]
    results.append(("review: -o is the draw.io file", problems, log))

    # negative control: a .d2 changed after conversion
    changed = OUT / "changed.d2"
    changed.write_text(lf(SEQ).replace("A2 · review", "A2 · read"), encoding="utf-8")
    code, log = bring_back(OUT / "seq-edited.drawio", changed, OUT / "refused.d2")
    problems = [] if code == 2 and not (OUT / "refused.d2").exists() else [f"exit {code}, output written: "
                                                                            f"{(OUT / 'refused.d2').exists()}"]
    results.append(("control: fingerprint", problems, log))

    # negative control: a source the statement reader will not trust (a block string) must fall
    # back to appending, and the order check must then say the order was not carried
    odd = OUT / "odd.d2"
    odd.write_text(lf(SEQ) + '\nexplain: |md the merge, in short |\n', encoding="utf-8")
    convert(odd, OUT / "odd.drawio")
    edited_copy(OUT / "odd.drawio", OUT / "odd-edited.drawio", edit_sequence)
    code, log = bring_back(OUT / "odd-edited.drawio", odd, OUT / "odd-out.d2")
    problems = []
    if code != 1 or "appended instead of placed" not in log or "order or group differs" not in log:
        problems.append(f"exit {code}; the fallback or its order report is missing")
    results.append(("control: fallback", problems, log))

    # negative control: faults planted in the good sequence result must be reported
    edited, _ = read_page(ET.parse(OUT / "seq-edited.drawio").getroot().find("diagram"))
    base_doc, _ = build(SEQ, [])
    base_cells, _ = read_page(base_doc.find("diagram"))
    new_cids = {c for c in edited if c not in base_cells}
    good = lf(OUT / "sequence.d2")

    def check(name: str, text: str) -> list[str]:
        p = OUT / f"planted-{name}.d2"
        p.write_text(text, encoding="utf-8")
        doc, _ = build(p, [], cwd=SEQ.parent)
        return verify(edited, read_page(doc.find("diagram"))[0], new_cids, base_cells)

    glines = good.split("\n")
    a3b = glines.pop(next(i for i, line in enumerate(glines) if "A3b" in line))
    glines.insert(next(i for i, line in enumerate(glines) if line.startswith("route_b:")) + 1, a3b)
    as_actor = "\n".join(line for line in good.split("\n") if 'you."pull first"' not in line).replace(
        'vm: "Cloud session', 'pull_first: "pull first" {shape: page}\nvm: "Cloud session', 1)
    found = {"unchanged": check("unchanged", good),
             "dropped colour": check("colour", good.replace('pr.style.fill: "#ffe4e6"\n', "")),
             "moved message": check("moved", "\n".join(glines)),
             "note as actor": check("as-actor", as_actor)}
    problems = []
    if found["unchanged"]:
        problems.append(f"the good result itself was faulted: {found['unchanged'][:2]}")
    if not any("pull request page" in f for f in found["dropped colour"]):
        problems.append("a dropped colour went unreported")
    if not any("order or group differs" in f for f in found["moved message"]):
        problems.append("a moved message went unreported")
    if not any("note)" in f for f in found["note as actor"]):
        problems.append("a note that came back as an actor went unreported")

    # the old placement of a new actor -- appended after every other actor -- must be reported
    n = next(i for i, case in enumerate(REVIEW_CASES, 1) if case[0] == "review: new actor between a and b")
    mid_edited, _ = read_page(ET.parse(OUT / f"review-{n}-edited.drawio").getroot().find("diagram"))
    mid_base, _ = read_page(build(OUT / f"review-{n}.d2", [])[0].find("diagram"))
    mid_good = [line for line in lf(OUT / f"review-{n}-out.d2").split("\n") if not line.startswith("mid:")]
    planted = OUT / "planted-actor-at-end.d2"
    planted.write_text("\n".join(mid_good) + '\nmid: "Mid"\n', encoding="utf-8")
    at_end = verify(mid_edited, read_page(build(planted, [])[0].find("diagram"))[0],
                    {c for c in mid_edited if c not in mid_base}, mid_base)
    if not any("actor order differs" in f for f in at_end):
        problems.append("a new actor appended after every other actor went unreported")

    # order is checked per diagram: with two side by side, a message moved below its neighbour
    # in one of them must still be reported, and named by that diagram
    n = next(i for i, case in enumerate(REVIEW_CASES, 1) if case[0] == "review: two diagrams, side by side")
    two_edited, _ = read_page(ET.parse(OUT / f"review-{n}-edited.drawio").getroot().find("diagram"))
    two_base, _ = read_page(build(OUT / f"review-{n}.d2", [])[0].find("diagram"))
    lines2 = lf(OUT / f"review-{n}-out.d2").split("\n")
    moved_new = lines2.pop(next(i for i, line in enumerate(lines2) if "beta new" in line))
    lines2.insert(next(i for i, line in enumerate(lines2) if "y -> x: pong" in line) + 1, moved_new)
    planted = OUT / "planted-two-diagrams.d2"
    planted.write_text("\n".join(lines2), encoding="utf-8")
    swapped = verify(two_edited, read_page(build(planted, [])[0].find("diagram"))[0],
                     {c for c in two_edited if c not in two_base}, two_base)
    if not any("order or group differs in 'beta'" in f for f in swapped):
        problems.append(f"a message moved within one of two diagrams went unreported: {swapped}")
    results.append(("control: check", problems, ""))

    bad = 0
    for name, problems, log in results:
        bad += bool(problems)
        print("%-5s %-22s %s" % ("WRONG" if problems else "OK", name, "; ".join(problems)))
        if problems and log:
            print("        " + log.strip().replace("\n", "\n        "))
    print()
    if bad:
        print(f"{bad} case(s) behaved unexpectedly")
        return 1
    print("edits came back where they belong, the one impossible move was reported, and every control held")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
