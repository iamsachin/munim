"""YouTube: new videos from the channels the owner subscribes to.

Read through Google's own YouTube Data API, with the owner's sign-in (OAuth). Each install uses
its own Google Cloud project: the owner gives Munim that project's client id and secret, signs
in once, and Munim keeps the refresh token, sealed.

Google allows a project 10,000 units a day and every call costs one. So a channel's uploads are
read only when YouTube says the channel has a different number of videos than last time; the
list of subscriptions, which carries that number, costs one call per fifty channels.
"""

import json
import re
from collections.abc import Iterator
from datetime import datetime, timedelta
from typing import Any
from urllib.parse import urlencode

import httpx
from django.utils import timezone
from pydantic import BaseModel, ValidationError

from munim import vault
from reader import feeds
from reader.blocks import from_text, text_of
from reader.models import Channel, Connection, Item, Source

AUTH = "https://accounts.google.com/o/oauth2/v2/auth"
TOKEN = "https://oauth2.googleapis.com/token"  # noqa: S105  an address, not a secret
REVOKE = "https://oauth2.googleapis.com/revoke"
API = "https://www.googleapis.com/youtube/v3"
# Read-only: Munim cannot post, rate or change anything on the account.
SCOPE = "https://www.googleapis.com/auth/youtube.readonly"

# shortcut: more subscriptions than this are not followed, page further if anyone has them.
MAX_CHANNELS = 1000
# The newest few uploads of a channel that changed; a channel seldom posts more in an hour.
UPLOADS = 5
# A channel seen for the first time brings only what it posted lately, not its whole past.
FIRST_SIGHT = timedelta(days=7)


class Problem(Exception):
    """Something the owner should be told, in words for them. Never contains a secret."""


class _Subscription(BaseModel):
    class Snippet(BaseModel):
        class Resource(BaseModel):
            channelId: str

        title: str = ""
        resourceId: Resource

    class Details(BaseModel):
        totalItemCount: int | None = None

    snippet: Snippet
    contentDetails: Details = Details()


class _ChannelInfo(BaseModel):
    class Snippet(BaseModel):
        title: str = ""

    class Details(BaseModel):
        class Related(BaseModel):
            uploads: str = ""

        relatedPlaylists: Related = Related()

    id: str
    snippet: Snippet = Snippet()
    contentDetails: Details = Details()


class _Upload(BaseModel):
    class Details(BaseModel):
        videoId: str
        videoPublishedAt: datetime | None = None

    contentDetails: Details


class _Video(BaseModel):
    class Snippet(BaseModel):
        class Thumb(BaseModel):
            url: str = ""

        title: str = ""
        description: str = ""
        channelTitle: str = ""
        publishedAt: datetime
        liveBroadcastContent: str = "none"
        thumbnails: dict[str, Thumb] = {}

    class Details(BaseModel):
        duration: str = ""

    id: str
    snippet: Snippet
    contentDetails: Details = Details()


# --- the connection and its sealed secrets


def connection() -> Connection:
    return Connection.objects.get_or_create(source=Source.YOUTUBE)[0]


def secrets_of(found: Connection) -> dict[str, str]:
    """The client id, client secret and refresh token, as far as they have been given."""
    return dict(json.loads(vault.unseal(found.sealed))) if found.sealed else {}


def keep(found: Connection, **changes: str | None) -> None:
    """Seals the secrets again with some added, replaced or (given None) removed."""
    secrets = {**secrets_of(found), **changes}
    found.sealed = vault.seal(json.dumps({k: v for k, v in secrets.items() if v is not None}))


# --- talking to Google


def _said(response: httpx.Response) -> str:
    """Google's own short name for what went wrong, if it gave one."""
    try:
        body = response.json()
    except ValueError:
        return ""
    error = body.get("error", "") if isinstance(body, dict) else ""
    if isinstance(error, dict):
        reasons = [e.get("reason", "") for e in error.get("errors", []) if isinstance(e, dict)]
        return str(reasons[0] if reasons else error.get("status", ""))
    return str(error)


def _token(client: httpx.Client, form: dict[str, str]) -> dict[str, Any]:
    response = client.post(TOKEN, data=form)
    if response.status_code != 200:
        if _said(response) == "invalid_grant":
            raise Problem("Google no longer accepts Munim's sign-in. Connect YouTube again.")
        if _said(response) in ("invalid_client", "unauthorized_client"):
            raise Problem("Google does not recognise the client ID and secret. Check them.")
        raise Problem(f"Google refused the sign-in ({response.status_code}).")
    return dict(response.json())


def _get(client: httpx.Client, token: str, what: str, **params: str | int) -> dict[str, Any]:
    response = client.get(
        f"{API}/{what}", params=params, headers={"Authorization": f"Bearer {token}"}
    )
    if response.status_code == 200:
        return dict(response.json())
    said = _said(response)
    if said in ("quotaExceeded", "dailyLimitExceeded", "rateLimitExceeded"):
        raise Problem(
            "Google's daily allowance for this project is used up. It starts again at midnight, "
            "Pacific time."
        )
    if response.status_code == 401:
        raise Problem("Google no longer accepts Munim's sign-in. Connect YouTube again.")
    if said == "accessNotConfigured":
        raise Problem("The YouTube Data API is not switched on in the Google Cloud project.")
    raise Problem(f"YouTube answered {response.status_code}{f' ({said})' if said else ''}.")


def _pages(client: httpx.Client, token: str, what: str, **params: str | int) -> Iterator[Any]:
    """Every item of a list, across its pages."""
    page = ""
    while True:
        more = {"pageToken": page} if page else {}
        body = _get(client, token, what, maxResults=50, **params, **more)
        yield from body.get("items", [])
        page = str(body.get("nextPageToken", ""))
        if not page:
            return


def _read[T: BaseModel](shape: type[T], raw: Any) -> T | None:
    """One thing from Google, or None if it is not in the shape expected: skipped, not fatal."""
    try:
        return shape.model_validate(raw)
    except ValidationError:
        return None


# --- signing in


def authorize_url(client_id: str, redirect_uri: str, state: str) -> str:
    """Where to send the owner to give Munim read-only access."""
    return f"{AUTH}?" + urlencode(
        {
            "client_id": client_id,
            "redirect_uri": redirect_uri,
            "response_type": "code",
            "scope": SCOPE,
            # offline: a refresh token, so the worker can read with nobody signed in.
            # consent: Google only hands a refresh token out again if it asks again.
            "access_type": "offline",
            "prompt": "consent",
            "state": state,
        }
    )


def connect(found: Connection, code: str, redirect_uri: str) -> None:
    """Finishes the sign-in: trades Google's code for lasting access and notes whose it is."""
    secrets = secrets_of(found)
    with feeds.new_client() as client:
        granted = _token(
            client,
            {
                "code": code,
                "client_id": secrets.get("client_id", ""),
                "client_secret": secrets.get("client_secret", ""),
                "redirect_uri": redirect_uri,
                "grant_type": "authorization_code",
            },
        )
        if not granted.get("refresh_token"):
            raise Problem("Google did not give lasting access. Connect YouTube again.")
        if SCOPE not in str(granted.get("scope", "")).split():
            raise Problem("Access to your subscriptions was not granted. Connect YouTube again.")
        mine = _get(client, str(granted["access_token"]), "channels", part="snippet", mine="true")
    owner = _read(_ChannelInfo, (mine.get("items") or [None])[0])
    keep(found, refresh_token=str(granted["refresh_token"]))
    found.account = (owner.snippet.title if owner else "")[:300] or "Your subscriptions"
    found.enabled = True
    found.problem = ""
    found.save()


def disconnect(found: Connection) -> None:
    """Forgets the sign-in, and tells Google to forget it too if it can be reached. The client
    id and secret stay, so connecting again is one click; videos already fetched stay."""
    token = secrets_of(found).get("refresh_token")
    if token:
        try:
            with feeds.new_client() as client:
                client.post(REVOKE, data={"token": token})
        except httpx.HTTPError:
            pass  # It is forgotten here either way; the owner can also remove it at Google.
    keep(found, refresh_token=None)
    found.enabled = False
    found.account = ""
    found.problem = ""
    found.synced_at = None
    found.save()
    Channel.objects.all().delete()


# --- reading

_DURATION = re.compile(r"P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$")


def length(duration: str) -> str:
    """ "18:24" or "1:02:03" from YouTube's "PT18M24S". Empty if it is not a length."""
    found = _DURATION.match(duration)
    if not found or not any(found.groups()):
        return ""
    days, hours, minutes, seconds = (int(part or 0) for part in found.groups())
    hours += days * 24
    return f"{hours}:{minutes:02}:{seconds:02}" if hours else f"{minutes}:{seconds:02}"


def _chunks(ids: list[str]) -> Iterator[list[str]]:
    for start in range(0, len(ids), 50):
        yield ids[start : start + 50]


def _store(video: _Video) -> None:
    item = Item.objects.filter(source=Source.YOUTUBE, feed=None, guid=video.id).first()
    item = item or Item(source=Source.YOUTUBE, guid=video.id)
    live = {"live": "live now", "upcoming": "upcoming"}.get(video.snippet.liveBroadcastContent)
    long = length(video.contentDetails.duration)
    thumbs = video.snippet.thumbnails
    picture = next((thumbs[k].url for k in ("high", "medium", "default") if k in thumbs), "")
    text = from_text(video.snippet.description)
    item.blocks = [{"type": "image", "src": picture, "alt": ""}, *text] if picture else text
    item.body = text_of(text)
    item.title = video.snippet.title[:500]
    item.url = f"https://www.youtube.com/watch?v={video.id}"
    item.origin = video.snippet.channelTitle[:300]
    item.sub = live or (f"video {long}" if long else "video")
    item.media = "Video"
    item.published_at = video.snippet.publishedAt
    item.save()


def _fetch(client: httpx.Client, token: str) -> None:
    """One pass: subscriptions, then the uploads of every channel that has changed."""
    subscribed: dict[str, tuple[str, int | None]] = {}
    for raw in _pages(client, token, "subscriptions", part="snippet,contentDetails", mine="true"):
        sub = _read(_Subscription, raw)
        if sub and len(subscribed) < MAX_CHANNELS:
            total = sub.contentDetails.totalItemCount
            subscribed[sub.snippet.resourceId.channelId] = (sub.snippet.title, total)

    known = {channel.channel_id: channel for channel in Channel.objects.all()}
    Channel.objects.exclude(channel_id__in=subscribed).delete()

    # A channel never seen before: find the playlist its uploads are in.
    for ids in _chunks([cid for cid in subscribed if cid not in known]):
        body = _get(client, token, "channels", part="contentDetails", id=",".join(ids))
        for raw in body.get("items", []):
            info = _read(_ChannelInfo, raw)
            if info and info.contentDetails.relatedPlaylists.uploads:
                known[info.id] = Channel(
                    channel_id=info.id, uploads=info.contentDetails.relatedPlaylists.uploads
                )

    since = timezone.now() - FIRST_SIGHT
    wanted: list[str] = []
    for channel_id, (title, total) in subscribed.items():
        channel = known.get(channel_id)
        if channel is None:
            continue
        first = channel._state.adding
        if first or channel.videos != total or total is None:
            try:
                uploads = _get(
                    client,
                    token,
                    "playlistItems",
                    part="contentDetails",
                    playlistId=channel.uploads,
                    maxResults=UPLOADS,
                ).get("items", [])
            except Problem as problem:
                if "playlistNotFound" not in str(problem):
                    raise
                uploads = []  # A channel that has never uploaded has no such playlist.
            for raw in uploads:
                upload = _read(_Upload, raw)
                at = upload.contentDetails.videoPublishedAt if upload else None
                if upload and not (first and at is not None and at < since):
                    wanted.append(upload.contentDetails.videoId)
        channel.title = title[:300]
        channel.videos = total
        channel.save()

    have = set(
        Item.objects.filter(source=Source.YOUTUBE, guid__in=wanted).values_list("guid", flat=True)
    )
    for ids in _chunks([video for video in dict.fromkeys(wanted) if video not in have]):
        body = _get(client, token, "videos", part="snippet,contentDetails", id=",".join(ids))
        for raw in body.get("items", []):
            video = _read(_Video, raw)
            if video:
                _store(video)


def refresh() -> None:
    """Fetches new videos, if the owner has connected YouTube."""
    found = Connection.objects.filter(source=Source.YOUTUBE, enabled=True).first()
    secrets = secrets_of(found) if found else {}
    if found is None or not secrets.get("refresh_token"):
        return
    try:
        with feeds.new_client() as client:
            granted = _token(
                client,
                {
                    "client_id": secrets.get("client_id", ""),
                    "client_secret": secrets.get("client_secret", ""),
                    "refresh_token": secrets["refresh_token"],
                    "grant_type": "refresh_token",
                },
            )
            _fetch(client, str(granted["access_token"]))
        found.problem = ""
        found.synced_at = timezone.now()
    except Problem as problem:
        found.problem = str(problem)[:300]
    except httpx.HTTPError:
        found.problem = "Google could not be reached."
    # Only these: the sealed secrets may have been changed from the Connections screen meanwhile.
    found.save(update_fields=["problem", "synced_at"])
