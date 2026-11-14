"""Rich text as blocks: the one shape every source's text is turned into.

Feeds send HTML, other sources Markdown or plain text. None of it is trusted, and none of it is
ever sent to the browser as markup. It is read here into a short list of blocks (paragraph,
heading, list, quote, code, image), each holding text with a few marks (bold, italic, code) and
links. The app draws each block itself, so nothing a source sends can run or restyle the page.

Anything not understood keeps its text: a table becomes one paragraph per row, an unknown element
is read through to the words inside it.
"""

import re
from collections import Counter
from html.parser import HTMLParser
from typing import Any
from urllib.parse import urljoin, urlsplit

Span = dict[str, Any]
Block = dict[str, Any]

MAX_BLOCKS = 2000
MAX_URL = 1000
# shortcut: items past this are joined onto the last one, split them if real lists get this long
MAX_ITEMS = 500

_HEADINGS = {"h1": 2, "h2": 2, "h3": 3, "h4": 3, "h5": 3, "h6": 3}
_MARKS = {
    "b": "bold",
    "strong": "bold",
    "i": "italic",
    "em": "italic",
    "cite": "italic",
    "code": "code",
    "kbd": "code",
    "samp": "code",
    "tt": "code",
}
# Elements that end the paragraph being read.
_BREAKS = frozenset(
    "p div section article header footer main aside figure figcaption table tr dl dt dd "
    "address details summary center hr".split()
)
# Elements whose contents are never text for the reader.
_SKIPPED = frozenset(
    "script style iframe noscript svg form template object embed video audio canvas button "
    "select textarea head title".split()
)
_SPACE = re.compile(r"\s+")


def _address(base: str, value: str | None, schemes: tuple[str, ...]) -> str:
    """An absolute address with an allowed scheme, or "" if it is anything else."""
    if not value:
        return ""
    try:
        url = urljoin(base, value.strip())
        scheme = urlsplit(url).scheme
    except ValueError:  # not an address at all, such as an unclosed "[" in the host
        return ""
    if len(url) > MAX_URL or scheme not in schemes:
        return ""
    return url


def _tiny(attrs: dict[str, str | None]) -> bool:
    """A one-pixel image is there to report that the article was opened, not to be seen."""
    for name in ("width", "height"):
        value = (attrs.get(name) or "").strip().removesuffix("px")
        if value.isdigit() and int(value) <= 2:
            return True
    return False


class _Reader(HTMLParser):
    def __init__(self, base: str) -> None:
        super().__init__(convert_charrefs=True)
        self.base = base
        self.blocks: list[Block] = []
        self.spans: list[Span] = []
        # Counters, not flags, so tags closed in the wrong order cannot leave a mark stuck on.
        self.marks: Counter[str] = Counter()
        self.links: list[str] = []
        self.lists: list[dict[str, Any]] = []
        self.heading: int | None = None
        self.quote = 0
        self.skipping = 0
        self.code: list[str] | None = None
        self.after_break = True

    # --- text

    def _add(self, text: str) -> None:
        text = _SPACE.sub(" ", text)
        if self.after_break:
            text = text.lstrip(" ")
        if not text:
            return
        self.after_break = False
        span: Span = {"text": text}
        marks = sorted(mark for mark, depth in self.marks.items() if depth > 0)
        if marks:
            span["marks"] = marks
        if self.links and self.links[-1]:
            span["href"] = self.links[-1]
        last = self.spans[-1] if self.spans else None
        if last and {k: v for k, v in last.items() if k != "text"} == {
            k: v for k, v in span.items() if k != "text"
        }:
            if last["text"].endswith(" ") and text.startswith(" "):
                text = text[1:]
            last["text"] += text
        else:
            self.spans.append(span)

    def _flush(self) -> None:
        """Ends the run of text being read and files it as the block it belongs to."""
        spans, self.spans, self.after_break = self.spans, [], True
        if spans:
            spans[0]["text"] = spans[0]["text"].lstrip()
            spans[-1]["text"] = spans[-1]["text"].rstrip()
        spans = [s for s in spans if s["text"]]
        if not spans or len(self.blocks) >= MAX_BLOCKS:
            return
        if self.lists and self.lists[-1]["items"]:
            item = self.lists[-1]["items"][-1]
            if item:
                item[-1]["text"] += "\n" if not item[-1].get("href") else ""
                if item[-1].get("href"):
                    item.append({"text": "\n"})
            item.extend(spans)
        elif self.heading is not None:
            self.blocks.append({"type": "heading", "level": self.heading, "spans": spans})
        elif self.quote:
            self.blocks.append({"type": "quote", "spans": spans})
        else:
            self.blocks.append({"type": "paragraph", "spans": spans})

    # --- elements

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if tag in _SKIPPED:
            self.skipping += 1
        if self.skipping:
            return
        if self.code is not None:
            if tag == "br":
                self.code.append("\n")
            return
        given = dict(attrs)
        if tag == "br":
            if self.spans:
                self.spans[-1]["text"] = self.spans[-1]["text"].rstrip(" ") + "\n"
                self.after_break = True
        elif tag in _MARKS:
            self.marks[_MARKS[tag]] += 1
        elif tag == "a":
            self.links.append(_address(self.base, given.get("href"), ("http", "https", "mailto")))
        elif tag == "img":
            src = _address(self.base, given.get("src"), ("http", "https"))
            if src and not _tiny(given) and len(self.blocks) < MAX_BLOCKS:
                self._flush()
                alt = _SPACE.sub(" ", given.get("alt") or "").strip()
                self.blocks.append({"type": "image", "src": src, "alt": alt[:300]})
        elif tag == "pre":
            self._flush()
            self.code = []
        elif tag == "blockquote":
            self._flush()
            self.quote += 1
        elif tag in ("ul", "ol"):
            self._flush()
            self.lists.append({"ordered": tag == "ol", "items": []})
        elif tag == "li":
            self._flush()
            if self.lists and len(self.lists[-1]["items"]) < MAX_ITEMS:
                self.lists[-1]["items"].append([])
        elif tag in _HEADINGS:
            self._flush()
            self.heading = _HEADINGS[tag]
        elif tag in ("td", "th"):
            # A table row is read as one line, its cells separated.
            if self.spans:
                self._add(" | ")
        elif tag in _BREAKS:
            self._flush()

    def handle_endtag(self, tag: str) -> None:
        if tag in _SKIPPED:
            self.skipping = max(0, self.skipping - 1)
            return
        if self.skipping:
            return
        if tag == "pre" and self.code is not None:
            text = "".join(self.code).strip("\n")
            self.code = None
            if text.strip() and len(self.blocks) < MAX_BLOCKS:
                self.blocks.append({"type": "code", "text": text})
        elif self.code is not None:
            return
        elif tag in _MARKS:
            self.marks[_MARKS[tag]] = max(0, self.marks[_MARKS[tag]] - 1)
        elif tag == "a":
            if self.links:
                self.links.pop()
        elif tag == "blockquote":
            self._flush()
            self.quote = max(0, self.quote - 1)
        elif tag in ("ul", "ol"):
            self._flush()
            if self.lists:
                done = self.lists.pop()
                items = [item for item in done["items"] if item]
                if self.lists:
                    # shortcut: a list inside a list is read as more items of the outer one;
                    # keep the nesting if indented lists turn out to matter.
                    self.lists[-1]["items"].extend(items)
                elif items and len(self.blocks) < MAX_BLOCKS:
                    self.blocks.append({"type": "list", "ordered": done["ordered"], "items": items})
        elif tag in _HEADINGS:
            self._flush()
            self.heading = None
        elif tag == "li" or tag in _BREAKS:
            self._flush()

    def handle_data(self, data: str) -> None:
        if self.skipping:
            return
        if self.code is not None:
            self.code.append(data)
        else:
            self._add(data)


def from_html(html: str, base: str = "") -> list[Block]:
    """Blocks from an HTML fragment. `base` is the page it came from, for relative addresses."""
    reader = _Reader(base)
    reader.feed(html)
    reader.close()
    # Whatever was left open at the end still counts.
    while reader.lists:
        reader.handle_endtag("ol" if reader.lists[-1]["ordered"] else "ul")
    reader._flush()
    return reader.blocks


# An address someone wrote out: with its scheme, or starting "www.". A bare "example.com" is
# left as text, since guessing would also catch file names and abbreviations.
_LINK = re.compile(r"(?:https?://|www\.)[^\s<>\"']+", re.IGNORECASE)


def from_text(text: str) -> list[Block]:
    """Blocks from plain text, such as a video's description: one paragraph for each run of
    lines separated by a blank line. The line breaks inside a paragraph are kept, since plain
    text has no other way to make a list; and an address written out becomes a link."""
    blocks: list[Block] = []
    for chunk in re.split(r"\n\s*\n", text):
        lines = (" ".join(line.split()) for line in chunk.splitlines())
        paragraph = "\n".join(line for line in lines if line)
        spans: list[Span] = []
        at = 0
        for found in _LINK.finditer(paragraph):
            # A full stop or bracket after an address belongs to the sentence, not to it.
            url = found.group().rstrip(".,;:!?)]}")
            if len(url) > MAX_URL:
                continue
            if found.start() > at:
                spans.append({"text": paragraph[at : found.start()]})
            href = url if url.lower().startswith("http") else f"https://{url}"
            spans.append({"text": url, "href": href})
            at = found.start() + len(url)
        if at < len(paragraph):
            spans.append({"text": paragraph[at:]})
        if spans and len(blocks) < MAX_BLOCKS:
            blocks.append({"type": "paragraph", "spans": spans})
    return blocks


def _words(spans: list[Span]) -> str:
    return "".join(span["text"] for span in spans)


def text_of(blocks: list[Block]) -> str:
    """The words in the blocks, as plain text with a blank line between blocks."""
    parts: list[str] = []
    for block in blocks:
        kind = block["type"]
        if kind == "list":
            parts.append("\n".join(_words(item) for item in block["items"]))
        elif kind == "code":
            parts.append(block["text"])
        elif kind in ("image", "video"):
            parts.append(block["alt"])
        else:
            parts.append(_words(block["spans"]))
    return "\n\n".join(part for part in parts if part)
