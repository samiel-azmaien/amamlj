#!/usr/bin/env python3
"""Build a static keyword search index from the AMAMLJ docs HTML."""
from __future__ import annotations

import json
import re
from html.parser import HTMLParser
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "assets" / "js" / "search-index.json"

PAGES = [
    {"path": "index.html", "url": "./", "page": "Overview"},
    {"path": "spec/index.html", "url": "spec/", "page": "Spec"},
    {"path": "start/index.html", "url": "start/", "page": "Getting started"},
]

# Extra terms so acronym letters and common protocol words are findable
# even when a heading uses a slightly different phrasing.
GLOBAL_ALIASES = [
    "AMAMLJ",
    "Agent",
    "Memory",
    "Audit",
    "Meaning",
    "Lineage",
    "Judgment",
    "receipt",
    "grant",
    "classifier",
    "prompt injection",
    "R0",
    "R1",
    "R2",
    "R3",
    "R4",
]

SKIP_TAGS = {"script", "style", "svg", "nav", "header"}
# We still want article content; we will only parse the article.


class TextExtractor(HTMLParser):
    def __init__(self):
        super().__init__()
        self.skip = 0
        self.parts: list[str] = []
        self.in_heading = None
        self.headings: list[tuple[str, str, str]] = []  # (tag, id, text)
        self.current_heading_text: list[str] = []
        self.current_heading_id = ""
        self.current_heading_tag = ""
        self.sections: list[dict] = []
        self.section_stack: list[dict] = []
        self.in_article = False
        self.article_depth = 0

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        cls = attrs.get("class", "")
        if tag == "article" and "docs-article" in cls:
            self.in_article = True
            self.article_depth = 1
            return
        if self.in_article and tag == "article":
            self.article_depth += 1
        if not self.in_article:
            return
        if tag in SKIP_TAGS:
            self.skip += 1
            return
        if self.skip:
            return
        if tag == "section" and "docs-section" in cls and attrs.get("id"):
            sec = {
                "id": attrs["id"],
                "toc": attrs.get("data-toc") or "",
                "heading": "",
                "text_parts": [],
            }
            self.section_stack.append(sec)
            self.sections.append(sec)
        if tag in {"h1", "h2", "h3", "h4"}:
            self.in_heading = tag
            self.current_heading_text = []
            self.current_heading_id = attrs.get("id", "")
            self.current_heading_tag = tag
        # capture ids on articles / pillars
        if tag in {"article", "li"} and attrs.get("id"):
            # will attach later if we see an h3 inside
            self._pending_id = attrs.get("id")
        if tag in {"h3", "h2"} and not attrs.get("id"):
            # inherit pending id from parent article
            if getattr(self, "_pending_id", None) and not self.current_heading_id:
                self.current_heading_id = self._pending_id

    def handle_endtag(self, tag):
        if tag == "article" and self.in_article:
            self.article_depth -= 1
            if self.article_depth <= 0:
                self.in_article = False
            return
        if not self.in_article:
            return
        if tag in SKIP_TAGS and self.skip:
            self.skip -= 1
            return
        if self.skip:
            return
        if tag in {"h1", "h2", "h3", "h4"} and self.in_heading:
            text = normalize_ws("".join(self.current_heading_text))
            # strip leading "#" anchor character if present
            text = re.sub(r"^#\s*", "", text).strip()
            hid = self.current_heading_id
            self.headings.append((tag, hid, text))
            if self.section_stack and tag == "h2" and not self.section_stack[-1]["heading"]:
                self.section_stack[-1]["heading"] = text
                if not self.section_stack[-1]["id"] and hid:
                    self.section_stack[-1]["id"] = hid
            self.in_heading = None
            self.current_heading_text = []
            self.current_heading_id = ""
            self._pending_id = None
        if tag == "section" and self.section_stack:
            self.section_stack.pop()

    def handle_data(self, data):
        if not self.in_article or self.skip:
            return
        if self.in_heading:
            self.current_heading_text.append(data)
        if self.section_stack:
            self.section_stack[-1]["text_parts"].append(data)
        else:
            self.parts.append(data)


def normalize_ws(s: str) -> str:
    return re.sub(r"\s+", " ", s).strip()


def strip_html(s: str) -> str:
    s = re.sub(r"</?(p|div|h[1-6]|li|tr|td|th|section|header|article|ul|ol|br|blockquote|pre)[^>]*>", " ", s, flags=re.I)
    s = re.sub(r"<[^>]+>", "", s)
    return unescape(normalize_ws(s))


def unescape(s: str) -> str:
    return (
        s.replace("&amp;", "&")
        .replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&quot;", '"')
        .replace("&#39;", "'")
        .replace("&nbsp;", " ")
    )


def extract_faq_entries(html: str, page: str, url: str) -> list[dict]:
    entries = []
    sect = re.search(r'<section class="docs-section"[^>]*id="faq"(.*?)</section>', html, re.S)
    if not sect:
        return entries
    for m in re.finditer(r"<details[^>]*>\s*<summary>(.*?)</summary>\s*<p>(.*?)</p>", sect.group(1), re.S):
        q = strip_html(m.group(1))
        a = strip_html(m.group(2))
        if not q:
            continue
        entries.append(
            {
                "page": page,
                "url": url,
                "anchor": "faq",
                "title": q,
                "text": a,
                "kind": "heading",
                "aliases": "",
            }
        )
    return entries


def extract_step_entries(html: str, page: str, url: str) -> list[dict]:
    entries = []
    for m in re.finditer(
        r'<li id="(step-\d+)">\s*<h3>(.*?)</h3>(.*?)</li>',
        html,
        re.S,
    ):
        title = strip_html(m.group(2))
        body = strip_html(m.group(3))
        entries.append(
            {
                "page": page,
                "url": url,
                "anchor": m.group(1),
                "title": title,
                "text": body,
                "kind": "heading",
                "aliases": "",
            }
        )
    return entries


def extract_letter_entries(html: str, page: str, url: str) -> list[dict]:
    entries = []
    for m in re.finditer(
        r'<article class="pillar" id="(letter-[a-z]+)">\s*<div class="glyph">(.+?)</div>\s*<h3>(.*?)</h3>\s*<p>(.*?)</p>',
        html,
        re.S,
    ):
        title = strip_html(m.group(3))
        body = strip_html(m.group(4))
        glyph = strip_html(m.group(2))
        entries.append(
            {
                "page": page,
                "url": url,
                "anchor": m.group(1),
                "title": title,
                "text": body,
                "kind": "heading",
                "aliases": f"{glyph} {title} AMAMLJ",
            }
        )
    return entries


def extract_h3_entries(html: str, page: str, url: str, used_anchors: set[str]) -> list[dict]:
    entries = []
    # h3 with id, plus nearby paragraph text until next heading
    for m in re.finditer(
        r'<h3([^>]*)>(.*?)</h3>(.*?)(?=<h[123]|</section>|$)',
        html,
        re.S,
    ):
        attrs = m.group(1)
        title = re.sub(r"^#\s*", "", strip_html(m.group(2))).strip()
        body = strip_html(m.group(3))
        idm = re.search(r'\bid="([^"]+)"', attrs)
        # also check preceding id= on article or li
        anchor = idm.group(1) if idm else ""
        if not anchor:
            # look at a nearby id in the heading's own <a href="#...">
            href = re.search(r'href="#([^"]+)"', m.group(2))
            if href:
                anchor = href.group(1)
        if not anchor or anchor in used_anchors:
            continue
        if not title or title == "#":
            continue
        used_anchors.add(anchor)
        entries.append(
            {
                "page": page,
                "url": url,
                "anchor": anchor,
                "title": title,
                "text": body[:4000],
                "kind": "heading",
                "aliases": "",
            }
        )
    return entries


def build():
    records = []
    for page in PAGES:
        html = (ROOT / page["path"]).read_text()
        parser = TextExtractor()
        parser.feed(html)
        used = set()


        hero_m = re.search(r'<section class="amj-hero"[^>]*>(.*?)</section>', html, re.S)
        if hero_m:
            records.append(
                {
                    "page": page["page"],
                    "url": page["url"],
                    "anchor": "",
                    "title": strip_html(re.search(r"<h1>(.*?)</h1>", hero_m.group(1), re.S).group(1)) if re.search(r"<h1>", hero_m.group(1)) else page["page"],
                    "text": strip_html(hero_m.group(1)),
                    "kind": "heading",
                    "aliases": "AMAMLJ trust layer protocol",
                }
            )

        # page intro (article header h1 + lead paragraphs before first section)
        header_m = re.search(
            r'<header class="docs-article-header[^"]*">(.*?)</header>', html, re.S
        )
        if header_m:
            header_text = strip_html(header_m.group(1))
            h1 = re.search(r"<h1>(.*?)</h1>", header_m.group(1), re.S)
            title = strip_html(h1.group(1)) if h1 else page["page"]
            records.append(
                {
                    "page": page["page"],
                    "url": page["url"],
                    "anchor": "",
                    "title": title,
                    "text": header_text,
                    "kind": "heading",
                    "aliases": "AMAMLJ",
                }
            )

        for sec in parser.sections:
            heading = unescape(sec["heading"] or normalize_ws(re.sub(r"<[^>]+>", " ", sec["toc"])))
            text = unescape(normalize_ws(" ".join(sec["text_parts"])))
            # drop the heading itself from the start of text if duplicated
            if heading and text.startswith(heading):
                text = text[len(heading) :].strip()
            # strip leading # from anchor-link heading text
            text = re.sub(r"^#\s*", "", text)
            if not heading:
                continue
            records.append(
                {
                    "page": page["page"],
                    "url": page["url"],
                    "anchor": sec["id"],
                    "title": heading,
                    "text": text,
                    "kind": "heading",
                    "aliases": "",
                }
            )
            used.add(sec["id"])

        records.extend(extract_letter_entries(html, page["page"], page["url"]))
        for rec in records[-20:]:
            if rec.get("anchor"):
                used.add(rec["anchor"])
        records.extend(extract_h3_entries(html, page["page"], page["url"], used))
        records.extend(extract_step_entries(html, page["page"], page["url"]))
        if page["url"] == "./":
            records.extend(extract_faq_entries(html, page["page"], page["url"]))

    # Dedup exact (page, anchor, title)
    seen = set()
    uniq = []
    for r in records:
        key = (r["page"], r["anchor"], r["title"])
        if key in seen:
            continue
        seen.add(key)
        # skip empty
        if not r["title"]:
            continue
        uniq.append(r)

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(uniq, ensure_ascii=False, indent=2) + "\n")
    print(f"wrote {len(uniq)} records to {OUT}")
    # sanity: required terms appear somewhere
    blob = " ".join(
        (r["title"] + " " + r["text"] + " " + r.get("aliases", "")).lower()
        for r in uniq
    )
    for term in [
        "receipt",
        "grant",
        "r3",
        "prompt injection",
        "classifier",
        "amamlj",
        "lineage",
        "memory",
        "audit",
        "meaning",
        "judgment",
        "agent",
    ]:
        print(f"  term {term!r}: {'OK' if term in blob else 'MISSING'}")


if __name__ == "__main__":
    build()
