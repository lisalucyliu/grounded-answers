"""Build data/docs.json from live AWS docs pages.

Run from the repo folder: python3 scripts/extract_docs.py <folder for page HTML> (pages already in the folder are reused, missing ones are downloaded)
A section runs from its heading (the page h1, or an h2) to the next h2.
Each paragraph, list item, subheading, code sample and table row becomes one block.
Text is copied word for word. Only whitespace is collapsed.
Subsection sources carry their #anchor. Page intros use the plain page URL, because the
live site rebuilds the page title in the browser and its h1 id no longer exists.
"""
import html
import json
import os
import re
import sys
import urllib.request
from html.parser import HTMLParser

S3_UG = "Amazon Simple Storage Service User Guide"
S3_API = "Amazon S3 API Reference"
DX_UG = "AWS Data Exchange User Guide"
DX_API = "AWS Data Exchange API Reference"
LIVE = "Live Streaming on AWS with Amazon S3 Implementation Guide"

S3U = "https://docs.aws.amazon.com/AmazonS3/latest/userguide/"
S3A = "https://docs.aws.amazon.com/AmazonS3/latest/API/"
DXU = "https://docs.aws.amazon.com/data-exchange/latest/userguide/"
DXA = "https://docs.aws.amazon.com/data-exchange/latest/apireference/"
LSU = "https://docs.aws.amazon.com/solutions/latest/live-streaming-on-aws-with-amazon-s3/"

# (id, saved file, page URL, anchor, guide name, holds an answer?)
SECTIONS = [
    ("UsingEncryption", "s3-UsingEncryption", S3U + "UsingEncryption.html", "UsingEncryption", S3_UG, True),
    ("UsingServerSideEncryption", "s3-UsingServerSideEncryption", S3U + "UsingServerSideEncryption.html", "UsingServerSideEncryption", S3_UG, True),
    ("UsingKMSEncryption", "s3-UsingKMSEncryption", S3U + "UsingKMSEncryption.html", "UsingKMSEncryption", S3_UG, True),
    ("UsingKMSEncryption-bucket-keys", "s3-UsingKMSEncryption", S3U + "UsingKMSEncryption.html", "sse-kms-bucket-keys", S3_UG, False),
    ("UsingDSSEncryption", "s3-UsingDSSEncryption", S3U + "UsingDSSEncryption.html", "UsingDSSEncryption", S3_UG, True),
    ("Versioning", "s3-Versioning", S3U + "Versioning.html", "Versioning", S3_UG, True),
    ("Versioning-states", "s3-Versioning", S3U + "Versioning.html", "versioning-states", S3_UG, True),
    ("VersionSuspendedBehavior", "s3-VersionSuspendedBehavior", S3U + "VersionSuspendedBehavior.html", "VersionSuspendedBehavior", S3_UG, True),
    ("manage-versioning-examples", "s3-manage-versioning-examples", S3U + "manage-versioning-examples.html", "manage-versioning-examples", S3_UG, True),
    ("replication-requirements", "s3-replication-requirements", S3U + "replication-requirements.html", "replication-requirements", S3_UG, True),
    ("s3-batch-replication-batch", "s3-s3-batch-replication-batch", S3U + "s3-batch-replication-batch.html", "s3-batch-replication-batch", S3_UG, True),
    ("s3-batch-replication-completion-report", "s3-s3-batch-replication-batch", S3U + "s3-batch-replication-batch.html", "batch-replication-completion-report", S3_UG, False),
    ("replication-kms-sse-s3-kms-dsse", "s3-replication-config-for-kms-objects", S3U + "replication-config-for-kms-objects.html", "replications", S3_UG, True),
    ("replication-kms-sse-c", "s3-replication-config-for-kms-objects", S3U + "replication-config-for-kms-objects.html", "replicationSSEC", S3_UG, False),
    ("cost-example-1-s3-pricing", "cost-example-1", LSU + "cost-example-1.html", "amazon-s3-pricing", LIVE, True),
    ("dx-exporting-revisions", "dx-exporting-revisions", DXU + "exporting-revisions.html", "exporting-revisions", DX_UG, True),
    ("dx-exporting-assets", "dx-exporting-assets", DXU + "exporting-assets.html", "exporting-assets", DX_UG, True),
    ("dx-revision-export-keypatterns", "dx-revision-export-keypatterns", DXU + "revision-export-keypatterns.html", "revision-export-keypatterns", DX_UG, False),
    ("dx-auto-export", "dx-auto-export-rev-s3-console-sub", DXU + "auto-export-rev-s3-console-sub.html", "auto-export-rev-s3-console-sub", DX_UG, False),
    ("dx-auto-export-console", "dx-auto-export-rev-s3-console-sub", DXU + "auto-export-rev-s3-console-sub.html", "auto-export-rev-s3-console-sub-proc", DX_UG, False),
    ("dx-accepting-data-grants", "dx-accepting-data-grants-and-accessing-data", DXU + "accepting-data-grants-and-accessing-data.html", "accepting-data-grants-and-accessing-data", DX_UG, True),
    ("dx-data-grant-file-based", "dx-data-grant-access-file-based-data", DXU + "data-grant-access-file-based-data.html", "data-grant-access-file-based-data", DX_UG, True),
    ("dx-data-grant-file-based-exporting", "dx-data-grant-access-file-based-data", DXU + "data-grant-access-file-based-data.html", "data-grant-access-file-based-data-exporting", DX_UG, True),
    ("dx-api-TagResource-syntax", "dx-api-TagResource", DXA + "API_TagResource.html", "API_TagResource_RequestSyntax", DX_API, True),
    ("s3control-api-TagResource-syntax", "s3control-api-TagResource", S3A + "API_control_TagResource.html", "API_control_TagResource_RequestSyntax", S3_API, True),
]

BLOCK_TAGS = {"p", "pre", "li", "h3", "h4", "h5", "h6", "tr"}
SKIP_DIV = ("highlights", "code-btn-container", "awsdocs-note-title")


class BlockParser(HTMLParser):
    """Each p, li, pre, heading or table row is a block. Inside a table row, cells are joined with " | "."""

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.skip_depth = 0
        self.div_stack = []
        self.tr_depth = 0
        self.open_blocks = 0
        self.buf = []
        self.blocks = []

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if tag == "div":
            skip = any(c in (a.get("class") or "") for c in SKIP_DIV)
            self.div_stack.append(skip)
            self.skip_depth += skip
            return
        if self.skip_depth:
            return
        if self.tr_depth:
            if tag in ("td", "th") and "".join(self.buf).strip():
                self.buf.append(" | ")
            if tag == "tr":
                self.tr_depth += 1
            return
        if tag in BLOCK_TAGS:
            self.flush()
            self.open_blocks += 1
            if tag == "tr":
                self.tr_depth = 1

    def handle_endtag(self, tag):
        if tag == "div" and self.div_stack:
            self.skip_depth -= self.div_stack.pop()
            return
        if self.skip_depth:
            return
        if self.tr_depth:
            if tag == "tr":
                self.tr_depth -= 1
                if self.tr_depth == 0:
                    self.flush()
                    self.open_blocks -= 1
            return
        if tag in BLOCK_TAGS and self.open_blocks:
            self.flush()
            self.open_blocks -= 1

    def handle_data(self, data):
        if not self.skip_depth and self.open_blocks:
            self.buf.append(data)

    def flush(self):
        text = re.sub(r"\s+", " ", "".join(self.buf)).strip()
        self.buf = []
        if text and text != "|":
            self.blocks.append(text)


def section_html(src, anchor):
    """Returns (heading text, heading tag, html from after the heading to the next h2)."""
    m = re.search(r'<(h[12])\b[^>]*\bid="%s"[^>]*>(.*?)</h[12]>' % re.escape(anchor), src, re.S)
    if not m:
        sys.exit(f"Anchor not found as an h1 or h2: {anchor}")
    rest = src[m.end():]
    nxt = re.search(r"<h2\b", rest)
    body = rest[: nxt.start()] if nxt else rest
    heading = re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", "", m.group(2)))).strip()
    return heading, m.group(1), body


def page_html(raw_dir, fname, url):
    path = f"{raw_dir}/{fname}.html"
    if not os.path.exists(path):
        os.makedirs(raw_dir, exist_ok=True)
        with urllib.request.urlopen(url) as r, open(path, "wb") as f:
            f.write(r.read())
    return open(path, encoding="utf-8").read()


def main(raw_dir, out_path):
    sections = []
    for sid, fname, url, anchor, guide, answer in SECTIONS:
        src = page_html(raw_dir, fname, url)
        title = html.unescape(re.search(r"<title>(.*?)</title>", src, re.S).group(1)).strip()
        title = title.rsplit(" - ", 1)[0]
        src = src[: src.index("awsdocs-copyright")]
        hits = src.count('id="%s"' % anchor)
        if hits != 1:
            sys.exit(f"Anchor {anchor} appears {hits} times in {fname}")
        heading, tag, body = section_html(src, anchor)
        p = BlockParser()
        p.feed(body)
        p.flush()
        if not p.blocks:
            sys.exit(f"No text in {sid}")
        sections.append({
            "id": sid,
            "pageTitle": title,
            "guideName": guide,
            "sectionHeading": heading,
            "url": url if tag == "h1" else f"{url}#{anchor}",
            "paragraphs": p.blocks,
        })
    answers = {sid: answer for sid, *_, answer in SECTIONS}
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump({"source": "Live AWS documentation pages, copied word for word", "sections": sections}, f, indent=2, ensure_ascii=False)
        f.write("\n")
    for s in sections:
        words = sum(len(t.split()) for t in s["paragraphs"])
        print(f'{s["id"]:40} {"answer" if answers[s["id"]] else "NO ANSWER":9} {len(s["paragraphs"]):3} blocks {words:5} words | {s["sectionHeading"][:60]}')
    print(len(sections), "sections,", sum(sum(len(t.split()) for t in s["paragraphs"]) for s in sections), "words")


if __name__ == "__main__":
    main(sys.argv[1], os.path.join(os.path.dirname(__file__), "..", "data", "docs.json"))
