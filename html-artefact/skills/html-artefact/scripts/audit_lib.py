#!/usr/bin/env python3
"""audit_lib.py - the parsing half of audit.sh (stdlib only).

    python audit_lib.py external FILE [--folder]  # hard check: anything the page loads that is not on the allowlist
    python audit_lib.py palette  FILE [--json] # soft check: colours outside the kraft-look families (opt-in)
    python audit_lib.py contract FILE          # soft check: title, viewport, both themes, tokens on :root

Why this exists: a grep version of these two checks
(a) missed 6 of 9 real single-file violations, among them the Google Fonts snippet in its canonical
attribute order, relative <script src>, external <img> and CSS url(); and (b) flagged 28 of the 31
reference pages for the palette, partly on things that are not colours (#4888 is a PR number).
Both checks now read the page as HTML/CSS instead of grepping the bytes.

Allowlist (mirrors the Artifact tool's CSP so a page can also be published there): scripts only from
cdnjs.cloudflare.com, cdn.jsdelivr.net/npm/, unpkg.com, cdn.tailwindcss.com, code.jquery.com, each pinned to an exact
version; stylesheets only from fonts.googleapis.com (fonts from fonts.gstatic.com). Everything else remote fails.

Limits, stated so nobody trusts it further than it goes: only hex colours are checked (not rgb(),
hsl() or named colours); a hex colour built by string concatenation in JS is invisible; the external
check finds what a page *loads*, not what a script *fetches* at run time.
"""
import colorsys
import json
import os
import re
import sys
from html.parser import HTMLParser
from urllib.parse import unquote

# ---- external references -------------------------------------------------------------------------

# Attributes that make the browser load a file, per tag. Anything not data:/#-local is a dependency.
LOAD_ATTRS = {
    "script": ("src",), "img": ("src", "srcset"), "source": ("src", "srcset"),
    "video": ("src", "poster"), "audio": ("src",), "iframe": ("src",), "embed": ("src",),
    "object": ("data",), "input": ("src",), "track": ("src",),
}
LOAD_RELS = {"stylesheet", "preload", "prefetch", "modulepreload", "icon", "shortcut", "apple-touch-icon",
             "manifest", "preconnect", "dns-prefetch"}
LOCAL_PREFIXES = ("data:", "#", "about:", "blob:")
CSS_REF = re.compile(r"""@import\s+(?:url\(\s*)?['"]?([^'")\s;]+)|url\(\s*['"]?([^'")]+?)['"]?\s*\)""", re.I)
JS_REF = re.compile(r"""\bimport\s*(?:[^;'"`]*?\bfrom\s*)?['"`]((?:https?:)?//[^'"`]+)|\bimport\(\s*['"`]((?:https?:)?//[^'"`]+)|\bimportScripts\(\s*['"`]([^'"`]+)""", re.I)


def _is_external(value):
    v = value.strip()
    return bool(v) and not v.lower().startswith(LOCAL_PREFIXES)


class _Scan(HTMLParser):
    """Collect external refs, plus the style/script text and style-ish attributes the palette check reads."""

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.refs = []            # (line, what, value)
        self.style_blocks = []    # CSS text from <style>
        self.style_attrs = []     # CSS text from style="..."
        self.paint_attrs = []     # values of fill=, stroke=, ...
        self.script_blocks = []   # JS text from inline <script>
        self._in = None

    PAINT = {"fill", "stroke", "stop-color", "flood-color", "lighting-color", "color", "bgcolor", "text",
             "link", "vlink", "alink"}

    def handle_starttag(self, tag, attrs):
        a = {k: (v or "") for k, v in attrs}
        line = self.getpos()[0]
        for k in LOAD_ATTRS.get(tag, ()):
            if k in a and tag != "input":
                for part in (a[k].split(",") if k == "srcset" else [a[k]]):
                    url = part.strip().split(" ")[0]
                    if _is_external(url):
                        self.refs.append((line, f"<{tag} {k}>", url))
            elif k in a and tag == "input" and a.get("type", "").lower() == "image" and _is_external(a[k]):
                self.refs.append((line, "<input src>", a[k]))
        if tag == "link" and "href" in a:
            rels = set(a.get("rel", "").lower().split())
            if rels & LOAD_RELS and _is_external(a["href"]):
                self.refs.append((line, f"<link rel={a.get('rel','')}>", a["href"]))
        if tag == "use":
            for k in ("href", "xlink:href"):
                if k in a and _is_external(a[k]):
                    self.refs.append((line, "<use>", a[k]))
        if "style" in a:
            self.style_attrs.append(a["style"])
            for m in CSS_REF.finditer(a["style"]):
                u = m.group(1) or m.group(2)
                if u and _is_external(u):
                    self.refs.append((line, "style= url()", u))
        for k in self.PAINT & set(a):
            self.paint_attrs.append(a[k])
        if tag in ("style", "script"):
            self._in = tag

    def handle_endtag(self, tag):
        if tag in ("style", "script"):
            self._in = None

    def handle_data(self, data):
        if self._in == "style":
            self.style_blocks.append(data)
            line = self.getpos()[0]
            for m in CSS_REF.finditer(data):
                u = m.group(1) or m.group(2)
                if u and _is_external(u):
                    self.refs.append((line, "css @import/url()", u))
        elif self._in == "script":
            self.script_blocks.append(data)
            line = self.getpos()[0]
            for m in JS_REF.finditer(data):
                u = next(g for g in m.groups() if g)
                self.refs.append((line, "script import", u))


def scan(text):
    s = _Scan()
    s.feed(text)
    s.close()
    return s


REMOTE = re.compile(r"^(?:[a-z][a-z0-9+.-]*:|//)", re.I)

SCRIPT_HOSTS = ("cdnjs.cloudflare.com", "cdn.jsdelivr.net/npm/", "unpkg.com", "cdn.tailwindcss.com", "code.jquery.com")
FONT_CSS_HOSTS = ("fonts.googleapis.com",)
FONT_FILE_HOSTS = ("fonts.gstatic.com",)
PINNED = re.compile(r"(?:/libs/[^/]+/|@|/)v?\d+\.\d+(?:\.\d+)?(?:[-+.\w]*)?(?:/|$|\?)")


def _strip(url):
    return re.sub(r"^(?:https?:)?//", "", url.strip(), flags=re.I)


def _remote_verdict(what, url):
    """-> None if the remote URL is allowed, else the reason it fails."""
    if not url.strip().lower().startswith(("https://", "//")):
        return "not https"
    bare = _strip(url).lower()
    host = bare.split("/")[0]
    if what == "<script src>":
        if not any(bare.startswith(h) for h in SCRIPT_HOSTS):
            return "script host is not on the allowlist (cdnjs, jsdelivr/npm, unpkg, tailwind CDN, jquery CDN)"
        if not PINNED.search("/" + (bare.split("/", 1)[1] if "/" in bare else "")):
            return "library version is not pinned (use an exact version such as react/18.3.1)"
        return None
    if what.startswith("<link rel=") and "stylesheet" in what:
        return None if host in FONT_CSS_HOSTS else "stylesheets may only come from fonts.googleapis.com; inline the CSS"
    if what.startswith("<link rel=") and any(r in what for r in ("preconnect", "dns-prefetch", "preload")):
        return None if host in FONT_CSS_HOSTS + FONT_FILE_HOSTS else "only the Google Fonts hosts may be hinted"
    if what == "css @import/url()":
        return None if host in FONT_CSS_HOSTS + FONT_FILE_HOSTS else "CSS may only load Google Fonts; inline or use a data: URI"
    return "this kind of load is blocked for remote hosts; embed it as a data: URI or inline it"


def cmd_external(text, folder=False, base="."):
    """A remote URL fails unless it is on the allowlist (Google Fonts, pinned CDN scripts). A relative file
    fails too - unless the page is deliberately a folder (--folder): then it must exist next to the page."""
    s = scan(text)
    seen, refs = set(), []
    for r in s.refs:
        if r not in seen:
            seen.add(r)
            refs.append(r)
    remote = [r for r in refs if REMOTE.match(r[2].strip())]
    local = [r for r in refs if not REMOTE.match(r[2].strip())]
    problems, allowed = [], []
    for line, what, url in remote:
        why = _remote_verdict(what, url)
        if why:
            problems.append((line, what + " - " + why, url))
        else:
            allowed.append(url)
    present = set()
    if folder:
        for line, what, url in local:
            rel = unquote(re.split(r"[?#]", url.strip())[0])
            if os.path.exists(os.path.join(base, rel)):
                present.add(rel)
            else:
                problems.append((line, what + " - file not found next to the page", url))
    else:
        problems += local
    if not problems:
        notes = []
        if allowed:
            notes.append(f"{len(allowed)} allowlisted remote load(s) (Google Fonts / pinned CDN script): the page needs internet to look right")
        if present:
            notes.append(f"folder mode: {len(present)} local file(s) referenced, all present (the page needs its folder to travel with it)")
        print("OK — " + ("; ".join(notes) if notes else "no external dependencies"))
        return 0
    print("FAIL — a load that is not allowed (allowed: Google Fonts, pinned scripts from cdnjs / jsdelivr / unpkg / tailwind / jquery):")
    for line, what, url in problems:
        print(f"  line {line}: {what} -> {url}")
    if not folder and local and not any(REMOTE.match(r[2].strip()) for r in problems):
        print("  (if this page is deliberately a folder with its assets, audit it with --folder)")
    return 1


# ---- page contract (soft) ------------------------------------------------------------------------

def cmd_contract(text):
    """Warnings only: the craft rules a local file can break without any error."""
    warns = []
    m = re.search(r"<title[^>]*>(.*?)</title>", text[:8192], re.I | re.S)
    if not m or not m.group(1).strip():
        warns.append("no <title> in the first 8 KB: give the page a name (2 to 4 words)")
    else:
        t = m.group(1).strip()
        if re.search(r"[:\u2013\u2014]|\s-\s", t):
            warns.append(f"title '{t}' has an explainer after a dash or colon: keep only the name")
        elif len(t.split()) > 6:
            warns.append(f"title '{t}' is long: a name is usually 2 to 4 words")
    if not re.search(r"<meta[^>]+name=[\"']viewport[\"']", text, re.I):
        warns.append("no viewport meta: the page will not scale on a phone")
    sc = scan(text)
    css = "\n".join(sc.style_blocks)
    if "prefers-color-scheme" not in css and 'data-theme' not in css:
        warns.append("one theme only: add dark values under prefers-color-scheme and [data-theme], or say it is a deliberate single look")
    if not re.search(r":root\s*\{[^}]*--[\w-]+\s*:", css):
        warns.append("no colour tokens on :root: declare the palette as custom properties first")
    if not re.search(r"\bbody\s*\{[^}]*background", css) and not re.search(r"\bhtml\s*,\s*body\s*\{[^}]*background", css):
        warns.append("body has no explicit background: set it from a token")
    if re.search(r"min-height\s*:\s*100vh|height\s*:\s*100vh", css):
        warns.append("100vh found: a full-screen opener pushes content out of the first view; size to content unless this is an app shell")
    if warns:
        print("WARN — page contract (Artifact design rules):")
        for w in warns:
            print("  - " + w)
    else:
        print("OK — title, viewport, both themes, colour tokens and body background present")
    return 0


# ---- palette -------------------------------------------------------------------------------------

# The kraft-look palette (thariq-palette.css). Used only when the page is audited with --kraft-look.
PALETTE = {"FAF9F5", "FFFFFF", "000000", "141413", "D97757", "B85C3E", "E3DACC", "788C5D", "F0EEE6", "D1CFC5",
           "87867F", "3D3D3A", "2A2A28", "C8A772", "6B5C9E"}
HEX = re.compile(r"(?<![\w&#/])#((?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{4}|[0-9a-fA-F]{3}))(?![0-9a-zA-Z_-])")
CSS_WORDS = re.compile(r"color|background|border|shadow|fill|stroke|gradient|outline|filter|rgba?\(|hsla?\(", re.I)


def _norm(h):
    h = h.upper()
    if len(h) in (3, 4):
        h = "".join(c * 2 for c in h[:3])
    return h[:6]


def _declarations(css):
    """Text inside {...} blocks only: selectors such as #fade or #bad{} are not colours."""
    css = re.sub(r"/\*.*?\*/", "", css, flags=re.S)
    out = []
    for m in re.finditer(r"([^{}]*)([{}])", css):
        if m.group(2) == "}":
            out.append(m.group(1))
    return re.sub(r"url\([^)]*\)", "", " ".join(out))


def _script_colours(js):
    js = re.sub(r"/\*.*?\*/", "", js, flags=re.S)
    js = re.sub(r"(?m)(^|[\s;,{(])//[^\n]*", r"\1", js)
    found = []
    for lit in re.finditer(r"""'(?:\\.|[^'\\\n])*'|"(?:\\.|[^"\\\n])*"|`(?:\\.|[^`\\])*`""", js):
        body = lit.group(0)[1:-1]
        if re.fullmatch(r"#[0-9a-fA-F]{3,8}", body) or CSS_WORDS.search(body):
            found += HEX.findall(body)
    return found


def classify(h6):
    """-> (family, hue, saturation). Family 'off' means worth a look."""
    if h6 in PALETTE:
        return "palette", 0, 0
    r, g, b = (int(h6[i:i + 2], 16) for i in (0, 2, 4))
    if max(r, g, b) - min(r, g, b) <= 36:
        return "neutral", 0, 0
    hue, light, sat = colorsys.rgb_to_hls(r / 255, g / 255, b / 255)
    hue *= 360
    if sat <= 0.70 and (hue <= 150 or hue >= 345):
        return "muted", round(hue), round(sat * 100)   # clay, rust, tan, olive and their tints
    return "off", round(hue), round(sat * 100)


def cmd_palette(text, as_json=False):
    s = scan(text)
    raw = []
    for css in s.style_blocks:
        raw += HEX.findall(_declarations(css))
    for css in s.style_attrs:
        raw += HEX.findall(re.sub(r"url\([^)]*\)", "", css))
    for v in s.paint_attrs:
        raw += HEX.findall(v)
    for js in s.script_blocks:
        raw += _script_colours(js)
    counts = {}
    off = {}
    for h in raw:
        n = _norm(h)
        fam, hue, sat = classify(n)
        counts[fam] = counts.get(fam, 0) + 0
        if fam == "off":
            off[n] = (hue, sat)
    distinct = {_norm(h) for h in raw}
    fam_n = {}
    for n in distinct:
        fam_n[classify(n)[0]] = fam_n.get(classify(n)[0], 0) + 1
    if as_json:
        print(json.dumps({"distinct": len(distinct), "families": fam_n,
                          "off": {f"#{k}": {"hue": v[0], "sat": v[1]} for k, v in sorted(off.items())}}))
        return 0
    if not off:
        print(f"OK — {len(distinct)} distinct colours, all in the house families "
              f"({fam_n.get('palette', 0)} palette, {fam_n.get('neutral', 0)} neutral, {fam_n.get('muted', 0)} muted warm/green)")
        return 0
    print(f"WARN — {len(off)} colour(s) outside the house families (muted clay / rust / tan / olive and tinted neutrals are fine; "
          f"blue, purple, cyan or saturated colours are flagged). Intentional? If it is load-bearing, leave it:")
    for n, (hue, sat) in sorted(off.items()):
        print(f"  #{n}  hue {hue}°, saturation {sat}%")
    return 0


def main(argv):
    if len(argv) < 3 or argv[1] not in ("external", "palette", "contract"):
        print(__doc__)
        return 2
    with open(argv[2], encoding="utf-8", errors="replace") as fh:
        text = fh.read()
    if argv[1] == "external":
        return cmd_external(text, folder="--folder" in argv[3:], base=os.path.dirname(os.path.abspath(argv[2])))
    if argv[1] == "contract":
        return cmd_contract(text)
    return cmd_palette(text, "--json" in argv[3:])


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    sys.exit(main(sys.argv))
