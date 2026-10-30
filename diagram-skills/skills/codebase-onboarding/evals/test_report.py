"""report.py: one HTML file from everything stage 8 found, and the check that gates it. Also the SKILL.md stage 8 text."""
import json
import os
import re
from pathlib import Path

from conftest import SCRIPTS, run, save

SKILL = SCRIPTS.parent
ORDER = ["summary", "structure", "services", "licences", "architecture", "infrastructure", "business",
         "rationale", "security", "improvements", "runbook"]
RUNBOOK = """# demo — new-joiner runbook

## 0. Orientation (for a person, about 250 words)
**What it is for.** Demo turns orders into invoices (README.md).

## 4. Explanation — how it fits together
- Totals are rounded per line, not per order (origin: commit `abc1234`, PR #12).
- Retries stop after 3 tries (origin not recorded: inferred from `retry.py`).
"""
IMPROVEMENTS = """## Code
- Split `orders/service.py`: it is the top hotspot and 9 folders import it. Prompted by: `orders/service.py`
## Business ideas
- Offer invoice export to accounting tools; the code already builds a CSV. Prompted by: `export/csv.py`
"""


def workspace(tmp_path, vulns=None, improvements=IMPROVEMENTS, services=None):
    w = tmp_path / "w"
    save(w / "map.json", {"repo": "demo", "commit": "abc1234def", "hotspots": [{"file": "orders/service.py",
         "lines": 400, "commits": 30, "top_authors": ["a"]}], "fan_in": [["orders/service.py", 9]], "folders": [],
         "stack": [{"manifest": "requirements.txt", "name": "openai", "version": "==1.40.0"}], "docs": []})
    save(w / "services.json", services or {"accounts": 1, "services": [{"name": "OpenAI", "kind": "llm",
         "evidence": [{"file": "requirements.txt", "symbol": "openai"}]}], "keys": [{"name": "OPENAI_API_KEY",
         "files": [".env.example"], "service": "OpenAI"}], "not_checked": []})
    save(w / "licences.json", {"packages": [{"name": "mystery", "version": "0.1", "ecosystem": "pypi",
         "licence": "none stated", "class": "check"}], "check_count": 1, "not_scanned": ["nuget"]})
    save(w / "arch.json", {"verdict": "layered monolith", "confidence": "high", "units": [{"path": ".",
         "verdict": "layered"}], "signals": [], "approaches": [{"name": "DDD", "value": "not found", "evidence": []},
         {"name": "TDD", "value": "2 of 4 commits change a test and source together; 0 of 1 tests came before their code",
          "evidence": []}], "practices": []})
    save(w / "infra.json", {"nodes": [], "edges": [], "unknowns": ["Where does production run?"], "not_checked": []})
    save(w / "vulns.json", vulns or {"checked": True, "advisories": [{"package": "requests", "version": "2.19.0",
         "id": "GHSA-x84v-xcm2-53pg", "summary": "s", "fixed": "2.20.0"}], "secrets": [], "not_checked": []})
    (w / "out" / "diagrams").mkdir(parents=True)
    (w / "out" / "RUNBOOK.md").write_text(RUNBOOK, encoding="utf-8")
    (w / "out" / "diagrams" / "module-map.svg").write_text('<svg xmlns="http://www.w3.org/2000/svg"><rect/></svg>')
    (w / "out" / "diagrams" / "module-map-dark.svg").write_text('<svg xmlns="http://www.w3.org/2000/svg"><rect/></svg>')
    (w / "improvements.md").write_text(improvements, encoding="utf-8")
    return w


def build(w, *extra):
    r = run("report.py", "build", "--workspace", w, *extra)
    assert r.returncode == 0, r.stdout + r.stderr
    return (w / "out" / "report.html").read_text(encoding="utf-8")


def section(html, sid):
    m = re.search(rf'<section id="{sid}"[^>]*>(.*?)</section>', html, re.S)
    assert m, sid
    return m.group(1)


def test_report_has_every_section(tmp_path):
    html = build(workspace(tmp_path))
    assert re.findall(r'<section id="([\w-]+)"', html) == ORDER


def test_report_marks_not_checked(tmp_path):
    html = build(workspace(tmp_path, vulns={"checked": False, "advisories": [], "secrets": [],
                                            "not_checked": ["advisories: offline (no OSV query made)"]}))
    sec = section(html, "security")
    assert "not checked" in sec and "0 advisories" not in sec and "0 known" not in sec


def test_report_check_refuses_a_secret_value(tmp_path):
    w = workspace(tmp_path, services={"accounts": 1, "services": [{"name": "Stripe", "kind": "payments",
                  "evidence": [{"file": "docker-compose.yml", "symbol": "sk_live_abc123"}]}], "keys": [], "not_checked": []})
    build(w)
    r = run("report.py", "check", "--report", w / "out" / "report.html")
    assert r.returncode == 3 and "services" in r.stdout


def test_report_check_needs_prompted_by(tmp_path):
    w = workspace(tmp_path, improvements="## Business ideas\n- Sell it to banks.\n")
    build(w)
    r = run("report.py", "check", "--report", w / "out" / "report.html")
    assert r.returncode == 3 and "Prompted by" in r.stdout


def test_report_check_passes_a_clean_report(tmp_path):
    w = workspace(tmp_path)
    build(w)
    r = run("report.py", "check", "--report", w / "out" / "report.html")
    assert r.returncode == 0, r.stdout


def test_report_check_refuses_outside_loads(tmp_path):
    w = workspace(tmp_path)
    html = build(w)
    p = w / "out" / "report.html"
    p.write_text(html.replace("</body>", '<script src="https://example.com/x.js"></script></body>'), encoding="utf-8")
    r = run("report.py", "check", "--report", p)
    assert r.returncode == 3 and "example.com" in r.stdout


def test_report_has_both_themes(tmp_path):
    html = build(workspace(tmp_path))
    assert "prefers-color-scheme: dark" in html and '[data-theme="dark"]' in html


def test_report_without_rules_shows_command(tmp_path):
    assert "/code-modernization:modernize" in section(build(workspace(tmp_path)), "business")


def test_report_links_rule_cards(tmp_path):
    rules = tmp_path / "analysis" / "demo" / "BUSINESS_RULES.md"
    rules.parent.mkdir(parents=True)
    rules.write_text("".join(f"### RULE-00{i}: Rule {i}\n**Plain English:** Orders over {i}00 need approval.\n\n"
                             for i in (1, 2, 3)), encoding="utf-8")
    sec = section(build(workspace(tmp_path), "--rules", rules), "business")
    assert "3 rule cards" in sec and "BUSINESS_RULES.md" in sec and "Orders over 200 need approval." in sec


def test_report_shows_origin_commits(tmp_path):
    sec = section(build(workspace(tmp_path)), "rationale")
    assert "abc1234" in sec and "origin not recorded" in sec


def test_report_embeds_diagrams_and_colour_key(tmp_path):
    html = build(workspace(tmp_path))
    sec = section(html, "structure")          # an <img> data URI keeps each SVG's own styles apart
    assert 'class="dg-light"' in sec and 'class="dg-dark"' in sec and "data:image/svg+xml;base64," in sec
    assert all(f'class="key-{s}"' in html for s in ("structure", "services", "security"))


def test_skill_stage_8_names_every_step():
    text = (SKILL / "SKILL.md").read_text(encoding="utf-8")
    m = re.search(r"\*\*8\. Report\.\*\*(.*?)(?=\n## |\Z)", text, re.S)
    assert m, "SKILL.md has no stage 8"
    for step in ("services.py", "infra.py", "arch.py", "licences.py", "vulns.py", "diagrams.py draft",
                 "diagrams.py drawio", "diagrams.py check", "REQUIRED SUB-SKILL:** d2-diagram", "your call",
                 "report.py build", "report.py check"):
        assert step in m.group(1), step
    done = text.split("**Done when**")[1].split("## ")[0]
    assert "report.py check" in done
    assert "accounts" in text.split("**Reply:**")[1]


def test_improvements_brief_needs_prompted_by():
    text = (SKILL / "references" / "agent-briefs.md").read_text(encoding="utf-8")
    m = re.search(r"## Improvements(.*?```.*?```)", text, re.S)     # the brief's own template has ## headings
    assert m and "Prompted by:" in m.group(1) and "for discussion, not findings" in m.group(1)


def test_report_unscanned_licences_are_not_a_zero(tmp_path):
    """Seen on a real C# repo: nothing scanned (nuget not read) showed as "0 packages may need a paid licence"."""
    w = workspace(tmp_path)
    save(w / "licences.json", {"packages": [], "check_count": 0, "not_scanned": ["nuget"]})
    html = build(w)
    summary, lic = section(html, "summary"), section(html, "licences")
    assert "not scanned: nuget" in summary
    assert 'class="big">0<' not in lic and "not scanned: nuget" in lic


def test_report_links_each_drawio_and_shows_a_light_only_diagram(tmp_path):
    """The model may draw one light diagram only; it must still show in dark mode. Each .drawio is linked."""
    w = workspace(tmp_path)
    (w / "out" / "diagrams" / "module-map-dark.svg").unlink()
    (w / "out" / "diagrams" / "module-map.drawio").write_text("<mxfile/>", encoding="utf-8")
    sec = section(build(w), "structure")
    assert 'class="dg-light"' not in sec and "data:image/svg+xml;base64," in sec
    assert 'href="diagrams/module-map.drawio"' in sec



def test_report_rules_given_as_a_relative_path(tmp_path):
    """Review 7: SKILL.md shows a relative --rules path; it crashed as_uri(). The link is relative to the report."""
    w = workspace(tmp_path)
    rules = w / "analysis" / "demo" / "BUSINESS_RULES.md"
    rules.parent.mkdir(parents=True)
    rules.write_text("### RULE-001: One\n**Plain English:** One rule.\n", encoding="utf-8")
    sec = section(build(w, "--rules", os.path.relpath(rules)), "business")
    assert 'href="../analysis/demo/BUSINESS_RULES.md"' in sec and "file:" not in sec


def test_skill_licences_step_passes_the_repo():
    """Regraded minor: without --repo the .csproj fix never runs when the steps are followed as written."""
    text = (SKILL / "SKILL.md").read_text(encoding="utf-8")
    step = text.split("S/licences.py")[1].split("\n5.")[0]
    assert "--repo R" in step
