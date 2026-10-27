"""Shared Playwright harness for the svg-smith scripts.

Everything here runs headless Chromium against a real SVG DOM, because that is the
only way to get answers that match what a viewer will actually see: getBBox()
resolves transforms, clips and text metrics that no amount of XML parsing will.
"""
from __future__ import annotations
import base64, json, re, sys
from pathlib import Path

try:
    from playwright.sync_api import sync_playwright
except ImportError:
    sys.exit("playwright is not installed. Run:  pip install playwright && playwright install chromium")

BG = {"light": "#ffffff", "dark": "#111111", "mid": "#808080"}


def resolve_bg(name: str) -> str:
    return BG.get(name, name if name.startswith("#") else "#ffffff")


def read_svg(path) -> str:
    t = Path(path).read_text(encoding="utf-8")
    if "<svg" not in t:
        raise SystemExit(f"{path}: does not look like an SVG")
    return t


def svg_tag(text: str):
    """Return (start, end) of the opening <svg ...> tag.

    Do NOT reach for text.split(">")[0] to inspect the root: a file beginning with an XML
    declaration (<?xml version="1.0"?>) hands you the declaration instead, so an attribute
    check on it always reports "missing" and you cheerfully add a duplicate. A second xmlns
    makes the document invalid and the image silently never loads.
    """
    i = text.find("<svg")
    if i < 0:
        return None
    j = text.find(">", i)
    return (i, j + 1) if j > 0 else None


def ensure_root_attr(text: str, attr: str, value: str) -> str:
    """Add attr=value to the <svg> element only if that element lacks it."""
    span = svg_tag(text)
    if not span:
        return text
    tag = text[span[0]:span[1]]
    if f"{attr}=" in tag:
        return text
    return text[:span[0]] + tag[:4] + f' {attr}="{value}"' + tag[4:] + text[span[1]:]


def data_uri(svg_text: str) -> str:
    b = base64.b64encode(svg_text.encode("utf-8")).decode("ascii")
    return "data:image/svg+xml;base64," + b


class Harness:
    """Context manager owning one browser for a batch of operations."""

    def __init__(self, width=1200, height=1200):
        self._pw = None
        self._browser = None
        self.size = (width, height)

    def __enter__(self):
        self._pw = sync_playwright().start()
        self._browser = self._pw.chromium.launch()
        return self

    def __exit__(self, *exc):
        if self._browser:
            self._browser.close()
        if self._pw:
            self._pw.stop()

    def page(self, width=None, height=None):
        w, h = self.size
        return self._browser.new_page(
            viewport={"width": width or w, "height": height or h},
            device_scale_factor=1,
        )

    def inline(self, svg_text: str):
        """Load the SVG inline so the live SVG DOM (getBBox, getCTM) is queryable."""
        pg = self.page()
        pg.set_content("<body style='margin:0'><div id='host'></div></body>")
        pg.evaluate("t => { document.getElementById('host').innerHTML = t; }", svg_text)
        return pg


MEASURE_JS = r"""
() => {
  const svg = document.querySelector('#host svg');
  if (!svg) return {error: 'no svg root found'};
  const rendered = [...svg.querySelectorAll('path,rect,circle,ellipse,polygon,polyline,line,text,image')]
    .filter(e => !e.closest('defs') && !e.closest('clipPath') && !e.closest('mask'));
  const inv = svg.getScreenCTM() ? svg.getScreenCTM().inverse() : null;
  const box = (e) => {
    let b; try { b = e.getBBox(); } catch (_) { return null; }
    if (!inv || !e.getScreenCTM()) return {x:b.x,y:b.y,w:b.width,h:b.height};
    const m = inv.multiply(e.getScreenCTM());
    const pts = [[b.x,b.y],[b.x+b.width,b.y],[b.x,b.y+b.height],[b.x+b.width,b.y+b.height]]
      .map(([x,y]) => { const p = svg.createSVGPoint(); p.x=x; p.y=y; return p.matrixTransform(m); });
    const xs = pts.map(p=>p.x), ys = pts.map(p=>p.y);
    return {x:Math.min(...xs), y:Math.min(...ys),
            w:Math.max(...xs)-Math.min(...xs), h:Math.max(...ys)-Math.min(...ys)};
  };
  const els = rendered.map((e,i) => {
    const b = box(e);
    return b ? {i, tag:e.tagName, id:e.id||null,
                cls:e.getAttribute('class')||null,
                fill:e.getAttribute('fill')||null,
                x:+b.x.toFixed(3), y:+b.y.toFixed(3), w:+b.w.toFixed(3), h:+b.h.toFixed(3)} : null;
  }).filter(Boolean);
  let X0=1e9,Y0=1e9,X1=-1e9,Y1=-1e9;
  els.forEach(e => { X0=Math.min(X0,e.x); Y0=Math.min(Y0,e.y);
                     X1=Math.max(X1,e.x+e.w); Y1=Math.max(Y1,e.y+e.h); });
  const art = els.length ? {x:+X0.toFixed(3), y:+Y0.toFixed(3),
                            w:+(X1-X0).toFixed(3), h:+(Y1-Y0).toFixed(3)} : null;
  const texts = [...svg.querySelectorAll('text')].map(t => ({
    content:(t.textContent||'').trim().slice(0,40),
    fontFamily:(getComputedStyle(t).fontFamily||'').slice(0,90)}));
  const images = [...svg.querySelectorAll('image')].map(im => {
    const h = im.getAttribute('href') || im.getAttribute('xlink:href') || '';
    return {kind: h.startsWith('data:') ? 'embedded-'+(h.slice(5).split(';')[0]||'?') : 'external',
            bytes: h.length};
  });
  return {
    viewBox: svg.getAttribute('viewBox'),
    width: svg.getAttribute('width'), height: svg.getAttribute('height'),
    artwork: art,
    aspect: art && art.h ? +(art.w/art.h).toFixed(4) : null,
    elementCount: els.length,
    elements: els,
    ids: [...svg.querySelectorAll('[id]')].map(e=>e.id),
    // Split on non-identifier runs rather than whitespace: it needs no backslash,
    // which cannot survive the JS-string-inside-Python-string quoting intact.
    classes: [...new Set([...svg.querySelectorAll('[class]')].flatMap(e =>
      (e.getAttribute('class')||'').split(/[^A-Za-z0-9_-]+/).filter(Boolean)))],
    styleBlocks: svg.querySelectorAll('style').length,
    gradients: svg.querySelectorAll('linearGradient,radialGradient').length,
    clipPaths: svg.querySelectorAll('clipPath').length,
    masks: svg.querySelectorAll('mask').length,
    filters: svg.querySelectorAll('filter').length,
    texts, images,
  };
}
"""


def measure(h: "Harness", svg_text: str) -> dict:
    pg = h.inline(svg_text)
    try:
        return pg.evaluate(MEASURE_JS)
    finally:
        pg.close()


def rasterize_inline(h: "Harness", svg_text: str, px: int, bg: str,
                     color: str = "#111111", scheme: str | None = None):
    """Render with the SVG INLINE in the DOM, inheriting `color`.

    An SVG loaded through <img> is an isolated document: it inherits nothing, so
    fill="currentColor" falls back to black no matter what the page says. That makes the
    <img> path structurally unable to test a recolourable mark -- the exact claim a mono
    icon set is making. Inlining is the only way to prove it.
    """
    pg = h.page(px, px)
    if scheme:
        pg.emulate_media(color_scheme=scheme)
    pg.set_content(
        f"<body style='margin:0;background:{bg};color:{color}'>"
        f"<div id='host' style='width:{px}px;height:{px}px;display:flex'></div></body>")
    pg.evaluate("""([t, px]) => {
        const h = document.getElementById('host');
        h.innerHTML = t;
        const s = h.querySelector('svg');
        if (s) { s.setAttribute('width', px); s.setAttribute('height', px);
                 s.style.display = 'block'; }
    }""", [svg_text, px])
    shot = pg.screenshot(type="png")
    pg.close()
    return shot


def rasterize(h: "Harness", svg_text: str, px: int, bg: str, scheme: str | None = None):
    """Render the SVG fitted into a px-by-px box on `bg`; return PNG bytes.

    `scheme` ("light"/"dark") emulates the OS colour-scheme preference. Painting a dark
    backdrop is NOT the same thing: an SVG that themes itself via a
    prefers-color-scheme media query will render its LIGHT artwork on your dark
    backdrop and look fine while actually being invisible in real dark mode.
    """
    pg = h.page(px, px)
    if scheme:
        pg.emulate_media(color_scheme=scheme)
    pg.set_content(
        f"<body style='margin:0;background:{bg}'>"
        f"<img id='i' style='display:block;width:{px}px;height:{px}px;object-fit:contain' src='{data_uri(svg_text)}'></body>"
    )
    pg.wait_for_function("() => { const i=document.getElementById('i'); return i && i.complete && i.naturalWidth>0; }", timeout=15000)
    # Retry once. Chromium intermittently answers Page.captureScreenshot with a bare
    # "Unable to capture screenshot" under memory pressure -- observed twice while the GPU
    # held ~29GB for another process. It is transient and unrelated to the artwork, but it
    # surfaces as a raw Playwright traceback that kills a long pipeline at its LAST step,
    # after the trace, the optimise and the placement have all already succeeded.
    try:
        shot = pg.screenshot(type="png")
    except Exception:
        pg.wait_for_timeout(750)
        shot = pg.screenshot(type="png")
    pg.close()
    return shot
