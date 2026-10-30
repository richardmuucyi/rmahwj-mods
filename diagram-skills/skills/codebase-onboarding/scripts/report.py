"""Stage 8: one self-contained HTML report from everything the run found, and the check that gates it.

  python -I report.py build --workspace W [--rules analysis/<system>/BUSINESS_RULES.md]
  python -I report.py check --report W/out/report.html

`build` reads W/map.json, services.json, licences.json, arch.json, infra.json, vulns.json, improvements.md,
out/RUNBOOK.md and out/diagrams/*.svg (any of them may be missing: its section then says "not checked" and
which step makes it) and writes W/out/report.html: eleven sections in a fixed order, each in its colour from
references/section-colours.json (the diagrams use the same colours). Diagrams are embedded as <img> data URIs,
light and dark, so the file stands alone. Only Google Fonts loads from outside.

`check` exit status 3 names each problem: a missing section; text in a section that looks like a secret value
(sk_live_…, ghp_…, AKIA…, a private key); an improvement or idea with no "Prompted by:" file; a script,
stylesheet, image or frame loaded from a host other than Google Fonts; a missing light or dark theme.
"""
import argparse
import base64
import html
import json
import os
import re
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
TEMPLATE = HERE.parent / "assets" / "report-template.html"
COLOURS = {k: v for k, v in json.loads((HERE.parent / "references" / "section-colours.json")
                                       .read_text(encoding="utf-8")).items() if not k.startswith("_")}
SECTIONS = [("summary", "Summary", "improvement"), ("structure", "Structure", "structure"),
            ("services", "Outside services and keys", "services"), ("licences", "Licences", "licences"),
            ("architecture", "Architecture and practices", "architecture"),
            ("infrastructure", "Infrastructure", "infrastructure"), ("business", "Business rules", "business"),
            ("rationale", "Design rationale", "architecture"), ("security", "Security", "security"),
            ("improvements", "Improvements", "improvement"), ("runbook", "Runbook and handover questions", "structure")]
SECRET_VALUES = [("Stripe key", r"\b[sr]k_(live|test)_[0-9A-Za-z]{6,}"), ("GitHub token", r"\bgh[pousr]_[0-9A-Za-z]{20,}"),
                 ("AWS key", r"\bAKIA[0-9A-Z]{16}\b"), ("Slack token", r"\bxox[abpr]-[0-9A-Za-z-]{10,}"),
                 ("Google key", r"\bAIza[0-9A-Za-z_-]{35}\b"), ("private key", r"-----BEGIN [A-Z ]*PRIVATE KEY"),
                 ("OpenAI key", r"\bsk-(proj-)?[0-9A-Za-z_-]{20,}")]
ALLOWED_HOSTS = ("fonts.googleapis.com", "fonts.gstatic.com")
E = html.escape


def load(w, name):
    p = Path(w) / name
    return json.loads(p.read_text(encoding="utf-8")) if p.is_file() else None


def not_run(step):
    return f'<p class="not-checked">not checked: <code>{E(step)}</code> did not run, so this section has no data.</p>'


def table(head, rows):
    if not rows:
        return ""
    th = "".join(f"<th>{E(h)}</th>" for h in head)
    body = "".join("<tr>" + "".join(f"<td>{c}</td>" for c in r) + "</tr>" for r in rows)
    return f'<div class="scroll"><table><tr>{th}</tr>{body}</table></div>'


def files(evidence):
    return ", ".join(f"<code>{E(e.get('file', ''))}</code>" for e in evidence or [] if e.get("file")) or "—"


def diagram(w, name, alt):
    d = Path(w) / "out" / "diagrams"
    if not (d / f"{name}.svg").is_file():
        return ""
    both = (d / f"{name}-dark.svg").is_file()       # one theme only: show it in both
    imgs = []
    for suffix, cls in (("", "dg-light"), ("-dark", "dg-dark")):
        p = d / f"{name}{suffix}.svg"
        if p.is_file():
            data = base64.b64encode(p.read_bytes()).decode()
            attr = f' class="{cls}"' if both else ""
            imgs.append(f'<img{attr} alt="{E(alt)}" src="data:image/svg+xml;base64,{data}">')
    link = (f'<p class="note"><a href="diagrams/{name}.drawio">Open in draw.io</a> (editable)</p>'
            if (d / f"{name}.drawio").is_file() else "")
    return f'<div class="diagram">{"".join(imgs)}</div>{link}'


def runbook_part(text, number):
    m = re.search(rf"(?ms)^## {number}\..*?(?=^## |\Z)", text or "")
    return m.group(0).strip() if m else ""


def improvements(text):
    code, ideas, part = [], [], None
    for line in (text or "").splitlines():
        if line.startswith("## "):
            part = "ideas" if "idea" in line.lower() else "code"
        elif line.lstrip().startswith("- ") and part:
            (ideas if part == "ideas" else code).append(line.lstrip()[2:].strip())
    return code, ideas


def inline(text):
    """Escape, then show `code` spans."""
    return re.sub(r"`([^`]+)`", r"<code>\1</code>", E(text))


# ---- sections ------------------------------------------------------------------------------------

def s_summary(d):
    rows = []
    a, s, l, v, i = d["arch"], d["services"], d["licences"], d["vulns"], d["infra"]
    rows.append(("Architecture", E(a["verdict"]) + f' <span class="pill">confidence {E(a["confidence"])}</span>' if a else "not checked"))
    rows.append(("Outside accounts", str(s["accounts"]) if s else "not checked"))
    if not l:
        lic = "not checked"
    else:
        lic = (str(l["check_count"]) if l["packages"] else "") + "".join(
            f' <span class="not-checked">not scanned: {E(e)}</span>' for e in l.get("not_scanned", []))
        lic = lic.strip() or "0"
    rows.append(("Packages that may need a paid licence", lic))
    if v and v["checked"]:
        rows.append(("Known advisories", str(len(v["advisories"]))))
    else:
        rows.append(("Known advisories", '<span class="not-checked">not checked</span>'))
    rows.append(("Secrets in git history", str(len(v["secrets"])) if v and not any(n.startswith("secrets:") for n in v["not_checked"]) else '<span class="not-checked">not checked</span>'))
    rows.append(("Runtime pieces", str(len(i["nodes"])) if i else "not checked"))
    rows.append(("Business rules", f'{d["rule_count"]} rule cards' if d["rules"] else "not extracted"))
    hot = (d["map"] or {}).get("hotspots") or []
    rows.append(("Top hotspot", f"<code>{E(hot[0]['file'])}</code>" if hot else "—"))
    return table(["Question", "Answer"], [(E(q), a_) for q, a_ in rows])


def s_structure(d):
    out = []
    part0 = runbook_part(d["runbook"], 0)
    out.append(f'<pre class="excerpt">{E(part0)}</pre>' if part0 else '<p class="note">Runbook part 0 not written yet.</p>')
    out.append(diagram(d["w"], "module-map", "Folders and the imports between them"))
    m = d["map"]
    if not m:
        return "".join(out) + not_run("map_repo.py")
    out.append("<h3>Where change happens (lines × commits)</h3>")
    out.append(table(["File", "Lines", "Commits"], [(f"<code>{E(h['file'])}</code>", f'<span class="num">{h["lines"]}</span>',
                                                      f'<span class="num">{h["commits"]}</span>') for h in m.get("hotspots", [])[:8]]))
    out.append("<h3>What everything imports (fan-in)</h3>")
    out.append(table(["File", "Imported by"], [(f"<code>{E(f)}</code>", f'<span class="num">{n}</span>') for f, n in m.get("fan_in", [])[:8]])
               or '<p class="note">Fan-in not measured for this language (see map.md).</p>')
    if m.get("docs"):
        out.append("<h3>The repo's own docs</h3>")
        out.append(table(["Doc", "Code commits since its last edit"], [(f"<code>{E(x['file'])}</code>", f'<span class="num">{x["code_commits_since"]}</span>') for x in m["docs"][:10]]))
    return "".join(out)


def s_services(d):
    s = d["services"]
    if not s:
        return not_run("services.py")
    out = [f'<div class="facts"><div><b class="big">{s["accounts"]}</b><span>outside accounts</span></div>'
           f'<div><b class="big">{len(s["keys"])}</b><span>secret key names (values never shown)</span></div></div>',
           diagram(d["w"], "services", "Outside accounts grouped by kind")]
    found = lambda ev: ", ".join(f"<code>{E(e.get('file', ''))}</code> ({E(e.get('symbol', ''))})" for e in ev or []) or "—"
    out.append(table(["Service", "Kind", "Found in (file, name)"], [(E(x["name"]), E(x["kind"]), found(x["evidence"])) for x in s["services"]]))
    out.append(table(["Key name", "Files", "Service"], [(f"<code>{E(k['name'])}</code>", ", ".join(f"<code>{E(f)}</code>" for f in k["files"]),
                                                         E(k.get("service") or "—")) for k in s["keys"]]))
    out += [f'<p class="not-checked">not checked: {E(n)}</p>' for n in s.get("not_checked", [])]
    return "".join(out)


def s_licences(d):
    l, s = d["licences"], d["services"]
    if not l:
        return not_run("licences.py")
    check = [p for p in l["packages"] if p["class"] == "check"]
    counts = {c: sum(p["class"] == c for p in l["packages"]) for c in ("permissive", "weak-copyleft", "strong-copyleft", "check")}
    head = (f'<b class="big">{len(check)}</b>' if l["packages"] else '<b class="big not-checked">—</b>')
    out = [f'<div class="facts"><div>{head}<span>packages may need a paid licence: ask the owner</span></div>'
           f'<div><b class="big">{s["accounts"] if s else "?"}</b><span>outside services, usually a paid subscription</span></div></div>']
    out.append(table(["Package", "Version", "Licence stated"], [(E(p["name"]), E(p["version"]), E(p["licence"])) for p in check]))
    out.append(table(["Class", "Packages", "What it means"], [
        ("permissive", str(counts["permissive"]), "free to use, keep the notice"),
        ("weak-copyleft", str(counts["weak-copyleft"]), "free; changes to the library itself are shared"),
        ("strong-copyleft", str(counts["strong-copyleft"]), "free; duties for the whole program (AGPL: over a network too)"),
        ("check", str(counts["check"]), "no open licence found: may be paid")]))
    if s and s["services"]:
        out.append("<h3>Subscriptions the code needs</h3><ul>" + "".join(f"<li>{E(x['name'])} ({E(x['kind'])})</li>" for x in s["services"]) + "</ul>")
    out += [f'<p class="not-checked">not scanned: {E(e)} packages (declared in the manifests, not read)</p>' for e in l.get("not_scanned", [])]
    out.append('<p class="note">Prices are never guessed. An open licence costs nothing but can carry duties.</p>')
    return "".join(out)


def s_architecture(d):
    a = d["arch"]
    if not a:
        return not_run("arch.py")
    out = [f'<div class="facts"><div><b class="big">{E(a["verdict"])}</b><span>confidence {E(a["confidence"])}</span></div></div>',
           diagram(d["w"], "architecture", "Deploy units and their layout")]
    out.append(table(["Signal", "Value", "Evidence"], [(E(x["name"]), E(x["value"]), files(x.get("evidence"))) for x in a.get("signals", [])]))
    out.append("<h3>Approaches beside the verdict</h3>")
    out.append(table(["Approach", "What the repo shows", "Evidence"], [(E(x["name"]), E(x["value"]), files(x.get("evidence"))) for x in a.get("approaches", [])]))
    out.append("<h3>Coding practices</h3>")
    out.append(table(["Practice", "Value", "Evidence"], [(E(x["name"]), E(x["value"]), files(x.get("evidence"))) for x in a.get("practices", [])])
               or '<p class="note">No formatter, linter or type-check configuration found.</p>')
    return "".join(out)


def s_infrastructure(d):
    i = d["infra"]
    if not i:
        return not_run("infra.py")
    out = [diagram(d["w"], "infra", "What runs and what it talks to")]
    out.append(table(["Piece", "Kind", "Image", "Ports", "File"], [(E(n["id"]), E(n["kind"]), E(n.get("image") or "—"),
                     E(", ".join(n.get("ports") or [])) or "—", f"<code>{E(n['file'])}</code>") for n in i["nodes"]]))
    if i.get("unknowns"):
        out.append("<h3>Not in the repo: ask at the handover</h3><ul>" + "".join(f"<li>{E(u)}</li>" for u in i["unknowns"]) + "</ul>")
    out += [f'<p class="not-checked">not checked: {E(n)}</p>' for n in i.get("not_checked", [])]
    return "".join(out)


def s_business(d):
    if not d["rules"]:
        return ('<p>The business rules have not been extracted. They come from Anthropic\'s code-modernization plugin, '
                'path <em>Understand it first</em>: rule cards in plain words, each citing its file, checked by a second agent.</p>'
                '<p>Run <code>/code-modernization:modernize</code>, then build this report again with '
                '<code>--rules analysis/&lt;system&gt;/BUSINESS_RULES.md</code>.</p>')
    path = Path(d["rules"]).resolve()
    try:                                              # relative to the report, so a shared report has no local path
        href = os.path.relpath(path, Path(d["w"]).resolve() / "out").replace(os.sep, "/")
    except ValueError:                                # another drive on Windows
        href = path.as_uri()
    items = "".join(f"<li><b>{E(rid)}</b> {E(name)}" + (f" — {E(plain)}" if plain else "") + "</li>"
                    for rid, name, plain in d["rule_cards"][:40])
    more = f'<p class="note">… and {d["rule_count"] - 40} more in the file.</p>' if d["rule_count"] > 40 else ""
    return (f'<div class="facts"><div><b class="big">{d["rule_count"]}</b><span>rule cards</span></div></div>'
            f'<p>{d["rule_count"]} rule cards from code-modernization. The full cards, with the code each one cites: '
            f'<a href="{E(href)}">{E(path.name)}</a></p><ol>{items}</ol>{more}')


def s_rationale(d):
    part4 = runbook_part(d["runbook"], 4)
    lines = [l.strip(" -*") for l in part4.splitlines() if "origin" in l.lower()]
    if not lines:
        return '<p class="note">Runbook part 4 has no design facts with an origin yet.</p>'
    return ("<ul>" + "".join(f"<li>{inline(l)}</li>" for l in lines) + "</ul>"
            '<p class="note">"origin not recorded" means no commit, pull request or issue gave the reason: it is a handover question, not a fact.</p>')


def s_security(d):
    v = d["vulns"]
    if not v:
        return not_run("vulns.py")
    out = []
    if v["checked"]:
        out.append(f'<div class="facts"><div><b class="big">{len(v["advisories"])}</b><span>known advisories in installed packages (OSV)</span></div></div>')
        out.append(table(["Package", "Version", "Advisory", "Fixed in"], [(E(x["package"]), E(x["version"]), f'<code>{E(x["id"])}</code> {E(x["summary"])}',
                                                                          E(x["fixed"] or "no fixed version")) for x in v["advisories"]]))
    secrets_ran = not any(n.startswith("secrets:") for n in v["not_checked"])
    if secrets_ran:
        out.append(f'<p><b>{len(v["secrets"])}</b> secrets found in git history (values hidden; rotate any that are real).</p>')
        out.append(table(["Rule", "File", "Commit"], [(E(x["rule"]), f"<code>{E(x['file'])}</code>", f"<code>{E(x['commit'])}</code>") for x in v["secrets"]]))
    out += [f'<p class="not-checked">not checked: {E(n)}</p>' for n in v["not_checked"]]
    out.append('<p class="note">Not covered: flaws in the code itself (injection, broken access control). '
               'For that, run <code>/claude-security</code> on the repo.</p>')
    return "".join(out)


def s_improvements(d):
    code, ideas = d["improvements"]
    if not code and not ideas:
        return not_run("the improvements agent (W/improvements.md)")
    out = []
    if code:
        out.append("<h3>The code</h3><ul>" + "".join(f'<li class="code-item">{inline(x)}</li>' for x in code) + "</ul>")
    if ideas:
        out.append("<h3>Business ideas</h3><p class=\"note\">Ideas for discussion, not findings: each starts from a fact in the code.</p>"
                   "<ul>" + "".join(f'<li class="idea">{inline(x)}</li>' for x in ideas) + "</ul>")
    return "".join(out)


def s_runbook(d):
    kt = len(set(re.findall(r"\[([A-M]\d+)\]", runbook_part(d["runbook"], 5))))
    return (f'<p>The runbook (tutorial, how-to, reference, explanation) is <a href="RUNBOOK.md">RUNBOOK.md</a>, and the '
            f'agent rules are <a href="AGENTS.md">AGENTS.md</a>, both beside this report.</p>'
            f'<p>Handover session: <b>{kt}</b> questions in runbook part 5.</p>')


BUILDERS = {"summary": s_summary, "structure": s_structure, "services": s_services, "licences": s_licences,
            "architecture": s_architecture, "infrastructure": s_infrastructure, "business": s_business,
            "rationale": s_rationale, "security": s_security, "improvements": s_improvements, "runbook": s_runbook}


def build(w, rules=None):
    w = Path(w)
    rb = w / "out" / "RUNBOOK.md"
    d = {"w": w, "map": load(w, "map.json"), "services": load(w, "services.json"), "licences": load(w, "licences.json"),
         "arch": load(w, "arch.json"), "infra": load(w, "infra.json"), "vulns": load(w, "vulns.json"),
         "runbook": rb.read_text(encoding="utf-8") if rb.is_file() else "",
         "improvements": improvements((w / "improvements.md").read_text(encoding="utf-8")
                                      if (w / "improvements.md").is_file() else ""), "rules": rules}
    d["rule_cards"], d["rule_count"] = [], 0
    if rules:
        text = Path(rules).read_text(encoding="utf-8")
        for m in re.finditer(r"(?m)^###\s+(RULE-\d+):\s*(.+)$", text):
            plain = re.search(r"\*\*Plain English:\*\*\s*(.+)", text[m.end():m.end() + 1500])
            d["rule_cards"].append((m.group(1), m.group(2).strip(), plain.group(1).strip() if plain else ""))
        d["rule_count"] = len(d["rule_cards"])
    repo = os.path.basename(str((d["map"] or {}).get("repo", "the repo")).rstrip("/\\"))
    commit = str((d["map"] or {}).get("commit", ""))[:8]
    sections = "\n".join(f'<section id="{sid}" style="--c: var(--c-{colour})"><h2>{E(title)}</h2>{BUILDERS[sid](d)}</section>'
                         for sid, title, colour in SECTIONS)
    light = "\n".join(f"  --c-{k}: {v['light']};" for k, v in COLOURS.items())
    dark = "\n".join(f"    --c-{k}: {v['dark']};" for k, v in COLOURS.items())
    key = "".join(f'<span class="key-{k}"><i style="background: var(--c-{k})"></i>{E(v["label"])}</span>' for k, v in COLOURS.items())
    page = TEMPLATE.read_text(encoding="utf-8")
    for k, v in {"{{TITLE}}": E(f"{repo} — onboarding report"), "{{META}}": E(f"{repo} @ {commit}" if commit else repo),
                 "{{LIGHT_TOKENS}}": light, "{{DARK_TOKENS}}": dark, "{{SECTION_RULES}}": "", "{{KEY}}": key,
                 "{{SECTIONS}}": sections}.items():
        page = page.replace(k, v)
    out = w / "out" / "report.html"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(page, encoding="utf-8")
    return str(out)


def check(path):
    page = Path(path).read_text(encoding="utf-8")
    problems = []
    found = re.findall(r'<section id="([\w-]+)"', page)
    for sid, _, _ in SECTIONS:
        if sid not in found:
            problems.append(f"MISSING SECTION: {sid}")
    for sid, body in re.findall(r'<section id="([\w-]+)"[^>]*>(.*?)</section>', page, re.S):
        text = re.sub(r'src="data:[^"]+"', "", body)
        for label, rx in SECRET_VALUES:
            if re.search(rx, text):
                problems.append(f"SECRET-LOOKING VALUE in section {sid}: {label}. Show the key name, never its value")
    for li in re.findall(r'<li class="(?:idea|code-item)">(.*?)</li>', page, re.S):
        if "Prompted by:" not in li:
            problems.append(f"NO 'Prompted by:' file on an improvement: {re.sub('<[^>]+>', '', li)[:60]}")
    for tag, url in re.findall(r'<(script|link|img|iframe|source)\b[^>]*?(?:src|href)="(https?://[^"]+)"', page):
        host = re.match(r"https?://([^/:]+)", url).group(1)
        if host not in ALLOWED_HOSTS:
            problems.append(f"OUTSIDE LOAD: <{tag}> from {host}")
    if "prefers-color-scheme: dark" not in page or '[data-theme="dark"]' not in page:
        problems.append("THEME: the page needs both the light and the dark token blocks")
    return problems


def main():
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = p.add_subparsers(dest="cmd", required=True)
    b = sub.add_parser("build")
    b.add_argument("--workspace", required=True)
    b.add_argument("--rules", help="analysis/<system>/BUSINESS_RULES.md from /code-modernization:modernize")
    c = sub.add_parser("check")
    c.add_argument("--report", required=True)
    a = p.parse_args()
    if a.cmd == "build":
        print(build(a.workspace, a.rules))
        return
    problems = check(a.report)
    for x in problems:
        print(x)
    print(f"report check: {'ok' if not problems else str(len(problems)) + ' problems'} ({a.report})")
    sys.exit(3 if problems else 0)


if __name__ == "__main__":
    main()
