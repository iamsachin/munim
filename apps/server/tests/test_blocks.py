from typing import Any

import pytest

from reader.blocks import MAX_BLOCKS, from_html, from_text, text_of


def p(*spans: Any) -> dict[str, Any]:
    return {
        "type": "paragraph",
        "spans": [s if isinstance(s, dict) else {"text": s} for s in spans],
    }


def test_paragraphs_keep_their_words_and_lose_their_tags() -> None:
    assert from_html("<p>One  two\n three.</p><p>Four.</p>") == [p("One two three."), p("Four.")]
    assert from_html("Just   text") == [p("Just text")]
    assert from_html("") == []
    assert from_html("<p>  </p><div></div>") == []


def test_bold_italic_code_and_links_are_kept_as_marks() -> None:
    html = (
        '<p>Plain <b>bold</b> <em>italic</em> <code>x = 1</code> <a href="/about">a link</a>.</p>'
    )
    assert from_html(html, "https://site.example/post") == [
        p(
            "Plain ",
            {"text": "bold", "marks": ["bold"]},
            " ",
            {"text": "italic", "marks": ["italic"]},
            " ",
            {"text": "x = 1", "marks": ["code"]},
            " ",
            {"text": "a link", "href": "https://site.example/about"},
            ".",
        )
    ]
    nested = from_html("<p><strong>very <i>much</i></strong> so</p>")
    assert nested == [
        p(
            {"text": "very ", "marks": ["bold"]},
            {"text": "much", "marks": ["bold", "italic"]},
            " so",
        )
    ]


def test_marks_closed_in_the_wrong_order_do_not_stick() -> None:
    assert from_html("<p><b>bold <i>both</b> italic</i> plain</p><p>next</p>") == [
        p(
            {"text": "bold ", "marks": ["bold"]},
            {"text": "both", "marks": ["bold", "italic"]},
            {"text": " italic", "marks": ["italic"]},
            " plain",
        ),
        p("next"),
    ]
    # Closing something that was never opened changes nothing.
    assert from_html("</b></i></a><p>fine</p>") == [p("fine")]


@pytest.mark.parametrize(
    "href",
    ["javascript:alert(1)", "data:text/html,<script>x</script>", "vbscript:x", " JaVaScRiPt:x", ""],
)
def test_a_link_that_is_not_a_web_or_mail_address_loses_its_address(href: str) -> None:
    assert from_html(f'<p><a href="{href}">click</a></p>') == [p("click")]


def test_mail_links_are_kept() -> None:
    assert from_html('<a href="mailto:a@b.example">write</a>') == [
        p({"text": "write", "href": "mailto:a@b.example"})
    ]


def test_scripts_styles_and_embeds_leave_nothing_behind() -> None:
    html = (
        "<p>Before</p><script>steal()</script><style>p{display:none}</style>"
        "<iframe src='https://x.example'>fallback</iframe><svg><text>drawn</text></svg>"
        "<form><input value='typed'><button>Send</button></form><p>After</p>"
    )
    assert from_html(html) == [p("Before"), p("After")]
    assert from_html('<p onclick="x()" style="color:red" class="a">Clean</p>') == [p("Clean")]


def test_headings_are_two_levels() -> None:
    blocks = from_html("<h1>Top</h1><h2>Also top</h2><h3>Under</h3><h6>Deep</h6><p>Text</p>")
    assert [(b["type"], b.get("level")) for b in blocks] == [
        ("heading", 2),
        ("heading", 2),
        ("heading", 3),
        ("heading", 3),
        ("paragraph", None),
    ]
    assert blocks[0]["spans"] == [{"text": "Top"}]


def test_lists_keep_their_items_and_their_order() -> None:
    assert from_html("<ul><li>one</li><li><b>two</b></li></ul><ol><li>first</li></ol>") == [
        {
            "type": "list",
            "ordered": False,
            "items": [[{"text": "one"}], [{"text": "two", "marks": ["bold"]}]],
        },
        {"type": "list", "ordered": True, "items": [[{"text": "first"}]]},
    ]
    # A list inside a list is read as more items of the outer one.
    nested = from_html("<ul><li>a<ul><li>b</li></ul></li><li>c</li></ul>")
    assert [text_of([{"type": "paragraph", "spans": item}]) for item in nested[0]["items"]] == [
        "a",
        "b",
        "c",
    ]
    assert from_html("<ul><li></li></ul>") == []
    # An item outside any list is still read.
    assert from_html("<li>stray</li>") == [p("stray")]


def test_quotes_and_code_blocks() -> None:
    assert from_html("<blockquote><p>First.</p><p>Second.</p></blockquote><p>Mine.</p>") == [
        {"type": "quote", "spans": [{"text": "First."}]},
        {"type": "quote", "spans": [{"text": "Second."}]},
        p("Mine."),
    ]
    code = from_html("<pre><code>def f():\n    return  1\n</code></pre>")
    assert code == [{"type": "code", "text": "def f():\n    return  1"}]
    assert from_html("<pre>  </pre>") == []


def test_line_breaks_stay_inside_the_paragraph() -> None:
    assert from_html("<p>Roses are red<br>Violets are blue</p>") == [
        p("Roses are red\nViolets are blue")
    ]
    assert from_html("<br><p>Leading break</p>") == [p("Leading break")]


def test_images_become_blocks_with_absolute_addresses() -> None:
    html = '<p>Look:</p><img src="/pic.png" alt=" A   chart "><p>Done.</p>'
    assert from_html(html, "https://site.example/a/b") == [
        p("Look:"),
        {"type": "image", "src": "https://site.example/pic.png", "alt": "A chart"},
        p("Done."),
    ]
    inline = from_html('<p>Before <img src="https://x.example/i.jpg"> after</p>')
    assert [b["type"] for b in inline] == ["paragraph", "image", "paragraph"]


@pytest.mark.parametrize(
    "tag",
    [
        '<img src="https://t.example/p.gif" width="1" height="1">',
        '<img src="https://t.example/p.gif" height="0">',
        '<img src="https://t.example/p.gif" width="1px">',
        '<img src="data:image/png;base64,AAAA">',
        '<img src="javascript:x">',
        "<img>",
    ],
)
def test_tracking_pixels_and_images_without_a_web_address_are_dropped(tag: str) -> None:
    assert from_html(f"<p>Text</p>{tag}") == [p("Text")]


def test_a_table_is_read_one_row_at_a_time() -> None:
    html = (
        "<table><tr><th>Name</th><th>Size</th></tr><tr><td>index</td><td>400 MB</td></tr></table>"
    )
    assert [text_of([b]) for b in from_html(html)] == ["Name | Size", "index | 400 MB"]


def test_unknown_elements_are_read_through_to_their_words() -> None:
    assert from_html("<p>A <span>span</span>, <mark>mark</mark> and <u>underline</u>.</p>") == [
        p("A span, mark and underline.")
    ]
    assert from_html("<figure><figcaption>A caption</figcaption></figure>") == [p("A caption")]


def test_unfinished_html_still_gives_its_text() -> None:
    assert from_html("<p>Open <b>bold") == [p("Open ", {"text": "bold", "marks": ["bold"]})]
    assert from_html("<ul><li>one<li>two") == [
        {"type": "list", "ordered": False, "items": [[{"text": "one"}], [{"text": "two"}]]}
    ]
    # A non-breaking space is read as an ordinary one.
    assert from_html("<p>Entities: &amp; &lt;b&gt; &#8212; &nbsp;done</p>") == [
        p("Entities: & <b> — done")
    ]


def test_a_huge_document_is_cut_off_not_refused() -> None:
    assert len(from_html("<p>x</p>" * (MAX_BLOCKS + 500))) == MAX_BLOCKS


def test_plain_text_becomes_paragraphs() -> None:
    assert from_text("One line\nsame paragraph.\n\nSecond.\n\n\n") == [
        p("One line same paragraph."),
        p("Second."),
    ]
    assert from_text("") == []


def test_the_words_can_be_read_back_as_plain_text() -> None:
    html = (
        "<h2>Title</h2><p>Some <b>bold</b> text.</p><ul><li>one</li><li>two</li></ul>"
        '<pre>code()</pre><img src="https://x.example/a.png" alt="A chart">'
        "<blockquote>Said.</blockquote>"
    )
    assert text_of(from_html(html)) == (
        "Title\n\nSome bold text.\n\none\ntwo\n\ncode()\n\nA chart\n\nSaid."
    )
    assert text_of([]) == ""
