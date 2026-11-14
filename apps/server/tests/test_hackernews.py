from datetime import UTC, datetime
from typing import Any

import httpx
from django.test import Client

from reader.models import Item
from reader.tasks import poll_hacker_news

POSTED = int(datetime(2026, 11, 14, 9, 0, tzinfo=UTC).timestamp())

STORIES: dict[int, Any] = {
    1: {
        "id": 1,
        "type": "story",
        "title": "Show HN: A local-first archive",
        "url": "https://archive.example/launch",
        "score": 612,
        "descendants": 3,
        "time": POSTED,
    },
    2: {
        "id": 2,
        "type": "story",
        "title": "Ask HN: How do you keep track of long discussions?",
        "text": "I lose my place. <p>What do <i>you</i> do?",
        "score": 1,
        "descendants": 0,
        "time": POSTED,
    },
    3: {"id": 3, "type": "job", "title": "A company is hiring", "score": 1, "time": POSTED},
    4: None,  # What the site sends for a story that is gone.
}
THREAD = {
    "author": "maker",
    "children": [
        {
            "author": "pfk",
            "text": 'Export first is right. <a href="https://x.example/a">x.example/a</a>'
            '<img src="https://tracker.example/p.png"><script>alert(1)</script>',
            "created_at_i": POSTED + 3600,
            "children": [
                {
                    "author": None,
                    "text": None,
                    "children": [
                        {"author": "dannyw", "text": "Agreed.", "created_at_i": POSTED + 7200}
                    ],
                }
            ],
        },
        {"author": "lee", "text": "<pre><code>munim export</code></pre>", "created_at_i": POSTED},
    ],
}


def site(asked: list[str], stories: dict[int, Any] = STORIES) -> Any:
    """Hacker News and HN Search, answering from the stories above."""

    def handler(request: httpx.Request) -> httpx.Response:
        asked.append(f"{request.url.host}{request.url.path}")
        last = request.url.path.rsplit("/", 1)[-1].removesuffix(".json")
        if last == "topstories":
            return httpx.Response(200, json=list(stories))
        if request.url.host == "hn.algolia.com":
            return httpx.Response(200, json=THREAD) if last == "1" else httpx.Response(404)
        return httpx.Response(200, json=stories[int(last)])

    return handler


def stories(client: Client) -> list[dict[str, Any]]:
    """The two stories, the Show HN first. Asserts there are no more: no jobs, no duplicates."""
    found = sorted(
        client.get("/api/items?source=HN").json(), key=lambda i: i["title"], reverse=True
    )
    assert [i["title"][:4] for i in found] == ["Show", "Ask "]
    return found


def switch(client: Client, enabled: bool) -> Any:
    return client.put("/api/sources/hacker-news", {"enabled": enabled}, "application/json")


def test_hacker_news_is_off_until_the_owner_switches_it_on(owner_client: Client, web: Any) -> None:
    asked: list[str] = []
    web(site(asked))
    off = {"enabled": False, "synced_at": None, "problem": ""}
    assert owner_client.get("/api/sources/hacker-news").json() == off

    poll_hacker_news(timestamp=0)
    assert asked == []
    assert Item.objects.count() == 0

    assert switch(owner_client, True).json()["enabled"] is True
    # Asking twice is not an error: the fetch is already queued.
    assert switch(owner_client, True).status_code == 200
    assert owner_client.get("/api/sources/hacker-news").json()["enabled"] is True


def test_the_front_page_arrives_with_points_text_and_discussion(
    owner_client: Client, web: Any
) -> None:
    web(site([]))
    switch(owner_client, True)
    poll_hacker_news(timestamp=0)

    show, ask = stories(owner_client)
    assert (show["title"], show["origin"], show["replies"]) == (
        "Show HN: A local-first archive",
        "612 points",
        3,
    )
    assert (ask["origin"], ask["replies"], ask["source"]) == ("1 point", 0, "HN")
    assert owner_client.get("/api/sources/hacker-news").json()["synced_at"] is not None

    opened = owner_client.get(f"/api/items/{show['id']}").json()
    # "Open original" is the discussion; the story's link is the first thing in its text.
    assert opened["url"] == "https://news.ycombinator.com/item?id=1"
    assert opened["blocks"] == [
        {
            "type": "paragraph",
            "spans": [
                {
                    "text": "https://archive.example/launch",
                    "marks": [],
                    "href": "https://archive.example/launch",
                }
            ],
        }
    ]
    # In reading order; a deleted reply's own replies take its place; no image, no script.
    assert [(c["who"], c["depth"]) for c in opened["comments"]] == [
        ("pfk", 0),
        ("dannyw", 1),
        ("lee", 0),
    ]
    first, _, code = opened["comments"]
    assert [span["text"] for span in first["blocks"][0]["spans"]] == [
        "Export first is right. ",
        "x.example/a",
    ]
    assert len(first["blocks"]) == 1
    assert code["blocks"] == [{"type": "code", "text": "munim export"}]
    assert first["meta"].endswith(("m", "h", "d"))

    text = owner_client.get(f"/api/items/{ask['id']}").json()
    assert [block["type"] for block in text["blocks"]] == ["paragraph", "paragraph"]
    assert text["comments"] == []


def test_polling_again_updates_stories_and_asks_for_a_thread_only_when_it_grew(
    owner_client: Client, web: Any
) -> None:
    asked: list[str] = []
    web(site(asked))
    switch(owner_client, True)
    poll_hacker_news(timestamp=0)
    show, _ = stories(owner_client)
    owner_client.patch(f"/api/items/{show['id']}", {"read": True}, "application/json")

    asked.clear()
    poll_hacker_news(timestamp=0)
    # Neither discussion has grown, and one has no replies at all: HN Search is not asked.
    assert [a for a in asked if a.startswith("hn.algolia.com")] == []

    grown = {**STORIES, 1: {**STORIES[1], "score": 700, "descendants": 4}}
    asked.clear()
    web(site(asked, grown))
    poll_hacker_news(timestamp=0)
    assert "hn.algolia.com/api/v1/items/1" in asked

    show, _ = stories(owner_client)
    assert (show["origin"], show["replies"], show["unread"]) == ("700 points", 4, False)


def test_when_hacker_news_cannot_be_reached_it_says_so_and_keeps_what_it_has(
    owner_client: Client, web: Any
) -> None:
    web(site([]))
    switch(owner_client, True)
    poll_hacker_news(timestamp=0)

    web(lambda request: httpx.Response(503))
    poll_hacker_news(timestamp=0)
    state = owner_client.get("/api/sources/hacker-news").json()
    assert state["problem"] == "The story's server answered 503."
    assert len(owner_client.get("/api/items?source=HN").json()) == 2

    # Switched off, it is not asked again, and what was fetched stays.
    asked: list[str] = []
    web(site(asked))
    assert switch(owner_client, False).json()["enabled"] is False
    poll_hacker_news(timestamp=0)
    assert asked == []
    assert len(owner_client.get("/api/items?source=HN").json()) == 2


def test_hacker_news_needs_an_open_session(client: Client, db: None) -> None:
    assert client.get("/api/sources/hacker-news").status_code == 401
    assert switch(client, True).status_code == 401
