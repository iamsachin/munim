import socket
from collections.abc import Callable
from datetime import UTC, datetime, timedelta
from typing import Any

import httpx
import pytest
from django.test import Client
from django.utils import timezone

from reader import feeds
from reader.models import Article, Feed

from .conftest import post

RSS = b"""<?xml version="1.0"?>
<rss version="2.0"><channel>
  <title>Low Tech Notes</title><link>https://lowtech.example/</link>
  <item>
    <title>A year of running my own feed reader</title>
    <link>https://lowtech.example/year</link><guid>year-1</guid>
    <pubDate>Sat, 14 Nov 2026 06:00:00 GMT</pubDate>
    <description><![CDATA[<p>I started the year with <b>130 feeds</b>.</p>
      <script>alert('x')</script><p>By March it was a second inbox.</p>]]></description>
  </item>
  <item>
    <title>Reading in the evening</title>
    <link>https://lowtech.example/evening</link><guid>evening-1</guid>
    <pubDate>Fri, 13 Nov 2026 20:00:00 GMT</pubDate>
    <description>A short case for reading once a day.</description>
  </item>
</channel></rss>"""

ATOM = b"""<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>Plain Crypto</title><link href="https://crypto.example/"/>
  <entry>
    <title>Notes on encryption &amp; small apps</title>
    <link href="https://crypto.example/notes"/><id>urn:notes</id>
    <updated>2026-11-14T02:00:00Z</updated>
    <content type="html">&lt;p&gt;Write down what the server may know.&lt;/p&gt;</content>
  </entry>
</feed>"""

Handler = Callable[[httpx.Request], httpx.Response]


@pytest.fixture
def web(monkeypatch: pytest.MonkeyPatch) -> Callable[[Handler], None]:
    """Replaces the network: names resolve as below, and requests go to the given handler."""
    addresses = {"localhost": "127.0.0.1", "intranet.example": "10.0.0.5"}

    def resolve(host: str, port: int, **_: Any) -> list[Any]:
        address = addresses.get(host, "93.184.216.34")
        return [(socket.AF_INET, socket.SOCK_STREAM, 6, "", (address, port))]

    monkeypatch.setattr("reader.feeds.socket.getaddrinfo", resolve)
    real = httpx.Client

    def serve(handler: Handler) -> None:
        def client(**options: Any) -> httpx.Client:
            return real(transport=httpx.MockTransport(handler), **options)

        monkeypatch.setattr("reader.feeds.httpx.Client", client)

    return serve


def ok(content: bytes, **headers: str) -> Handler:
    return lambda request: httpx.Response(200, content=content, headers=headers)


# --- reading a feed


def test_rss_is_read_into_plain_text_articles() -> None:
    parsed = feeds.parse(RSS)
    assert (parsed.title, parsed.site_url) == ("Low Tech Notes", "https://lowtech.example/")
    first, second = parsed.entries
    assert first.guid == "year-1"
    assert first.url == "https://lowtech.example/year"
    assert first.published_at == datetime(2026, 11, 14, 6, 0, tzinfo=UTC)
    # Tags are gone, paragraphs are kept, and the script never becomes text.
    assert first.body == "I started the year with 130 feeds.\n\nBy March it was a second inbox."
    assert second.body == "A short case for reading once a day."


def test_atom_is_read_too() -> None:
    parsed = feeds.parse(ATOM)
    assert parsed.title == "Plain Crypto"
    (entry,) = parsed.entries
    assert entry.title == "Notes on encryption & small apps"
    assert entry.body == "Write down what the server may know."
    assert entry.published_at == datetime(2026, 11, 14, 2, 0, tzinfo=UTC)


@pytest.mark.parametrize("content", [b"<html><body>Just a page</body></html>", b"", b"not xml"])
def test_something_that_is_not_a_feed_is_refused(content: bytes) -> None:
    with pytest.raises(feeds.FeedProblem, match="not an RSS or Atom feed"):
        feeds.parse(content)


def test_an_entry_listed_twice_is_read_once() -> None:
    doubled = RSS.replace(b"evening-1", b"year-1")
    assert [e.guid for e in feeds.parse(doubled).entries] == ["year-1"]


def test_html_becomes_text() -> None:
    assert feeds.to_text("<h2>Title</h2><ul><li>one</li><li>two &amp; three</li></ul>") == (
        "Title\n\none\n\ntwo & three"
    )
    assert feeds.to_text("plain   text\nwith   spaces") == "plain text with spaces"
    assert feeds.to_text("<style>p{}</style><p>kept</p><script>dropped()</script>") == "kept"
    assert feeds.to_text("") == ""


def test_reading_time_rounds_up_and_is_at_least_a_minute() -> None:
    assert feeds.minutes("") == 1
    assert feeds.minutes("word " * 230) == 1
    assert feeds.minutes("word " * 231) == 2


# --- fetching safely


@pytest.mark.parametrize(
    "url", ["ftp://feeds.example/a", "file:///etc/passwd", "feeds.example", ""]
)
def test_only_http_addresses_are_fetched(url: str, web: Any) -> None:
    with pytest.raises(feeds.FeedProblem, match="starts with http"):
        feeds.download(url)


@pytest.mark.parametrize("url", ["http://localhost/feed", "http://intranet.example/feed"])
def test_addresses_on_private_networks_are_refused(url: str, web: Any) -> None:
    web(ok(RSS))
    with pytest.raises(feeds.FeedProblem, match="private network"):
        feeds.download(url)


def test_a_redirect_to_a_private_network_is_refused(web: Any) -> None:
    web(lambda request: httpx.Response(302, headers={"Location": "http://intranet.example/x"}))
    with pytest.raises(feeds.FeedProblem, match="private network"):
        feeds.download("https://feeds.example/feed")


def test_private_feeds_can_be_allowed_by_the_install(web: Any, settings: Any) -> None:
    settings.ALLOW_PRIVATE_FEEDS = True
    web(ok(RSS))
    fetched = feeds.download("http://intranet.example/feed")
    assert fetched is not None and fetched.content == RSS


def test_redirects_are_followed_but_not_forever(web: Any) -> None:
    hops = []

    def handler(request: httpx.Request) -> httpx.Response:
        hops.append(str(request.url))
        if request.url.path == "/feed":
            return httpx.Response(301, headers={"Location": "/moved"})
        return httpx.Response(200, content=RSS)

    web(handler)
    fetched = feeds.download("https://feeds.example/feed")
    assert fetched is not None and fetched.content == RSS
    assert hops == ["https://feeds.example/feed", "https://feeds.example/moved"]

    web(lambda request: httpx.Response(302, headers={"Location": "/again"}))
    with pytest.raises(feeds.FeedProblem, match="redirects too many times"):
        feeds.download("https://feeds.example/feed")


def test_an_oversized_feed_is_refused(web: Any) -> None:
    web(ok(b"x" * (feeds.MAX_BYTES + 1)))
    with pytest.raises(feeds.FeedProblem, match="too large"):
        feeds.download("https://feeds.example/feed")


def test_a_failing_or_silent_server_is_reported_in_plain_words(web: Any) -> None:
    web(lambda request: httpx.Response(404))
    with pytest.raises(feeds.FeedProblem, match="answered 404"):
        feeds.download("https://feeds.example/feed")

    def slow(request: httpx.Request) -> httpx.Response:
        raise httpx.ReadTimeout("slow")

    web(slow)
    with pytest.raises(feeds.FeedProblem, match="took too long"):
        feeds.download("https://feeds.example/feed")

    def down(request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("down")

    web(down)
    with pytest.raises(feeds.FeedProblem, match="could not be reached"):
        feeds.download("https://feeds.example/feed")


# --- the API


def test_adding_a_feed_fetches_it_and_lists_its_articles(owner_client: Client, web: Any) -> None:
    web(ok(RSS, ETag='"v1"'))
    added = post(owner_client, "feeds", {"url": " https://lowtech.example/feed "})
    assert added.status_code == 201
    feed = added.json()
    assert (feed["title"], feed["articles"], feed["problem"]) == ("Low Tech Notes", 2, "")
    assert feed["url"] == "https://lowtech.example/feed"

    assert owner_client.get("/api/feeds").json() == [feed]
    articles = owner_client.get(f"/api/feeds/{feed['id']}/articles").json()
    assert [a["title"] for a in articles] == [
        "A year of running my own feed reader",
        "Reading in the evening",
    ]
    assert articles[0]["paragraphs"] == [
        "I started the year with 130 feeds.",
        "By March it was a second inbox.",
    ]
    assert articles[0]["url"] == "https://lowtech.example/year"
    assert articles[0]["minutes"] == 1


def test_a_feed_is_added_only_once_and_only_if_it_can_be_read(
    owner_client: Client, web: Any
) -> None:
    web(ok(RSS))
    assert post(owner_client, "feeds", {"url": "https://lowtech.example/feed"}).status_code == 201
    again = post(owner_client, "feeds", {"url": "https://lowtech.example/feed"})
    assert (again.status_code, again.json()["detail"]) == (409, "That feed is already here.")

    web(ok(b"<html>a page</html>"))
    page = post(owner_client, "feeds", {"url": "https://lowtech.example/"})
    assert page.status_code == 422
    assert page.json()["detail"] == "That address is not an RSS or Atom feed."
    private = post(owner_client, "feeds", {"url": "http://localhost:8000/feed"})
    assert private.status_code == 422
    assert Feed.objects.count() == 1


def test_refreshing_adds_new_entries_and_updates_old_ones_without_duplicates(
    owner_client: Client, web: Any
) -> None:
    web(ok(RSS, ETag='"v1"'))
    feed = post(owner_client, "feeds", {"url": "https://lowtech.example/feed"}).json()

    changed = RSS.replace(b"Reading in the evening", b"Reading at night").replace(
        b"<item>",
        b"<item><title>New today</title><guid>new-1</guid>"
        b"<pubDate>Sat, 14 Nov 2026 09:00:00 GMT</pubDate></item><item>",
        1,
    )
    seen: list[str | None] = []

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append(request.headers.get("If-None-Match"))
        return httpx.Response(200, content=changed)

    web(handler)
    refreshed = post(owner_client, f"feeds/{feed['id']}/refresh").json()
    assert refreshed["articles"] == 3
    assert seen == ['"v1"']
    titles = list(Article.objects.values_list("title", flat=True))
    assert titles == ["New today", "A year of running my own feed reader", "Reading at night"]


def test_a_feed_that_says_nothing_changed_or_fails_keeps_its_articles(
    owner_client: Client, web: Any
) -> None:
    web(ok(RSS))
    feed = post(owner_client, "feeds", {"url": "https://lowtech.example/feed"}).json()

    web(lambda request: httpx.Response(304))
    assert post(owner_client, f"feeds/{feed['id']}/refresh").json()["problem"] == ""

    web(lambda request: httpx.Response(500))
    failed = post(owner_client, f"feeds/{feed['id']}/refresh").json()
    assert failed["problem"] == "The feed's server answered 500."
    assert failed["articles"] == 2
    assert owner_client.get("/api/feeds").json()[0]["problem"] == "The feed's server answered 500."


def test_opening_a_feed_fetches_it_again_only_if_the_last_fetch_is_old(
    owner_client: Client, web: Any
) -> None:
    web(ok(RSS))
    feed = post(owner_client, "feeds", {"url": "https://lowtech.example/feed"}).json()
    calls = []

    def handler(request: httpx.Request) -> httpx.Response:
        calls.append(1)
        return httpx.Response(304)

    web(handler)
    owner_client.get(f"/api/feeds/{feed['id']}/articles")
    assert calls == []

    Feed.objects.update(fetched_at=timezone.now() - timedelta(minutes=16))
    assert len(owner_client.get(f"/api/feeds/{feed['id']}/articles").json()) == 2
    assert calls == [1]
    owner_client.get(f"/api/feeds/{feed['id']}/articles")
    assert calls == [1]


def test_feeds_need_an_open_session(owner_client: Client, web: Any) -> None:
    assert Client().get("/api/feeds").status_code == 401
    assert post(Client(), "feeds", {"url": "https://lowtech.example/feed"}).status_code == 401
    post(owner_client, "lock")
    assert owner_client.get("/api/feeds").status_code == 423
    assert owner_client.get("/api/feeds/1/articles").status_code == 423
