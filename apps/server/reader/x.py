"""X, for watches only.

X charges for every post an app reads, so Munim reads none but those a watch asks for: a
keyword or a person the owner has switched on for X is searched once a day, and at most ten
posts come back, the most relevant first. They become items like any other, each a match of
its watch. The owner's X developer app pays, with a token they paste into Connections.
"""

import re
from datetime import UTC, datetime, timedelta

import httpx
from django.utils import timezone
from pydantic import BaseModel, ValidationError

from munim import vault
from reader.models import Connection, Item, Match, Source, Watch

SEARCH = "https://api.x.com/2/tweets/search/recent"
# The owner's decision (2026-11-17): ten posts a day for each watch. It is also the fewest X
# will be asked for at once, so a watch costs one request a day.
MOST_A_DAY = 10
EVERY = timedelta(days=1)
TIMEOUT_SECONDS = 20
TITLE_CHARACTERS = 140
# When X's clock began, in milliseconds: a post's id holds the moment it was made.
EPOCH_MS = 1288834974657

_ACCOUNT = re.compile(r"@?([A-Za-z0-9_]{1,15})")

REJECTED = "X rejected the token. Replace it under Connections."
UNREACHABLE = "X could not be reached."
UNREADABLE = "X sent something Munim could not read."


class _Post(BaseModel):
    id: str
    text: str
    author_id: str = ""


class _User(BaseModel):
    id: str
    username: str


class _Includes(BaseModel):
    users: list[_User] = []


class _Found(BaseModel):
    """What X's search answers with, as far as Munim uses it."""

    data: list[_Post] = []
    includes: _Includes = _Includes()


class Problem(Exception):
    """Why X gave nothing, in words for the owner."""


def connection() -> Connection:
    return Connection.objects.get_or_create(source=Source.X)[0]


def keep(token: str) -> None:
    """Stores the token, sealed. The browser is only ever told its last four characters."""
    found = connection()
    found.sealed, found.account = vault.seal(token), token[-4:]
    found.enabled, found.problem, found.synced_at = True, "", None
    found.save()


def query_of(watch: Watch) -> str:
    """What X is asked for: a person's own posts, or a keyword's words together. Reposts are
    left out: they would be paid for twice."""
    if watch.kind == Watch.Kind.PERSON:
        account = _ACCOUNT.fullmatch(watch.name.strip())
        if account is None:
            raise Problem(f"“{watch.name}” is not an X account name, so X was not asked for it.")
        return f"from:{account.group(1)} -is:retweet"
    # In quotation marks, so that nothing in the words is read by X as an instruction.
    words = " ".join(watch.name.replace('"', " ").split())
    return f'"{words}" -is:retweet'


def made_at(post_id: str) -> datetime:
    return datetime.fromtimestamp(((int(post_id) >> 22) + EPOCH_MS) / 1000, tz=UTC)


def _search(client: httpx.Client, token: str, watch: Watch, since: datetime) -> _Found:
    response = client.get(
        SEARCH,
        params={
            "query": query_of(watch),
            "max_results": MOST_A_DAY,
            "sort_order": "relevancy",
            "start_time": since.strftime("%Y-%m-%dT%H:%M:%SZ"),
            # Who wrote each post: without it there is only a number.
            "expansions": "author_id",
        },
        headers={"Authorization": f"Bearer {token}"},
    )
    if response.status_code in (401, 403):
        raise Problem(REJECTED)
    if response.status_code != 200:
        raise Problem(
            f"X answered {response.status_code}, so nothing was fetched. If its credits have "
            "run out, buy more in X's developer console."
        )
    try:
        return _Found.model_validate_json(response.content)
    except ValidationError:
        raise Problem(UNREADABLE) from None


def look(watch: Watch, token: str, client: httpx.Client, now: datetime) -> None:
    """Asks X for the past day's posts for one watch, and keeps each as an item that matches
    it. A post already held is not made twice."""
    found = _search(client, token, watch, now - EVERY)
    names = {user.id: user.username for user in found.includes.users}
    for post in found.data[:MOST_A_DAY]:
        if not post.id.isdigit():
            continue
        name = names.get(post.author_id, "")
        first = post.text.strip().split("\n", 1)[0]
        title = first if len(first) <= TITLE_CHARACTERS else f"{first[:TITLE_CHARACTERS]}…"
        item, _ = Item.objects.update_or_create(
            source=Source.X,
            feed=None,
            guid=post.id,
            defaults={
                "url": f"https://x.com/{name or 'i/web'}/status/{post.id}",
                "title": title or "A post on X",
                "body": post.text,
                "blocks": [{"type": "paragraph", "spans": [{"text": post.text}]}],
                "origin": f"@{name}" if name else "X",
                "published_at": made_at(post.id),
            },
        )
        Match.objects.get_or_create(watch=watch, item=item)


def look_all() -> None:
    """Every watch that is on, and on for X, is looked for on X, once a day. One that fails is
    tried again within the hour, which costs nothing: X charges for posts, not for asking."""
    found = Connection.objects.filter(source=Source.X, enabled=True).exclude(sealed="").first()
    if found is None:
        return
    now = timezone.now()
    due = list(
        Watch.objects.filter(on=True, on_x=True)
        .exclude(kind=Watch.Kind.TOPIC)
        .exclude(x_looked_at__gt=now - EVERY)
    )
    if not due:
        return
    token = vault.unseal(found.sealed)
    problem = ""
    with httpx.Client(timeout=TIMEOUT_SECONDS) as client:
        for watch in due:
            try:
                look(watch, token, client, now)
            except Problem as said:
                problem = str(said)
                if problem == REJECTED:
                    break
                continue
            except httpx.HTTPError:
                problem = UNREACHABLE
                break
            Watch.objects.filter(pk=watch.pk).update(x_looked_at=now)
    found.synced_at, found.problem = now, problem
    found.save(update_fields=["synced_at", "problem"])
