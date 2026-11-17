from datetime import UTC, datetime, timedelta
from typing import Any

import pytest
from django.test import Client
from django.utils import timezone

from reader.blocks import from_text
from reader.models import Feed, Item

from .conftest import post

BASE = datetime(2026, 11, 14, 12, 0, tzinfo=UTC)


@pytest.fixture
def stream(owner_client: Client) -> Client:
    """Two feeds with three items, the newest first: Sync, Encryption, Reading."""
    wire = Feed.objects.create(url="https://wire.example/feed", title="Wire Notes")
    crypto = Feed.objects.create(url="https://crypto.example/feed", title="Plain Crypto")

    def item(feed: Feed, title: str, hours_ago: int, body: str = "Some text.") -> None:
        Item.objects.create(
            feed=feed,
            guid=title,
            title=title,
            body=body,
            blocks=from_text(body),
            url=f"https://example.com/{title.split()[0].lower()}",
            published_at=BASE - timedelta(hours=hours_ago),
        )

    item(wire, "Sync protocols, the boring kind", 1, "First paragraph.\n\nSecond paragraph.")
    item(crypto, "Encryption for small apps", 2)
    item(wire, "Reading in the evening", 3)
    return owner_client


def titles(client: Client, query: str = "") -> list[str]:
    return [i["title"].split()[0] for i in client.get(f"/api/items{query}").json()]


def the(client: Client, word: str) -> dict[str, Any]:
    return next(i for i in client.get("/api/items").json() if i["title"].startswith(word))


def change(client: Client, item: dict[str, Any], **body: bool) -> dict[str, Any]:
    response = client.patch(f"/api/items/{item['id']}", body, "application/json")
    assert response.status_code == 200
    return dict(response.json())


def test_the_stream_lists_items_newest_first(stream: Client) -> None:
    assert titles(stream) == ["Sync", "Encryption", "Reading"]
    first = stream.get("/api/items").json()[0]
    assert first == {
        "id": first["id"],
        "source": "RSS",
        "title": "Sync protocols, the boring kind",
        "origin": "Wire Notes",
        "sub": "",
        "replies": 0,
        "published_at": "2026-11-14T11:00:00Z",
        "minutes": 1,
        "unread": True,
        "saved_at": None,
        "later_at": None,
        "media": None,
        "thumb": None,
        "icon": first["icon"],
    }
    assert first["icon"].startswith("/api/feeds/")


def test_an_opened_item_has_its_text_and_address(stream: Client) -> None:
    opened = stream.get(f"/api/items/{the(stream, 'Sync')['id']}").json()
    assert opened["blocks"] == [
        {"type": "paragraph", "spans": [{"text": "First paragraph.", "marks": [], "href": None}]},
        {"type": "paragraph", "spans": [{"text": "Second paragraph.", "marks": [], "href": None}]},
    ]
    assert opened["url"] == "https://example.com/sync"
    assert opened["comments"] == []
    assert stream.get("/api/items/999999").status_code == 404


def test_search_looks_inside_the_text_and_understands_word_forms(stream: Client) -> None:
    # "Sync" has the text "First paragraph. Second paragraph."; nothing else says "paragraph".
    assert titles(stream, "?q=paragraph") == ["Sync"]
    assert titles(stream, "?q=paragraphs") == ["Sync"]
    assert titles(stream, "?q=protocol") == ["Sync"]
    assert titles(stream, "?q=reads") == ["Reading"]
    assert titles(stream, "?q=nothing-says-this") == []


def test_words_typed_together_are_looked_for_together_first(stream: Client) -> None:
    feed = Feed.objects.first()

    def article(title: str, body: str) -> None:
        Item.objects.create(feed=feed, guid=title, title=title, body=body, published_at=BASE)

    article("Pipelines", "A note on the movement of data between systems.")
    article("Warehouses", "Data is kept here. There is little movement.")
    article("Queues", "Data arrives; its movement is tracked.")

    # Three articles have both words. One says them together, and that is the one meant.
    assert titles(stream, "?q=movement of data") == ["Pipelines"]
    assert titles(stream, "?q=movements of data") == ["Pipelines"]
    assert titles(stream, "?q=movement of da") == ["Pipelines"]
    # No article says these together, so the ones with all of them are shown.
    assert sorted(titles(stream, "?q=data movement")) == ["Pipelines", "Queues", "Warehouses"]
    assert sorted(titles(stream, "?q=tracked data")) == ["Queues"]
    # A feed is still found by its name, even when an article's text has the word too.
    article("Radio", "A wireless set, repaired.")
    assert titles(stream, "?q=wire") == ["Radio", "Sync", "Reading"]


def test_an_item_opened_from_a_search_says_which_of_its_words_matched(stream: Client) -> None:
    item = Item.objects.create(
        feed=Feed.objects.first(),
        guid="pipelines",
        title="Pipelines",
        body="The movements of data between systems. Databases move too.",
        published_at=BASE,
    )

    def found(typed: str) -> Any:
        return stream.get(f"/api/items/{item.pk}", {"q": typed}).json()["found"]

    # One list per word searched for, in order: the forms it takes in this article. The last
    # word may be unfinished, so it also stands for words it starts.
    assert found("movement of data") == [["movements"], ["of"], ["data", "databases"]]
    assert found("movement of da") == [["movements"], ["of"], ["data", "databases"]]
    assert found("PIPELINE") == [["pipelines"]]
    # A written query means what it says: whole words, and nothing for what is excluded.
    assert found('"movement of data"') == [["movements"], ["of"], ["data"]]
    assert found("data -systems") == [["data"]]
    assert found("systems or nothing") == [["systems"], []]
    # No search, no words.
    assert found("") == []
    assert found("(((") == []
    assert stream.get(f"/api/items/{item.pk}").json()["found"] == []


def test_search_finds_what_was_said_in_reply_and_follows_the_replies(stream: Client) -> None:
    def reply(text: str) -> dict[str, object]:
        blocks = [{"type": "paragraph", "spans": [{"text": text}]}]
        return {"who": "pfk", "at": timezone.now().isoformat(), "depth": 0, "blocks": blocks}

    story = Item.objects.create(
        source="HN",
        guid="hn-1",
        title="Show HN: an offline archive",
        comments=[reply("Keep a ledger of every export.")],
        published_at=timezone.now(),
    )

    def found(q: str) -> list[str]:
        return [item["title"] for item in stream.get(f"/api/items?q={q}").json()]

    # A word only a reply has finds the story, in any form; the story's own words still do.
    assert found("ledgers") == ["Show HN: an offline archive"]
    assert found("archive") == ["Show HN: an offline archive"]
    # Opened from that search, the item says which of its words matched, replies included.
    opened = stream.get(f"/api/items/{story.pk}?q=ledgers+exports").json()
    assert opened["found"] == [["ledger"], ["export"]]
    # When the discussion changes, so does what is found: nothing has to remember to.
    story.comments = [reply("Tomatoes want sun.")]
    story.save()
    assert found("ledger") == []
    assert found("tomato") == ["Show HN: an offline archive"]


def test_search_takes_phrases_alternatives_and_exclusions(stream: Client) -> None:
    assert titles(stream, '?q="second paragraph"') == ["Sync"]
    assert titles(stream, '?q="second first"') == []
    assert titles(stream, "?q=encryption or evening") == ["Encryption", "Reading"]
    assert titles(stream, "?q=text -encryption") == ["Reading"]


def test_the_start_of_a_word_finds_it_while_typing_but_its_middle_does_not(
    stream: Client,
) -> None:
    for typed in ("en", "encr", "encrypti", "encryption"):
        assert titles(stream, f"?q={typed}") == ["Encryption"], typed
    assert titles(stream, "?q=eveni") == ["Reading"]
    # In the text too: "para" is the start of "paragraph".
    assert titles(stream, "?q=second para") == ["Sync"]
    # Not the middle or the end of a word, in a title, a text or a feed's name.
    assert titles(stream, "?q=ncrypt") == []
    assert titles(stream, "?q=ading") == []
    assert titles(stream, "?q=ire") == []
    assert titles(stream, "?q=graph") == []
    # Every word must be there, not any one of them.
    assert titles(stream, "?q=encryption evening") == []


@pytest.mark.parametrize("typed", ['"unclosed', "a & | ! b", "(((", "-", ":*", "'", "%", "\\"])
def test_anything_typed_into_search_is_safe(stream: Client, typed: str) -> None:
    response = stream.get("/api/items", {"q": typed})
    assert response.status_code == 200


def test_an_enormous_article_is_stored_and_its_start_is_searchable(stream: Client) -> None:
    feed = Feed.objects.first()
    words = " ".join(f"w{n}" for n in range(200_000))
    Item.objects.create(
        feed=feed,
        guid="huge",
        title="Enormous",
        body=f"needle {words} haystackend",
        published_at=BASE,
    )
    assert titles(stream, "?q=needle") == ["Enormous"]
    assert titles(stream, "?q=haystackend") == []


def test_items_narrow_by_source_feed_and_search(stream: Client) -> None:
    wire = Feed.objects.get(title="Wire Notes").pk
    assert titles(stream, f"?feed={wire}") == ["Sync", "Reading"]
    assert titles(stream, "?source=RSS") == ["Sync", "Encryption", "Reading"]
    assert titles(stream, "?source=HN") == []
    # Search looks at the title and at where the item came from, ignoring case.
    assert titles(stream, "?q=ENCRYPT") == ["Encryption"]
    assert titles(stream, "?q=wire") == ["Sync", "Reading"]
    assert titles(stream, "?q=%20%20") == ["Sync", "Encryption", "Reading"]
    assert titles(stream, f"?q=evening&feed={wire}") == ["Reading"]
    assert stream.get("/api/items?source=nope").status_code == 422
    assert stream.get("/api/items?show=everything").status_code == 422


def test_reading_saving_and_queueing_are_separate_and_reversible(stream: Client) -> None:
    sync = the(stream, "Sync")
    assert change(stream, sync, read=True)["unread"] is False
    assert titles(stream, "?show=unread") == ["Encryption", "Reading"]

    saved = change(stream, sync, saved=True)
    assert saved["saved_at"] is not None and saved["later_at"] is None and saved["unread"] is False
    assert titles(stream, "?show=saved") == ["Sync"]

    assert change(stream, sync, later=True)["later_at"] is not None
    assert titles(stream, "?show=later") == ["Sync"]

    undone = change(stream, sync, read=False, saved=False, later=False)
    assert (undone["unread"], undone["saved_at"], undone["later_at"]) == (True, None, None)
    assert titles(stream, "?show=saved") == []


def test_saving_again_keeps_the_time_it_was_first_saved(stream: Client) -> None:
    sync = the(stream, "Sync")
    first = change(stream, sync, saved=True)["saved_at"]
    Item.objects.filter(pk=sync["id"]).update(saved_at=timezone.now() - timedelta(days=2))
    kept = change(stream, sync, saved=True)["saved_at"]
    assert kept != first
    assert datetime.fromisoformat(kept) < timezone.now() - timedelta(days=1)


def test_saved_and_queued_lists_are_ordered_by_when_that_was_done(stream: Client) -> None:
    for word in ("Reading", "Sync", "Encryption"):
        change(stream, the(stream, word), saved=True, later=True)
    assert titles(stream, "?show=saved") == ["Encryption", "Sync", "Reading"]
    assert titles(stream, "?show=later") == ["Encryption", "Sync", "Reading"]


def test_counts_cover_every_source_and_follow_changes(stream: Client) -> None:
    empty = {"RD": 0, "X": 0, "IG": 0, "HN": 0, "YT": 0}
    assert stream.get("/api/counts").json() == {
        "stream": 3,
        "later": 0,
        "saved": 0,
        "highlights": 0,
        "watches": 0,
        "sources": {**empty, "RSS": 3},
    }
    change(stream, the(stream, "Sync"), saved=True, later=True)
    change(stream, the(stream, "Reading"), later=True)
    after = stream.get("/api/counts").json()
    assert (after["stream"], after["saved"], after["later"]) == (3, 1, 2)


def test_a_refetch_keeps_what_the_owner_did_with_an_item(owner_client: Client, web: Any) -> None:
    from reader.tasks import poll_feeds

    from .test_feeds import RSS, ok

    web(ok(RSS))
    post(owner_client, "feeds", {"url": "https://lowtech.example/feed"})
    year = the(owner_client, "A year")
    change(owner_client, year, read=True, saved=True)

    web(ok(RSS.replace(b"130 feeds", b"131 feeds")))
    poll_feeds(timestamp=0)

    again = owner_client.get(f"/api/items/{year['id']}").json()
    assert again["blocks"][0]["spans"][1]["text"] == "131 feeds"
    assert again["unread"] is False and again["saved_at"] is not None


def test_items_need_an_open_session(stream: Client) -> None:
    item = the(stream, "Sync")
    path = f"/api/items/{item['id']}"
    stranger = Client()
    assert stranger.get("/api/items").status_code == 401
    assert stranger.get("/api/counts").status_code == 401
    assert stranger.patch(path, {"saved": True}, "application/json").status_code == 401
    post(stream, "lock")
    assert stream.get(path).status_code == 423
    assert stream.patch(path, {"saved": True}, "application/json").status_code == 423
    assert Item.objects.filter(saved_at__isnull=False).count() == 0
