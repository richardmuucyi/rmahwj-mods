#!/usr/bin/env python3
"""T2 for html-artefact: does the reply-builder pattern (references/reply-builder.html) do what it says?

Run:  python evals/test_reply_builder.py   (paths are relative to this skill's folder)

Bar, written before the first run:
  5 scripted scenarios, all 5 must give exactly the expected reply text and Copy must yield it.
  Negative control: the same scenarios against a copy whose click handlers are disabled must fail >= 3 of 5.
Needs `pip install playwright` and a Chromium (python -m playwright install chromium).
"""
import os
import re
import sys
import tempfile

from playwright.sync_api import sync_playwright

HERE = os.path.dirname(os.path.abspath(__file__))
TEMPLATE = os.path.join(os.path.dirname(HERE), "references", "reply-builder.html")

# Capture what Copy writes, on both code paths: the async clipboard API and the execCommand fallback.
INIT_API = "window.__copied=null; Object.defineProperty(navigator,'clipboard',{value:{writeText:function(t){window.__copied=t;return Promise.resolve()}},configurable:true});"
INIT_FALLBACK = ("window.__copied=null; Object.defineProperty(navigator,'clipboard',{value:undefined,configurable:true});"
                 "document.execCommand=function(c){ if(c==='copy'){ window.__copied=document.activeElement.value; return true;} return false; };")


def text(pg, sel):
    return pg.locator(sel).inner_text().strip()


def s1_no_selection(pg):
    """Block 2 starts empty: placeholder shown, Copy disabled, count 0."""
    ok = (pg.locator("#copy-reply-2").is_disabled() and text(pg, "#count-2") == "0"
          and "Tick the ones that resonate" in text(pg, "#reply-2"))
    return ok, f"disabled={pg.locator('#copy-reply-2').is_disabled()} count={text(pg, '#count-2')}"


def s2_one_chip(pg):
    """Block 1: add one skip chip to the preselected state."""
    pg.click('.tog[data-label="the all-caps section labels (A)"]')
    got = text(pg, "#reply-1")
    want = ("Go with Direction B (grouped cards).\nSteal: the sticky save bar (B).\n"
            "Skip: the three-step progress (C); the all-caps section labels (A).\n"
            "Then build the real page in src/pages/Settings against the existing config API.")
    return got == want, got.replace("\n", " | ")[:140]


def s3_several(pg):
    """Change the pick and add a steal: the reply reflects all of it."""
    pg.click('.pick[data-name="Direction C (wizard)"]')
    pg.click('.tog[data-label="the inline validation hints (A)"]')
    got = text(pg, "#reply-1")
    ok = (got.startswith("Go with Direction C (wizard).") and "the sticky save bar (B); the inline validation hints (A)." in got
          and got.count("Go with") == 1)
    return ok, got.replace("\n", " | ")[:140]


def s4_back_to_empty(pg):
    """Tick two in block 2, untick both: back to the disabled placeholder. In block 1, clear every chip: no Steal/Skip lines."""
    pg.check('.res[data-n="1"]')
    pg.check('.res[data-n="3"]')
    mid = text(pg, "#reply-2")
    mid_ok = mid == "These resonate: #1, #3. Start with #1." and not pg.locator("#copy-reply-2").is_disabled() and text(pg, "#count-2") == "2"
    pg.uncheck('.res[data-n="1"]')
    pg.uncheck('.res[data-n="3"]')
    end_ok = pg.locator("#copy-reply-2").is_disabled() and text(pg, "#count-2") == "0"
    for _ in range(10):                           # each click removes the class, so take the first; bounded so a dead handler cannot hang the run
        if not pg.locator(".tog.on").count():
            break
        pg.locator(".tog.on").first.click()
    r1 = text(pg, "#reply-1")
    r1_ok = "Steal:" not in r1 and "Skip:" not in r1
    return mid_ok and end_ok and r1_ok, f"mid={mid!r} end_disabled={end_ok} r1_clear={r1_ok}"


def s5_copy(pg_factory):
    """Copy yields exactly the reply text, on the API path and on the execCommand fallback path."""
    results = []
    for init in (INIT_API, INIT_FALLBACK):
        pg = pg_factory(init)
        pg.click('.tog[data-label="the all-caps section labels (A)"]')
        want = text(pg, "#reply-1")
        pg.click("#copy-reply-1")
        pg.wait_for_timeout(150)
        got = pg.evaluate("window.__copied")
        flashed = "Copied" in text(pg, "#copy-reply-1")
        pg.click("#copy-prompt")
        pg.wait_for_timeout(150)
        prompt_ok = pg.evaluate("window.__copied") == text(pg, "#prompt-text")
        results.append(got == want and flashed and prompt_ok)
    return all(results), f"api={results[0]} fallback={results[1]}"


def run(url):
    out = []
    with sync_playwright() as p:
        b = p.chromium.launch()
        ctx = b.new_context()

        def fresh(init=None):
            pg = ctx.new_page()
            if init:
                pg.add_init_script(init)
            pg.goto(url)
            return pg

        for name, fn in (("1 no selection", s1_no_selection), ("2 one chip", s2_one_chip), ("3 several chips", s3_several),
                         ("4 back to empty", s4_back_to_empty)):
            pg = fresh()
            try:
                ok, msg = fn(pg)
            except Exception as e:  # a missing handler or id shows up here as a timeout
                ok, msg = False, "error: " + str(e).splitlines()[0][:100]
            out.append((name, ok, msg))
            pg.close()
        try:
            ok, msg = s5_copy(fresh)
        except Exception as e:
            ok, msg = False, "error: " + str(e).splitlines()[0][:100]
        out.append(("5 copy (API + fallback)", ok, msg))
        b.close()
    return out


def report(label, res):
    print(label)
    for name, ok, msg in res:
        print(f"  {'PASS' if ok else 'FAIL'}  {name:26} {msg}")
    return sum(1 for _, ok, _ in res if ok)


def main():
    url = "file:///" + TEMPLATE.replace("\\", "/")
    good = report("template", run(url))
    src = open(TEMPLATE, encoding="utf-8").read()
    broken = re.sub(r"addEventListener\('(click|change)'", r"addEventListener('x\1'", src)
    with tempfile.TemporaryDirectory() as td:
        bp = os.path.join(td, "broken.html")
        open(bp, "w", encoding="utf-8").write(broken)
        bad = report("negative control (click/change handlers disabled)", run("file:///" + bp.replace("\\", "/")))
    ok = good == 5 and (5 - bad) >= 3
    print(f"\nBARS: {'all hold' if ok else 'NOT MET'} (template {good}/5 pass; control fails {5 - bad}/5, needs >= 3)")
    sys.exit(0 if ok else 1)


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    main()
