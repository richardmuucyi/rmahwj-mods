#!/usr/bin/env python3
"""Extract per-chapter markdown files from an EPUB.

Usage:
    python3 extract_epub.py <epub-path> <output-dir> [--no-skip]

Output:
    <output-dir>/NN-<slug>.md  — one file per spine item
    <output-dir>/_skipped/NN-<slug>.md  — TOC/cover/copyright items (quarantined)
    <output-dir>/_manifest.json — list of {slug, title, char_count, source_xhtml, skipped}

TOC/cover/nav/copyright spine items are auto-quarantined to `_skipped/` by default —
EPUB TOCs duplicate every chapter heading, which would cause "second occurrence"
bugs downstream. Pass --no-skip to disable the filter and write everything flat.

Dependencies: beautifulsoup4 (pip install beautifulsoup4).
Falls back to a basic HTML parser if bs4 is unavailable, but quality is worse.
"""
import json
import os
import re
import sys
import zipfile
from html.parser import HTMLParser
from xml.etree import ElementTree as ET

# Spine items matching these path patterns are quarantined to _skipped/.
# Order: most specific first.
SKIP_PATH_PATTERNS = [
    r"(?:^|/)(?:toc|nav|cover|copyright|titlepage|colophon|dedication|copyright-page)\b",
    r"\bcover\.x?html?$",
    r"\btitle(?:page)?\.x?html?$",
]
# Spine items below this char count after extraction are also quarantined
# (typically front-matter like "Praise for...", series listings, ISBN pages).
SKIP_BELOW_CHARS = 500

try:
    from bs4 import BeautifulSoup
    HAVE_BS4 = True
except ImportError:
    HAVE_BS4 = False


NS = {
    "opf": "http://www.idpf.org/2007/opf",
    "dc": "http://purl.org/dc/elements/1.1/",
    "container": "urn:oasis:names:tc:opendocument:xmlns:container",
}


def slugify(text: str, max_len: int = 60) -> str:
    text = text.lower()
    text = re.sub(r"[^a-z0-9]+", "-", text)
    text = text.strip("-")
    return text[:max_len] or "untitled"


def find_opf_path(zf: zipfile.ZipFile) -> str:
    """Read META-INF/container.xml to find the OPF manifest path."""
    with zf.open("META-INF/container.xml") as f:
        tree = ET.parse(f)
    rootfile = tree.find(".//container:rootfile", NS)
    if rootfile is None:
        raise RuntimeError("No rootfile in META-INF/container.xml")
    return rootfile.attrib["full-path"]


def parse_opf(zf: zipfile.ZipFile, opf_path: str):
    """Return (title, author, spine_paths) — spine_paths are zip-relative paths in reading order."""
    with zf.open(opf_path) as f:
        tree = ET.parse(f)
    root = tree.getroot()
    title_el = root.find(".//dc:title", NS)
    author_el = root.find(".//dc:creator", NS)
    title = title_el.text.strip() if title_el is not None and title_el.text else "Untitled"
    author = author_el.text.strip() if author_el is not None and author_el.text else "Unknown"

    # Build id → href map from manifest
    manifest = {}
    for item in root.findall(".//opf:manifest/opf:item", NS):
        manifest[item.attrib["id"]] = item.attrib["href"]

    # Spine references manifest ids
    opf_dir = os.path.dirname(opf_path)
    spine_paths = []
    for itemref in root.findall(".//opf:spine/opf:itemref", NS):
        idref = itemref.attrib["idref"]
        href = manifest.get(idref)
        if href is None:
            continue
        # spine paths are relative to OPF dir
        zip_path = os.path.normpath(os.path.join(opf_dir, href)) if opf_dir else href
        spine_paths.append(zip_path.replace("\\", "/"))
    return title, author, spine_paths


class TextExtractor(HTMLParser):
    """Fallback HTML → markdown-ish converter when bs4 isn't available."""
    BLOCK_TAGS = {"p", "h1", "h2", "h3", "h4", "li", "blockquote", "div"}
    HEADING_PREFIX = {"h1": "## ", "h2": "## ", "h3": "### ", "h4": "#### "}

    def __init__(self):
        super().__init__()
        self.out = []
        self.cur = []
        self.stack = []
        self.title = ""

    def handle_starttag(self, tag, attrs):
        self.stack.append(tag)
        if tag in self.BLOCK_TAGS:
            self._flush()

    def handle_endtag(self, tag):
        if self.stack and self.stack[-1] == tag:
            self.stack.pop()
        if tag in self.BLOCK_TAGS:
            text = "".join(self.cur).strip()
            if text:
                if tag in self.HEADING_PREFIX:
                    if not self.title:
                        self.title = text
                    self.out.append(f"\n{self.HEADING_PREFIX[tag]}{text}\n")
                elif tag == "li":
                    self.out.append(f"- {text}")
                elif tag == "blockquote":
                    self.out.append(f"> {text}")
                else:
                    self.out.append(text)
            self.cur = []

    def handle_data(self, data):
        # skip script/style content
        if self.stack and self.stack[-1] in ("script", "style"):
            return
        self.cur.append(data)

    def _flush(self):
        text = "".join(self.cur).strip()
        if text:
            self.out.append(text)
        self.cur = []

    def get_body(self):
        self._flush()
        body = "\n\n".join(self.out)
        body = re.sub(r"\n{3,}", "\n\n", body)
        return self.title, body


def extract_chapter(html_bytes: bytes) -> tuple[str, str]:
    """Return (title, markdown_body)."""
    if HAVE_BS4:
        soup = BeautifulSoup(html_bytes, "html.parser")
        for tag in soup(["script", "style"]):
            tag.decompose()
        title = ""
        h = soup.find(["h1", "h2"])
        if h:
            title = h.get_text(" ", strip=True)
        elif soup.title:
            title = soup.title.get_text(" ", strip=True)
        parts = []
        for el in soup.find_all(["h1", "h2", "h3", "h4", "p", "li", "blockquote"]):
            text = el.get_text(" ", strip=True)
            if not text:
                continue
            if el.name in ("h1", "h2"):
                parts.append(f"\n## {text}\n")
            elif el.name == "h3":
                parts.append(f"\n### {text}\n")
            elif el.name == "h4":
                parts.append(f"\n#### {text}\n")
            elif el.name == "li":
                parts.append(f"- {text}")
            elif el.name == "blockquote":
                parts.append(f"> {text}")
            else:
                parts.append(text)
        body = "\n\n".join(parts)
        body = re.sub(r"\n{3,}", "\n\n", body)
        return title, body
    else:
        ex = TextExtractor()
        ex.feed(html_bytes.decode("utf-8", errors="replace"))
        return ex.get_body()


def should_skip(zpath: str, char_count: int) -> tuple[bool, str]:
    """Return (skip, reason). Quarantines TOC/nav/cover/boilerplate spine items."""
    low = zpath.lower()
    for pat in SKIP_PATH_PATTERNS:
        if re.search(pat, low):
            return True, f"path matches /{pat}/"
    if char_count < SKIP_BELOW_CHARS:
        return True, f"only {char_count} chars (boilerplate threshold {SKIP_BELOW_CHARS})"
    return False, ""


def parse_args(argv):
    no_skip = False
    positional = []
    for a in argv[1:]:
        if a == "--no-skip":
            no_skip = True
        elif a.startswith("-"):
            print(f"ERROR: unknown flag {a}", file=sys.stderr)
            sys.exit(1)
        else:
            positional.append(a)
    if len(positional) != 2:
        print("Usage: extract_epub.py <epub-path> <output-dir> [--no-skip]", file=sys.stderr)
        sys.exit(1)
    return positional[0], positional[1], no_skip


def main():
    epub_path, out_dir, no_skip = parse_args(sys.argv)
    if not os.path.exists(epub_path):
        print(f"ERROR: {epub_path} not found", file=sys.stderr)
        sys.exit(1)
    if not zipfile.is_zipfile(epub_path):
        print(f"ERROR: {epub_path} is not a valid ZIP (EPUB)", file=sys.stderr)
        sys.exit(1)
    os.makedirs(out_dir, exist_ok=True)
    skipped_dir = os.path.join(out_dir, "_skipped")

    with zipfile.ZipFile(epub_path) as zf:
        opf_path = find_opf_path(zf)
        title, author, spine = parse_opf(zf, opf_path)
        print(f"Book: {title} — {author}", file=sys.stderr)
        print(f"Spine items: {len(spine)}  (skip-filter: {'OFF (--no-skip)' if no_skip else 'ON'})",
              file=sys.stderr)
        if not HAVE_BS4:
            print("Note: bs4 not installed; using fallback HTML parser. "
                  "`pip install beautifulsoup4` for better extraction.", file=sys.stderr)

        manifest = []
        n_skipped = 0
        for i, zpath in enumerate(spine):
            try:
                with zf.open(zpath) as f:
                    raw = f.read()
            except KeyError:
                print(f"  WARN: spine entry {zpath} not in zip; skipping", file=sys.stderr)
                continue
            chap_title, body = extract_chapter(raw)
            if not chap_title:
                chap_title = os.path.splitext(os.path.basename(zpath))[0]
            slug = slugify(chap_title)
            out_name = f"{i:02d}-{slug}.md"

            skip, reason = (False, "")
            if not no_skip:
                skip, reason = should_skip(zpath, len(body))
            target_dir = out_dir
            if skip:
                os.makedirs(skipped_dir, exist_ok=True)
                target_dir = skipped_dir
                n_skipped += 1

            out_path = os.path.join(target_dir, out_name)
            with open(out_path, "w", encoding="utf-8") as out:
                out.write(f"# {chap_title}\n\n{body}\n")
            manifest.append({
                "slug": out_name,
                "title": chap_title,
                "char_count": len(body),
                "source_xhtml": zpath,
                "skipped": skip,
                "skip_reason": reason if skip else None,
            })
            marker = "  [SKIP]" if skip else "        "
            print(f"{marker} {out_name:50s}  {len(body):>7d} chars  {chap_title[:60]}",
                  file=sys.stderr)
            if skip:
                print(f"           ↳ {reason}", file=sys.stderr)

        manifest_path = os.path.join(out_dir, "_manifest.json")
        with open(manifest_path, "w", encoding="utf-8") as f:
            json.dump({
                "book_title": title,
                "author": author,
                "epub_path": epub_path,
                "sections": manifest,
                "skipped_count": n_skipped,
            }, f, indent=2)
        kept = len(manifest) - n_skipped
        print(f"\nWrote {kept} chapter files (+ {n_skipped} quarantined in _skipped/) "
              f"+ _manifest.json to {out_dir}", file=sys.stderr)
        if n_skipped:
            print(f"Review _skipped/ — pass --no-skip to disable the filter.", file=sys.stderr)


if __name__ == "__main__":
    main()
