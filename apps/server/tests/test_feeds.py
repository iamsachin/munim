from datetime import UTC, datetime, timedelta
from typing import Any

import httpx
import pytest
from django.db import connection
from django.test import Client
from django.utils import timezone
from procrastinate.contrib.django import app

from reader import feeds
from reader.blocks import text_of
from reader.models import Feed, Highlight, Item
from reader.tasks import poll_feeds, recover_jobs

from .conftest import PASSPHRASE, Handler, post

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


def items_of(client: Client, feed_id: int) -> list[dict[str, Any]]:
    return list(client.get(f"/api/items?feed={feed_id}").json())


def ok(content: bytes, **headers: str) -> Handler:
    return lambda request: httpx.Response(200, content=content, headers=headers)


# --- reading a feed


def texts(entry: feeds.Entry) -> list[str]:
    return text_of(entry.blocks).split("\n\n")


def test_rss_is_read_into_blocks() -> None:
    parsed = feeds.parse(RSS)
    assert (parsed.title, parsed.site_url) == ("Low Tech Notes", "https://lowtech.example/")
    first, second = parsed.entries
    assert first.guid == "year-1"
    assert first.url == "https://lowtech.example/year"
    assert first.published_at == datetime(2026, 11, 14, 6, 0, tzinfo=UTC)
    # Formatting is kept as marks, and the script never becomes text.
    assert first.blocks == [
        {
            "type": "paragraph",
            "spans": [
                {"text": "I started the year with "},
                {"text": "130 feeds", "marks": ["bold"]},
                {"text": "."},
            ],
        },
        {"type": "paragraph", "spans": [{"text": "By March it was a second inbox."}]},
    ]
    assert texts(second) == ["A short case for reading once a day."]


def test_atom_is_read_too() -> None:
    parsed = feeds.parse(ATOM)
    assert parsed.title == "Plain Crypto"
    (entry,) = parsed.entries
    assert entry.title == "Notes on encryption & small apps"
    assert texts(entry) == ["Write down what the server may know."]
    assert entry.published_at == datetime(2026, 11, 14, 2, 0, tzinfo=UTC)


def test_links_and_images_in_an_entry_are_relative_to_its_own_page() -> None:
    feed = RSS.replace(
        b"<p>By March it was a second inbox.</p>",
        b'<p>See <a href="/notes">my notes</a>.</p><img src="chart.png" alt="Feeds kept">',
    )
    blocks = feeds.parse(feed).entries[0].blocks
    assert blocks[1]["spans"][1] == {"text": "my notes", "href": "https://lowtech.example/notes"}
    assert blocks[2] == {
        "type": "image",
        "src": "https://lowtech.example/chart.png",
        "alt": "Feeds kept",
    }


@pytest.mark.parametrize("content", [b"<html><body>Just a page</body></html>", b"", b"not xml"])
def test_something_that_is_not_a_feed_is_refused(content: bytes) -> None:
    with pytest.raises(feeds.FeedProblem, match="not an RSS or Atom feed"):
        feeds.parse(content)


def test_an_entry_listed_twice_is_read_once() -> None:
    doubled = RSS.replace(b"evening-1", b"year-1")
    assert [e.guid for e in feeds.parse(doubled).entries] == ["year-1"]


def test_titles_are_one_line_of_plain_text() -> None:
    assert feeds.plain("A <b>bold</b>\n  title &amp; more") == "A bold title & more"
    assert feeds.plain("") == ""


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
    articles = items_of(owner_client, feed["id"])
    assert [a["title"] for a in articles] == [
        "A year of running my own feed reader",
        "Reading in the evening",
    ]
    assert {a["origin"] for a in articles} == {"Low Tech Notes"}
    opened = owner_client.get(f"/api/items/{articles[0]['id']}").json()
    assert [b["type"] for b in opened["blocks"]] == ["paragraph", "paragraph"]
    assert opened["blocks"][0]["spans"][1] == {"text": "130 feeds", "marks": ["bold"], "href": None}
    assert opened["url"] == "https://lowtech.example/year"
    assert opened["minutes"] == 1


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


def test_polling_adds_new_entries_and_updates_old_ones_without_duplicates(
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
    poll_feeds(timestamp=0)

    # The feed's server was told what we already have, so it can answer "nothing new".
    assert seen == ['"v1"']
    assert owner_client.get("/api/feeds").json()[0]["articles"] == 3
    titles = [a["title"] for a in items_of(owner_client, feed["id"])]
    assert titles == ["New today", "A year of running my own feed reader", "Reading at night"]


def test_a_feed_that_says_nothing_changed_or_fails_keeps_its_articles(
    owner_client: Client, web: Any
) -> None:
    web(ok(RSS))
    post(owner_client, "feeds", {"url": "https://lowtech.example/feed"})

    web(lambda request: httpx.Response(304))
    poll_feeds(timestamp=0)
    assert owner_client.get("/api/feeds").json()[0]["problem"] == ""

    web(lambda request: httpx.Response(500))
    poll_feeds(timestamp=0)
    (failed,) = owner_client.get("/api/feeds").json()
    assert failed["problem"] == "The feed's server answered 500."
    # A fetch that failed is still a fetch: Connections shows when Munim last tried.
    assert failed["fetched_at"]
    assert failed["articles"] == 2

    # It recovers by itself once the feed's server does.
    web(ok(RSS))
    poll_feeds(timestamp=0)
    assert owner_client.get("/api/feeds").json()[0]["problem"] == ""


def test_one_failing_feed_does_not_stop_the_others_being_polled(
    owner_client: Client, web: Any
) -> None:
    web(ok(RSS))
    post(owner_client, "feeds", {"url": "https://a.example/feed"})
    web(ok(ATOM))
    post(owner_client, "feeds", {"url": "https://b.example/feed"})
    polled = []

    def handler(request: httpx.Request) -> httpx.Response:
        polled.append(request.url.host)
        if request.url.host == "a.example":
            raise httpx.ConnectError("down")
        return httpx.Response(304)

    web(handler)
    poll_feeds(timestamp=0)
    assert sorted(polled) == ["a.example", "b.example"]
    problems = {f["url"]: f["problem"] for f in owner_client.get("/api/feeds").json()}
    assert problems == {
        "https://a.example/feed": "The feed's server could not be reached.",
        "https://b.example/feed": "",
    }


def test_reading_articles_does_not_fetch_anything(owner_client: Client, web: Any) -> None:
    web(ok(RSS))
    feed = post(owner_client, "feeds", {"url": "https://lowtech.example/feed"}).json()
    Feed.objects.update(fetched_at=timezone.now() - timedelta(days=3))
    calls: list[int] = []

    def handler(request: httpx.Request) -> httpx.Response:
        calls.append(1)
        return httpx.Response(304)

    web(handler)
    assert len(items_of(owner_client, feed["id"])) == 2
    assert calls == []


def test_the_poll_is_scheduled_every_fifteen_minutes() -> None:
    scheduled = {
        periodic.task.name: periodic.cron
        for periodic in app.periodic_registry.periodic_tasks.values()
    }
    assert scheduled == {
        "ai.tasks.refresh_models": "23 4 * * *",
        "reader.tasks.poll_feeds": "*/15 * * * *",
        "reader.tasks.poll_hacker_news": "*/15 * * * *",
        "reader.tasks.poll_youtube": "7 * * * *",
        "reader.tasks.recover_jobs": "*/5 * * * *",
    }


@pytest.mark.django_db(transaction=True)
def test_a_queued_poll_is_run_by_the_worker(client: Client, web: Any) -> None:
    """The whole path: a job row in Postgres, picked up and run by a real worker."""
    post(client, "setup", {"passphrase": PASSPHRASE})
    web(ok(RSS))
    post(client, "feeds", {"url": "https://lowtech.example/feed"})
    web(lambda request: httpx.Response(500))

    # Two things the library's types do not describe: the timestamp a scheduled job is given,
    # and the worker's own connection, which Django's command sets up the same way.
    poll_feeds.defer(timestamp=0)  # type: ignore[call-arg]
    worker = app.connector.get_worker_connector()  # type: ignore[attr-defined]
    with app.replace_connector(worker) as worker_app:
        worker_app.run_worker(wait=False, install_signal_handlers=False, listen_notify=False)

    assert client.get("/api/feeds").json()[0]["problem"] == "The feed's server answered 500."


def work() -> None:
    """Runs a real worker until the queue is empty."""
    worker = app.connector.get_worker_connector()  # type: ignore[attr-defined]
    with app.replace_connector(worker) as worker_app:
        worker_app.run_worker(wait=False, install_signal_handlers=False, listen_notify=False)


@pytest.mark.django_db(transaction=True)
def test_a_job_left_behind_by_a_worker_that_died_is_run_again(
    client: Client, web: Any, monkeypatch: pytest.MonkeyPatch
) -> None:
    # A worker also queues whatever is due by the clock. This test counts jobs, so for its
    # length nothing is scheduled: it must not depend on the minute it runs in.
    monkeypatch.setattr(app.periodic_registry, "periodic_tasks", {})
    post(client, "setup", {"passphrase": PASSPHRASE})
    web(ok(RSS))
    post(client, "feeds", {"url": "https://lowtech.example/feed"})
    asked: list[str] = []

    def down(request: httpx.Request) -> httpx.Response:
        asked.append(request.url.host)
        return httpx.Response(500)

    web(down)
    poll_feeds.defer(timestamp=0)  # type: ignore[call-arg]
    # What a worker killed in the middle of a job leaves: the job marked as running, by nobody.
    with connection.cursor() as cursor:
        cursor.execute("update procrastinate_jobs set status = 'doing'")

    def waiting() -> list[tuple[str, str]]:
        with connection.cursor() as cursor:
            cursor.execute("select task_name, status from procrastinate_jobs order by id")
            return list(cursor.fetchall())

    # A worker passes it by: it looks taken. And nothing of its kind can start behind it.
    work()
    assert asked == []
    assert waiting() == [("reader.tasks.poll_feeds", "doing")]

    # The recovery task puts it back, and it runs.
    recover_jobs.defer(timestamp=0)  # type: ignore[call-arg]
    work()
    assert asked == ["lowtech.example"]
    assert waiting() == []
    assert client.get("/api/feeds").json()[0]["problem"] == "The feed's server answered 500."

    # The same again, as it was found on a real install: by the time anyone looks, the next
    # run has been queued behind the one left behind. That one is cleared, and the next runs.
    asked.clear()
    poll_feeds.defer(timestamp=0)  # type: ignore[call-arg]
    with connection.cursor() as cursor:
        cursor.execute("update procrastinate_jobs set status = 'doing'")
    poll_feeds.defer(timestamp=0)  # type: ignore[call-arg]
    work()
    assert asked == []
    assert [status for _, status in waiting()] == ["doing", "todo"]
    recover_jobs.defer(timestamp=0)  # type: ignore[call-arg]
    work()
    assert asked == ["lowtech.example"]
    assert waiting() == []


def test_feeds_need_an_open_session(owner_client: Client, web: Any) -> None:
    assert Client().get("/api/feeds").status_code == 401
    assert post(Client(), "feeds", {"url": "https://lowtech.example/feed"}).status_code == 401
    post(owner_client, "lock")
    assert owner_client.get("/api/feeds").status_code == 423
    assert owner_client.get("/api/items").status_code == 423


def test_removing_a_feed_keeps_what_the_owner_kept_and_deletes_the_rest(
    owner_client: Client, web: Any
) -> None:
    web(ok(RSS))
    feed = post(owner_client, "feeds", {"url": "https://lowtech.example/feed"}).json()
    saved, queued, marked, plain = (
        Item.objects.create(
            feed_id=feed["id"], guid=name, title=name, published_at=timezone.now(), **state
        )
        for name, state in (
            ("saved", {"saved_at": timezone.now()}),
            ("queued", {"later_at": timezone.now()}),
            ("marked", {}),
            ("plain", {}),
        )
    )
    Highlight.objects.create(item=marked, unit=0, start=0, end=4, quote="mark")
    Highlight.objects.create(item=marked, unit=0, start=5, end=9, quote="more")
    listed = owner_client.get("/api/feeds").json()[0]
    assert listed["kept"] == 3
    before = listed["articles"]

    assert owner_client.delete(f"/api/feeds/{feed['id']}").status_code == 204
    assert owner_client.get("/api/feeds").json() == []
    kept = {item["title"]: item for item in owner_client.get("/api/items").json()}
    # Still there, and still under the feed's name, though the feed is gone.
    assert sorted(kept) == ["marked", "queued", "saved"]
    assert {item["origin"] for item in kept.values()} == {feed["title"]}
    assert before > 3 and Item.objects.count() == 3
    assert Highlight.objects.count() == 2
    assert not Item.objects.filter(pk=plain.pk).exists()
    assert owner_client.get(f"/api/items/{saved.pk}").status_code == 200
    assert queued.pk in {item["id"] for item in owner_client.get("/api/items?show=later").json()}

    # The same feed can be followed again; what was kept does not get in its way.
    again = post(owner_client, "feeds", {"url": "https://lowtech.example/feed"})
    assert again.status_code == 201
    assert again.json()["kept"] == 0
    # Removing what is not there is not an error.
    assert owner_client.delete("/api/feeds/0").status_code == 204


def test_articles_kept_from_two_removed_feeds_do_not_collide(owner_client: Client) -> None:
    for name in ("a", "b"):
        feed = Feed.objects.create(url=f"https://{name}.example/feed", title=name.upper())
        # Both feeds call their first entry "1".
        Item.objects.create(
            feed=feed, guid="1", title=name, published_at=timezone.now(), saved_at=timezone.now()
        )
        assert owner_client.delete(f"/api/feeds/{feed.pk}").status_code == 204
    assert sorted(item["origin"] for item in owner_client.get("/api/items").json()) == ["A", "B"]


def test_removing_a_feed_needs_an_open_session(client: Client, db: None) -> None:
    feed = Feed.objects.create(url="https://a.example/feed", title="A")
    assert client.delete(f"/api/feeds/{feed.pk}").status_code == 401
    assert Feed.objects.count() == 1
