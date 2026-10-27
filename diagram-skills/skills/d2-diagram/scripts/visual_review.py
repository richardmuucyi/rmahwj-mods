#!/usr/bin/env python3
"""Look at a rendered diagram with a real browser and report what is visually wrong.

Why a browser rather than parsing the SVG: the defects that actually spoil a D2 diagram
are all GEOMETRIC, and geometry does not exist until something lays the file out.

    * a Markdown heading clipped in half
    * an icon drawn on top of its own label
    * a label wider than the node it belongs to
    * content outside the canvas
    * two labels sitting on each other

None of these are visible in the source, none raise an error, and every one of them
exits 0. `getBBox()` in a live DOM is the only thing that can measure them -- which is
what makes the browser the EYE of this skill rather than a convenience.

What this does NOT do is replace looking at the render yourself. It narrows where to
look and gives you the numbers; taste is still yours. It always writes a PNG for that
reason.

Two traps this encodes, both learned by hitting them:

    1. playwright-cli BLOCKS the file: protocol. Local files must be served, so this
       starts a throwaway HTTP server bound to 127.0.0.1 on an ephemeral port.
    2. `goto` on a bare .svg document reports `TimeoutError: Timeout 30000ms exceeded`
       even though the page loaded fine -- the load event never fires for a standalone
       SVG. The SVG is therefore inlined into a wrapper HTML page, and success is
       confirmed by probing the DOM rather than by trusting goto's exit status.

Usage:
    python visual_review.py diagram.svg
    python visual_review.py diagram.svg --json
    python visual_review.py out/index.svg --out-dir review/ --session mydiagram

Exit 0 when no CRITICAL finding was raised. Exit 1 when at least one was.
"""

from __future__ import annotations

import argparse
import functools
import http.server
import json
import re
import shutil
import socket
import socketserver
import subprocess
import sys
import tempfile
import threading
from pathlib import Path

# Tolerance in CSS px before an overlap or overflow is called a defect. Anti-aliasing and
# sub-pixel text metrics routinely produce 1-2px of slop that means nothing.
SLOP = 3.0

# EVERY box below is a getBoundingClientRect, never a getBBox. getBBox reports an
# element in its OWN user space with ancestor transforms not applied, so comparing a
# child's getBBox against the root's is comparing two different coordinate systems --
# which produced a confident "the title is outside the canvas" CRITICAL on a title that
# was plainly inside it. Client rects are all in one viewport space, so containment and
# overlap tests actually mean something.

# The probe. Returns one JSON blob describing every drawn thing and where it sits.
# Kept as one evaluate() call because each playwright-cli invocation costs a process.
PROBE = r"""() => {
  const svg = document.querySelector('svg');
  if (!svg) return JSON.stringify({error: 'no svg element in the page'});
  const box = el => { try { const r = el.getBoundingClientRect();
      if (!r || (!r.width && !r.height)) return null;
      return {x: r.left, y: r.top, w: r.width, h: r.height}; } catch (e) { return null; } };
  const root = box(svg) || {x:0, y:0, w:0, h:0};
  const vb = svg.viewBox && svg.viewBox.baseVal
      ? {x: svg.viewBox.baseVal.x, y: svg.viewBox.baseVal.y,
         w: svg.viewBox.baseVal.width, h: svg.viewBox.baseVal.height} : null;

  const texts = [...svg.querySelectorAll('text')].map(t => ({
    kind: 'text',
    content: (t.textContent || '').trim().slice(0, 60),
    size: parseFloat(getComputedStyle(t).fontSize) || null,
    box: box(t),
    owner: (() => { let p = t.parentElement;
      while (p && p !== svg) { if (p.getAttribute && p.getAttribute('class')) return p.getAttribute('class'); p = p.parentElement; }
      return null; })()
  })).filter(t => t.box && t.content);

  const images = [...svg.querySelectorAll('image')].map(i => ({kind: 'image', box: box(i)}))
      .filter(i => i.box);

  const fos = [...svg.querySelectorAll('foreignObject')].map(f => {
    const b = box(f);
    const inner = f.firstElementChild;
    const ib = inner ? inner.getBoundingClientRect() : null;
    return {kind: 'foreignObject', box: b,
            content: (f.textContent || '').trim().slice(0, 60),
            innerH: ib ? ib.height : null,
            declaredH: b ? b.h : null};
  }).filter(f => f.box);

  const shapes = [...svg.querySelectorAll('g[class]')].map(g => {
    const outline = g.querySelector(':scope > rect, :scope > ellipse, :scope > circle, :scope > polygon, :scope > path');
    if (!outline) return null;
    if (outline.tagName.toLowerCase() === 'path') {
      const fill = getComputedStyle(outline).fill;
      if (!fill || fill === 'none' || fill === 'rgba(0, 0, 0, 0)') return null;
    }
    return {kind: 'shape', cls: g.getAttribute('class').split(' ')[0], box: box(outline)};
  }).filter(s => s && s.box && s.box.w > 0);

  return JSON.stringify({root, vb, texts, images, fos, shapes,
                         counts: {text: texts.length, image: images.length,
                                  fo: fos.length, shape: shapes.length}});
}"""


def svg_natural_size(markup: str):
    """Read width/height off the root <svg>, falling back to its viewBox."""
    head = markup[:4000]
    w = re.search(r'<svg[^>]*\bwidth="([\d.]+)', head)
    h = re.search(r'<svg[^>]*\bheight="([\d.]+)', head)
    if w and h:
        return float(w.group(1)), float(h.group(1))
    vb = re.search(r'viewBox="[-\d.]+ [-\d.]+ ([\d.]+) ([\d.]+)"', head)
    if vb:
        return float(vb.group(1)), float(vb.group(2))
    return None


def free_port() -> int:
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


def serve(directory: Path, port: int):
    handler = functools.partial(http.server.SimpleHTTPRequestHandler, directory=str(directory))

    class Quiet(socketserver.TCPServer):
        allow_reuse_address = True

        def handle_error(self, request, client_address):
            pass

    httpd = Quiet(("127.0.0.1", port), handler)
    t = threading.Thread(target=httpd.serve_forever, daemon=True)
    t.start()
    return httpd


@functools.lru_cache(maxsize=1)
def playwright_bin() -> str:
    """Resolve playwright-cli to something Windows can actually launch.

    npm installs it as a shell script plus a `.cmd` shim. Passing the bare name to
    subprocess fails on Windows with `WinError 2`, because CreateProcess does not apply
    PATHEXT -- it looks for a literal file called `playwright-cli` and finds the bash
    script, which it cannot execute. shutil.which DOES resolve the .CMD, so the fix is
    simply to pass the resolved path rather than the name.
    """
    for name in ("playwright-cli.cmd", "playwright-cli.exe", "playwright-cli"):
        found = shutil.which(name)
        if found:
            return found
    return "playwright-cli"


def pw(session: str, *args, timeout: int = 120):
    cmd = [playwright_bin(), "-s=" + session, *args]
    return subprocess.run(cmd, capture_output=True, text=True, timeout=timeout)


def one_line(js: str) -> str:
    """Collapse a JS function to a single line before handing it to playwright-cli.

    playwright-cli wraps the expression in a SINGLE-QUOTED JavaScript string literal
    (`page.evaluate('() => {...}')`). A multi-line function therefore becomes a string
    containing raw newlines, which is a SyntaxError -- reported against the generated
    eval, not against your code, so it reads as if the probe itself is malformed.
    JS is whitespace-insensitive and the probe carries no // comments, so collapsing is
    safe. Never add a line comment to PROBE: it would swallow the rest of the function.
    """
    stripped = re.sub(r"//[^\n]*", "", js)
    return " ".join(stripped.split())


def parse_result(stdout: str):
    """Pull the value out of playwright-cli's `### Result` block.

    eval returns the value JSON-encoded, so the payload is a JSON string containing
    JSON -- it needs decoding twice. Anything else means the probe did not run.
    """
    m = re.search(r"^### Result\s*\n(.*?)(?=^###|\Z)", stdout, re.S | re.M)
    if not m:
        return None
    raw = m.group(1).strip()
    try:
        once = json.loads(raw)
    except Exception:
        return None
    if isinstance(once, str):
        try:
            return json.loads(once)
        except Exception:
            return None
    return once


def intersect(a, b, slop=SLOP):
    """Overlap area of two boxes, ignoring `slop` px of edge contact."""
    ax2, ay2 = a["x"] + a["w"], a["y"] + a["h"]
    bx2, by2 = b["x"] + b["w"], b["y"] + b["h"]
    ox = min(ax2, bx2) - max(a["x"], b["x"]) - slop
    oy = min(ay2, by2) - max(a["y"], b["y"]) - slop
    return ox * oy if ox > 0 and oy > 0 else 0.0


def contains(outer, inner, slop=SLOP):
    return (inner["x"] >= outer["x"] - slop and inner["y"] >= outer["y"] - slop
            and inner["x"] + inner["w"] <= outer["x"] + outer["w"] + slop
            and inner["y"] + inner["h"] <= outer["y"] + outer["h"] + slop)


def analyse(data: dict):
    """Turn geometry into findings. CRITICAL means a reader will see it and be misled."""
    findings = []

    def add(sev, check, msg):
        findings.append({"severity": sev, "check": check, "detail": msg})

    if data.get("error"):
        add("CRITICAL", "render-loaded", data["error"])
        return findings

    counts = data.get("counts", {})
    if counts.get("text", 0) == 0 and counts.get("fo", 0) == 0:
        add("CRITICAL", "has-labels",
            "nothing textual was drawn -- the diagram rendered but says nothing")

    root = data.get("root") or {}
    texts = data.get("texts", [])
    images = data.get("images", [])
    shapes = data.get("shapes", [])
    fos = data.get("fos", [])

    # 1. Content outside the canvas -- the signature of clipping.
    if root.get("w"):
        for el in texts + images + fos:
            if not contains(root, el["box"], slop=SLOP + 2):
                label = el.get("content") or el["kind"]
                add("CRITICAL", "out-of-canvas",
                    "%s sits outside the canvas -- it will be cut off: %r"
                    % (el["kind"], label))

    # 2. A Markdown block whose laid-out content is taller than the box it was given.
    #    This is exactly the clipped-heading bug: D2 measures a Markdown block at
    #    body-text metrics, so a heading that wraps overflows and `width` will not fix it.
    for f in fos:
        if f.get("innerH") and f.get("declaredH") and f["innerH"] > f["declaredH"] + SLOP:
            add("CRITICAL", "markdown-clipped",
                "Markdown block content is %.0fpx tall in a %.0fpx box -- it is clipped. "
                "Use `shape: text` for a title, or shorten the heading so it fits one "
                "line. Content: %r" % (f["innerH"], f["declaredH"], f["content"]))

    # 3. An icon drawn over its own label.
    for img in images:
        for t in texts:
            area = intersect(img["box"], t["box"])
            if area > 0:
                add("CRITICAL", "icon-over-label",
                    "an icon overlaps the label %r by %.0fpx^2 -- the node was sized to "
                    "its label leaving no room. Set explicit width/height; note that "
                    "`icon.near: top-left` makes this WORSE." % (t["content"], area))

    # 4. Two labels on top of each other.
    for i in range(len(texts)):
        for j in range(i + 1, len(texts)):
            area = intersect(texts[i]["box"], texts[j]["box"])
            if area > 4:
                add("WARN", "label-collision",
                    "labels %r and %r overlap by %.0fpx^2"
                    % (texts[i]["content"], texts[j]["content"], area))

    # 5. A label wider than the shape that owns it. Only checked when the text can be
    #    matched to a shape outline, because a title or a note legitimately has none.
    by_cls = {s["cls"]: s for s in shapes}
    for t in texts:
        owner = t.get("owner")
        if not owner:
            continue
        s = by_cls.get(owner.split(" ")[0])
        if s and not contains(s["box"], t["box"]):
            add("WARN", "label-overflows-shape",
                "label %r extends past its shape -- D2 does not wrap text, so break it "
                "with \\n" % t["content"])

    # 6. Text too small to read once the diagram is scaled into a document.
    tiny = [t for t in texts if t.get("size") and t["size"] < 9]
    if tiny:
        add("WARN", "tiny-text",
            "%d label(s) render below 9px and will be unreadable when scaled down"
            % len(tiny))

    # 7. A canvas so lopsided that it will be shrunk to nothing in any document.
    if root.get("w") and root.get("h"):
        ratio = max(root["w"], root["h"]) / max(1.0, min(root["w"], root["h"]))
        if ratio > 6:
            add("WARN", "aspect-ratio",
                "canvas is %.1f:1 -- usually the wrong `direction`, or a container that "
                "wants splitting" % ratio)

    return findings


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("svg", help="the rendered .svg to look at")
    ap.add_argument("--out-dir", help="where to write the screenshot (default: beside the svg)")
    ap.add_argument("--session", default="d2review", help="playwright-cli session name")
    ap.add_argument("--json", action="store_true")
    ap.add_argument("--keep-open", action="store_true",
                    help="leave the browser open so you can poke at it yourself")
    args = ap.parse_args()

    svg = Path(args.svg).resolve()
    if not svg.is_file():
        print("no such file: " + str(svg), file=sys.stderr)
        return 2
    if shutil.which("playwright-cli") is None:
        print("playwright-cli not found on PATH -- install it, or fall back to\n"
              "  python scripts/rasterize.py " + svg.name + " --scale 1\n"
              "and look at the PNG yourself.", file=sys.stderr)
        return 2

    out_dir = Path(args.out_dir).resolve() if args.out_dir else svg.parent
    out_dir.mkdir(parents=True, exist_ok=True)
    png = out_dir / (svg.stem + ".review.png")

    work = Path(tempfile.mkdtemp(prefix="d2review-"))
    try:
        # Inline the SVG into a wrapper page. `<img>` would render it but give no DOM
        # access, and a bare .svg document never fires its load event.
        markup = svg.read_text(encoding="utf-8", errors="replace")
        markup = re.sub(r"<\?xml[^>]*\?>", "", markup, count=1).strip()
        (work / "review.html").write_text(
            "<!doctype html><meta charset='utf-8'>"
            "<style>html,body{margin:0;padding:0;background:#fff}</style>"
            "<body>" + markup + "</body>", encoding="utf-8")

        port = free_port()
        httpd = serve(work, port)
        try:
            pw(args.session, "open", "http://127.0.0.1:%d/review.html" % port)

            # Size the window to the diagram before measuring or shooting. The default
            # 1280x720 viewport silently crops a tall diagram -- a 2183px-tall pipeline
            # came back as its own top-left corner, which looks like a rendered image
            # and is not one. Capped so a pathological canvas cannot ask for a
            # 30,000px window.
            dims = svg_natural_size(markup)
            if dims:
                w, h = dims
                pw(args.session, "resize",
                   str(min(int(w) + 40, 4000)), str(min(int(h) + 40, 6000)), timeout=60)

            probe = pw(args.session, "eval", one_line(PROBE))
            data = parse_result(probe.stdout)
            if data is None:
                print("the probe did not return geometry. playwright-cli said:\n"
                      + (probe.stdout or probe.stderr)[:600], file=sys.stderr)
                return 2
            shot = pw(args.session, "screenshot", "--filename=" + str(png))
            got_png = png.is_file()
        finally:
            httpd.shutdown()
            if not args.keep_open:
                pw(args.session, "close", timeout=60)
    finally:
        shutil.rmtree(work, ignore_errors=True)

    findings = analyse(data)
    critical = [f for f in findings if f["severity"] == "CRITICAL"]

    if args.json:
        print(json.dumps({"svg": str(svg), "png": str(png) if got_png else None,
                          "counts": data.get("counts", {}), "findings": findings}, indent=2))
        return 1 if critical else 0

    c = data.get("counts", {})
    print("VISUAL REVIEW  " + svg.name)
    print("  drawn: %d shapes, %d labels, %d icons, %d markdown blocks"
          % (c.get("shape", 0), c.get("text", 0), c.get("image", 0), c.get("fo", 0)))
    root = data.get("root") or {}
    if root.get("w"):
        print("  canvas: %.0f x %.0f px" % (root["w"], root["h"]))
    if got_png:
        print("  screenshot: " + str(png))

    if not findings:
        print("\n  no geometric defects found.")
    else:
        print("")
        for f in findings:
            print("  [%s] %s" % (f["severity"], f["check"]))
            print("      " + f["detail"])

    print("\n  Geometry is only half of it. OPEN THE PNG -- balance, reading order and")
    print("  whether the diagram answers the question are not measurable.")
    return 1 if critical else 0


if __name__ == "__main__":
    sys.exit(main())
