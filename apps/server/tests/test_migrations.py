from datetime import UTC, datetime

import pytest
from django.db import connection
from django.db.migrations.executor import MigrationExecutor


@pytest.mark.django_db(transaction=True)
def test_articles_stored_before_the_rename_are_still_there_as_items() -> None:
    """An install that already has articles must keep them when it upgrades."""
    executor = MigrationExecutor(connection)
    executor.migrate([("reader", "0001_initial")])
    old = executor.loader.project_state([("reader", "0001_initial")]).apps
    feed = old.get_model("reader", "Feed").objects.create(
        url="https://lowtech.example/feed", title="Low Tech Notes"
    )
    old.get_model("reader", "Article").objects.create(
        feed=feed,
        guid="year-1",
        url="https://lowtech.example/year",
        title="A year of running my own feed reader",
        body="I started the year with 130 feeds.",
        published_at=datetime(2026, 11, 14, 6, 0, tzinfo=UTC),
    )

    executor = MigrationExecutor(connection)
    executor.migrate([("reader", "0002_items")])
    new = executor.loader.project_state([("reader", "0002_items")]).apps
    (item,) = new.get_model("reader", "Item").objects.all()

    assert item.title == "A year of running my own feed reader"
    assert item.body == "I started the year with 130 feeds."
    assert item.guid == "year-1"
    assert item.feed.title == "Low Tech Notes"
    # What is new starts in the only state that is true of an article nobody has opened.
    assert (item.source, item.read_at, item.saved_at, item.later_at) == ("RSS", None, None, None)

    # The next migration gives the stored text its blocks: one paragraph each.
    executor = MigrationExecutor(connection)
    executor.migrate([("reader", "0003_blocks")])
    newer = executor.loader.project_state([("reader", "0003_blocks")]).apps
    (item,) = newer.get_model("reader", "Item").objects.all()
    assert item.blocks == [
        {"type": "paragraph", "spans": [{"text": "I started the year with 130 feeds."}]}
    ]
    assert item.body == "I started the year with 130 feeds."

    # The one after makes room for sources that are not feeds; an article is still its feed's.
    executor = MigrationExecutor(connection)
    executor.migrate([("reader", "0004_hacker_news")])
    newest = executor.loader.project_state([("reader", "0004_hacker_news")]).apps
    (item,) = newest.get_model("reader", "Item").objects.all()
    assert item.feed.title == "Low Tech Notes"
    assert (item.origin, item.replies, item.comments) == ("", 0, [])

    # Leave the database as every other test expects it: fully migrated.
    MigrationExecutor(connection).migrate(MigrationExecutor(connection).loader.graph.leaf_nodes())

    # Fully migrated, the article stored at the very beginning can be found by its words.
    from django.contrib.postgres.search import SearchQuery

    from reader.models import Item

    found = Item.objects.filter(search=SearchQuery("feed", config="english"))
    assert [item.title for item in found] == ["A year of running my own feed reader"]


@pytest.mark.django_db(transaction=True)
def test_replies_stored_before_they_were_searched_are_found_afterwards() -> None:
    """An install that already holds discussions must find their words once it upgrades."""
    from django.contrib.postgres.search import SearchQuery

    executor = MigrationExecutor(connection)
    executor.migrate([("reader", "0013_match_judged")])
    old = executor.loader.project_state([("reader", "0013_match_judged")]).apps
    reply = {
        "who": "pfk",
        "meta": "3h",
        "depth": 0,
        "blocks": [
            {"type": "paragraph", "spans": [{"text": "Export first is "}, {"text": "right."}]},
            {"type": "list", "ordered": False, "items": [[{"text": "Keep a ledger"}]]},
        ],
    }
    old.get_model("reader", "Item").objects.create(
        source="HN",
        guid="1",
        title="Show HN: an archive",
        comments=[reply],
        published_at=datetime(2026, 11, 14, 6, 0, tzinfo=UTC),
    )
    old.get_model("reader", "Item").objects.create(
        source="HN", guid="2", title="No replies", published_at=datetime(2026, 11, 14, tzinfo=UTC)
    )

    executor = MigrationExecutor(connection)
    executor.migrate([("reader", "0014_reply_search")])
    new = executor.loader.project_state([("reader", "0014_reply_search")]).apps
    items = new.get_model("reader", "Item").objects
    assert items.get(guid="1").said == "Export first is right.\n\nKeep a ledger"
    assert items.get(guid="2").said == ""
    # The words of the reply are in the search column, and those of the title still are.
    for words in ("ledger", "export", "archive"):
        found = items.filter(search=SearchQuery(words, config="english"))
        assert [item.guid for item in found] == ["1"], words
    # And the column still has its index.
    with connection.cursor() as cursor:
        cursor.execute("SELECT indexdef FROM pg_indexes WHERE indexname = 'item_search'")
        assert "gin" in cursor.fetchone()[0].lower()

    # Leave the database as every other test expects it: fully migrated.
    MigrationExecutor(connection).migrate(MigrationExecutor(connection).loader.graph.leaf_nodes())
    new.get_model("reader", "Item").objects.all().delete()
