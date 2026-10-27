#!/usr/bin/env python3
"""T1 for html-artefact: does scripts/audit.sh catch what it should and leave alone what it should?

Run:  python evals/test_audit.py [--pages DIR] [--old <dir containing the previous scripts/audit.sh>]
      (paths are relative to this skill's folder)

Rules under test: Google Fonts and pinned scripts from the five Artifact CDNs are allowed; everything else remote fails;
the palette check runs only with --kraft-look; a contract check (title, viewport, both themes, tokens) only ever warns.
Bars, written before the first run:
  1. Negative controls - every fixture that loads something not allowed must exit 1; an off-palette
     colour must WARN (with --kraft-look) and exit 0.
  2. No false alarms - fixtures with a PR number, an id selector, an href anchor, #FFF must produce no WARN.
  3. Reference pages (Thariq's 20 + the 11 'unknowns' + our own examples): 0 hard FAIL.
  4. Held-out, opt-in: your own generated pages that use the clay accent, from --pages DIR or the env var
     HTML_ARTEFACT_PAGES. Reports old vs new verdict; the first three that change verdict are printed for
     opening by hand. Skipped with a one-line note when no folder is given. It never changes the exit code.
Exit 0 only if bars 1-3 hold.
"""
import argparse
import glob
import os
import subprocess
import sys
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
SKILL = os.path.dirname(HERE)


def find_bash():
    """Bare 'bash' on Windows can be the WSL stub, not Git Bash: prefer BASH_EXE, then Git Bash's usual paths."""
    for p in (os.environ.get("BASH_EXE"), r"C:\Program Files\Git\bin\bash.exe", r"C:\Program Files\Git\usr\bin\bash.exe"):
        if p and os.path.exists(p):
            return p
    return "bash"


BASH = find_bash()


def page(head="", body=""):
    return f'<!doctype html><html><head><meta charset="utf-8"><title>t</title>{head}</head><body><p>x</p>{body}</body></html>'


def audit(script, path, *extra):
    """-> (rc, output). A run that never reaches the palette section crashed: retry once, then say so loudly."""
    for _ in range(2):
        r = subprocess.run([BASH, script.replace("\\", "/"), path.replace("\\", "/"), *extra], capture_output=True,
                           text=True, encoding="utf-8", errors="replace")
        out = r.stdout + r.stderr
        if "=== [2]" in out:
            return r.returncode, out
    return 99, "AUDIT CRASHED on " + path + " :: " + out[:300].replace(chr(10), " | ")


def palette_warned(out):
    return "=== [2]" in out and "WARN — " in out.split("=== [2]")[1].split("=== [3]")[0]


FIXTURES = {
    # name: (html, expected_rc, expect_warn_palette)
    "okext/gfonts-href-first": (page('<link href="https://fonts.googleapis.com/css2?family=Inter" rel="stylesheet">'), 0, None),
    "okext/gfonts-rel-first":  (page('<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter">'), 0, None),
    "okext/gfonts-preconnect": (page('<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>'), 0, None),
    "okext/cdnjs-pinned":      (page(body='<script src="https://cdnjs.cloudflare.com/ajax/libs/react/18.3.1/umd/react.production.min.js"></script>'), 0, None),
    "okext/jsdelivr-pinned":   (page(body='<script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js"></script>'), 0, None),
    "okext/unpkg-pinned":      (page(body='<script src="https://unpkg.com/react@18.3.1/umd/react.production.min.js"></script>'), 0, None),
    "okext/tailwind-pinned":   (page(body='<script src="https://cdn.tailwindcss.com/3.4.17"></script>'), 0, None),
    "ext/cdnjs-latest":        (page(body='<script src="https://cdnjs.cloudflare.com/ajax/libs/react/latest/react.min.js"></script>'), 1, None),
    "ext/jsdelivr-major-only": (page(body='<script src="https://cdn.jsdelivr.net/npm/react@18/umd/react.production.min.js"></script>'), 1, None),
    "ext/jsdelivr-bare-name":  (page(body='<script src="https://cdn.jsdelivr.net/npm/react/umd/react.production.min.js"></script>'), 1, None),
    "ext/tailwind-unpinned":   (page(body='<script src="https://cdn.tailwindcss.com"></script>'), 1, None),
    "ext/cdn-stylesheet":      (page('<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/normalize/8.0.1/normalize.min.css">'), 1, None),
    "ext/http-script":         (page(body='<script src="http://cdnjs.cloudflare.com/ajax/libs/react/18.3.1/umd/react.production.min.js"></script>'), 1, None),
    "ext/gstatic-img":         (page(body='<img src="https://fonts.gstatic.com/x.png" alt="">'), 1, None),
    "ext/css-import-cdn":      (page('<style>@import url("https://cdnjs.cloudflare.com/x.css");</style>'), 1, None),
    "ext/cdn-script":          (page(body='<script src="https://cdn.example.com/x.js"></script>'), 1, None),
    "ext/protocol-relative":   (page(body='<script src="//cdn.example.com/x.js"></script>'), 1, None),
    "ext/relative-script":     (page(body='<script src="app.js"></script>'), 1, None),
    "ext/relative-css":        (page('<link rel="stylesheet" href="style.css">'), 1, None),
    "ext/external-img":        (page(body='<img src="https://example.com/a.png" alt="">'), 1, None),
    "ext/css-url":             (page('<style>body{background:url("https://example.com/bg.png")}</style>'), 1, None),
    "ext/css-import-bare":     (page('<style>@import "https://example.com/x.css";</style>'), 1, None),
    "ext/esm-import":          (page(body='<script type="module">import x from "https://esm.sh/x"</script>'), 1, None),
    "ext/inline-style-url":    (page(body='<div style="background:url(img/a.png)">x</div>'), 1, None),
    "pal/neon-accent":         (page('<style>a{color:#FF00FF}</style>'), 0, True),
    "pal/neon-green-svg":      (page(body='<svg width="10" height="10"><rect fill="#00FF00" width="10" height="10"/></svg>'), 0, True),
    "pal/blue-in-js":          (page(body='<script>ctx.fillStyle = "#3B82F6";</script>'), 0, True),
    "ok/clean":                (page('<style>:root{--c:#D97757}body{background:#FAF9F5;color:#141413}</style>'), 0, False),
    "ok/anchor-link":          (page(body='<a href="https://example.com">link</a>'), 0, False),
    "ok/data-uri-img":         (page(body='<img alt="" src="data:image/gif;base64,R0lGODlhAQABAAAAACw=">'), 0, False),
    "ok/svg-local-gradient":   (page(body='<svg><defs><linearGradient id="g"><stop offset="0" stop-color="#D97757"/></linearGradient></defs><rect fill="url(#g)" width="5" height="5"/></svg>'), 0, False),
    "fp/pr-number-in-code":    (page(body='<code>#4888</code> and PR #247 and ticket #1234'), 0, False),
    "fp/id-selector":          (page('<style>#add{margin:0}#fade{opacity:.5}#bad .x{margin:1px}</style>', '<div id="add"></div>'), 0, False),
    "fp/href-anchor-hex-like": (page(body='<a href="#add">x</a><a href="#beef">y</a>'), 0, False),
    "fp/shorthand-white":      (page('<style>a{color:#FFF;background:#000}</style>'), 0, False),
    "fp/tinted-neutral+rust":  (page('<style>a{background:#E6E3DA;color:#B04A3F;border-color:#C9B98A}</style>'), 0, False),
    "fp/js-comment-issue":     (page(body='<script>// fix #fff1 later\nvar a = 1;</script>'), 0, False),
}


def run_fixtures(script):
    ok = True
    with tempfile.TemporaryDirectory() as td:
        for name, (html, want_rc, want_warn) in FIXTURES.items():
            p = os.path.join(td, name.replace("/", "__") + ".html")
            with open(p, "w", encoding="utf-8") as fh:
                fh.write(html)
            rc, out = audit(script, p, *(("--kraft-look",) if want_warn is not None else ()))
            warned = palette_warned(out)
            good = rc == want_rc and (want_warn is None or warned == want_warn)
            ok &= good
            print(f"  {'PASS' if good else 'FAIL'}  {name:28} rc={rc} (want {want_rc})  palette-warn={warned}"
                  + ("" if want_warn is None else f" (want {want_warn})"))
    return ok


def run_folder_cases(script):
    """--folder: a relative file is fine if it exists; a missing one, or any remote URL, still fails."""
    ok = True
    with tempfile.TemporaryDirectory() as td:
        open(os.path.join(td, "a.png"), "wb").write(b"\x89PNG")
        cases = [
            ("folder/relative-present, no flag", page(body='<img src="a.png" alt="">'), (), 1),
            ("folder/relative-present, --folder", page(body='<img src="a.png" alt="">'), ("--folder",), 0),
            ("folder/relative-missing, --folder", page(body='<img src="gone.png" alt="">'), ("--folder",), 1),
            ("folder/remote, --folder", page(body='<img src="https://example.com/a.png" alt="">'), ("--folder",), 1),
            ("folder/css-url-present, --folder", page(body='<div style="background:url(a.png)">x</div>'), ("--folder",), 0),
        ]
        for i, (name, html, extra, want) in enumerate(cases):
            p = os.path.join(td, f"case{i}.html")
            open(p, "w", encoding="utf-8").write(html)
            rc, _ = audit(script, p, *extra)
            good = rc == want
            ok &= good
            print(f"  {'PASS' if good else 'FAIL'}  {name:36} rc={rc} (want {want})")
    return ok


def run_contract_cases(script):
    """[4] page contract: soft only. A good page is OK; each missing rule is named; rc stays 0."""
    good_head = ('<meta name="viewport" content="width=device-width,initial-scale=1"><style>'
                 ':root{--bg:#fff;--fg:#111}@media (prefers-color-scheme: dark){:root{--bg:#111;--fg:#eee}}'
                 'body{background:var(--bg);color:var(--fg)}</style>')
    def pg(title, head):
        return f'<!doctype html><html><head><meta charset="utf-8"><title>{title}</title>{head}</head><body><p>x</p></body></html>'
    cases = [
        ("contract/good", pg("Tide Chart", good_head), "OK — title"),
        ("contract/title-with-colon", pg("Tide Chart: a guide", good_head), "explainer after a dash or colon"),
        ("contract/no-title", pg("", good_head), "no <title>"),
        ("contract/no-viewport", pg("Tide Chart", good_head.replace('<meta name="viewport" content="width=device-width,initial-scale=1">', "")), "no viewport meta"),
        ("contract/one-theme", pg("Tide Chart", good_head.replace("@media (prefers-color-scheme: dark){:root{--bg:#111;--fg:#eee}}", "")), "one theme only"),
        ("contract/no-tokens", pg("Tide Chart", '<meta name="viewport" content="x"><style>body{background:#fff}@media (prefers-color-scheme: dark){body{background:#000}}</style>'), "no colour tokens"),
        ("contract/100vh", pg("Tide Chart", good_head.replace("</style>", ".hero{min-height:100vh}</style>")), "100vh found"),
    ]
    ok = True
    with tempfile.TemporaryDirectory() as td:
        for i, (name, html, want) in enumerate(cases):
            p = os.path.join(td, f"c{i}.html")
            open(p, "w", encoding="utf-8").write(html)
            rc, out = audit(script, p)
            section = out.split("=== [4]")[-1] if "=== [4]" in out else ""
            good = rc == 0 and want in section
            ok &= good
            print(f"  {'PASS' if good else 'FAIL'}  {name:28} rc={rc}  wants '{want}'")
    return ok


def reference_pages():
    pats = [os.path.join(SKILL, "references", "thariq-examples", "[0-9]*.html"),
            os.path.join(SKILL, "references", "thariq-examples", "unknowns", "[0-9]*.html"),
            os.path.join(SKILL, "references", "examples", "*.html")]
    seen, out = set(), []
    for pat in pats:
        for f in sorted(glob.glob(pat)):
            key = os.path.basename(f), os.path.getsize(f)
            if key not in seen:
                seen.add(key)
                out.append(f)
    return out


def sweep(script, files, label):
    fails, warns = 0, 0
    for f in files:
        rc, out = audit(script, f, "--kraft-look")
        fails += rc != 0
        warns += palette_warned(out)
        if rc == 99:
            print("   !!", out.splitlines()[0])
    print(f"  {label}: {len(files)} pages, hard FAIL {fails}, palette WARN {warns}")
    return fails, warns


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--old", help="folder holding the previous scripts/audit.sh, for the incumbent column")
    ap.add_argument("--pages", default=os.environ.get("HTML_ARTEFACT_PAGES"),
                    help="folder of your own generated pages for bar 4 (default: env HTML_ARTEFACT_PAGES; none = skip)")
    a = ap.parse_args()
    new = os.path.join(SKILL, "scripts", "audit.sh")
    print(f"bash: {BASH}\n\n[1+2] fixtures (new script)")
    ok_fix = run_fixtures(new)
    print("\n[1] folder mode (--folder)")
    ok_fix &= run_folder_cases(new)
    print("\n[contract] page contract")
    ok_fix &= run_contract_cases(new)
    if a.old:
        print("\n[1+2] same fixtures through the OLD script (the incumbent, for the record)")
        run_fixtures(os.path.join(a.old, "scripts", "audit.sh"))
    print("\n[3] reference pages")
    refs = reference_pages()
    nf, nw = sweep(new, refs, "new")
    if a.old:
        sweep(os.path.join(a.old, "scripts", "audit.sh"), refs, "old")
    ok = ok_fix and nf == 0
    print("\n[4] held-out: your generated pages using the clay accent")
    if not a.pages:
        print("  SKIP - no folder given (pass --pages DIR or set HTML_ARTEFACT_PAGES)")
    elif not os.path.isdir(a.pages):
        print(f"  SKIP - not a folder: {a.pages}")
    else:
        held_out(new, a)
    print("\nBARS:", "all hold" if ok else "NOT MET", f"(fixtures {'ok' if ok_fix else 'FAILED'}, reference hard FAIL {nf}/{len(refs)})")
    sys.exit(0 if ok else 1)


def held_out(new, a):
    """Bar 4: report only."""
    held = []
    gh = os.path.abspath(a.pages)
    for root, _, fs in os.walk(gh):
        for f in fs:
            if f.endswith(".html"):
                p = os.path.join(root, f)
                try:
                    if "d97757" in open(p, encoding="utf-8", errors="replace").read().lower():
                        held.append(p)
                except OSError:
                    pass
    changed = []
    hn_fail = ho_fail = 0
    for p in held:
        rn, _ = audit(new, p)
        ro = audit(os.path.join(a.old, "scripts", "audit.sh"), p)[0] if a.old else None
        hn_fail += rn != 0
        ho_fail += (ro or 0) != 0
        if a.old and rn != ro:
            changed.append((p, ro, rn))
    print(f"  {len(held)} pages: new hard FAIL {hn_fail}" + (f", old hard FAIL {ho_fail}, verdict changed on {len(changed)}" if a.old else ""))
    for p, ro, rn in changed[:3]:
        print(f"    open by hand: {os.path.relpath(p, gh)}  old rc={ro} -> new rc={rn}")
    for p in held:
        rn, _ = audit(new, p)
        if rn != 0:
            rf, _ = audit(new, p, "--folder")
            print(f"    new hard FAIL: {os.path.relpath(p, gh)}  (with --folder: rc={rf})")


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    main()
