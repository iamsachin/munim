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

    # Leave the database as every other test expects it: fully migrated.
    MigrationExecutor(connection).migrate(MigrationExecutor(connection).loader.graph.leaf_nodes())
