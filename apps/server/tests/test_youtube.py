from datetime import timedelta
from typing import Any
from urllib.parse import parse_qs, urlsplit

import httpx
import pytest
from django.test import Client
from django.utils import timezone

from reader import youtube
from reader.models import Channel, Connection, Item
from reader.tasks import poll_youtube

CLIENT_ID = "1234567890-" + "a" * 12 + ".apps.googleusercontent.com"
CLIENT_SECRET = "made-up-" + "s" * 16  # built from parts so no scanner takes it for real
REFRESH = "made-up-refresh-" + "r" * 12
CALLBACK = "http://testserver/api/sources/youtube/callback"


def ago(**delta: int) -> str:
    return (timezone.now() - timedelta(**delta)).isoformat()


def video(number: int, channel: str, *, days: int = 1, length: str = "PT18M24S") -> Any:
    return {
        "id": f"vid{number}",
        "snippet": {
            "title": f"Video {number}",
            "description": "First line.\n\nSecond paragraph, with 0:00 Intro.",
            "channelTitle": channel,
            "publishedAt": ago(days=days),
            "liveBroadcastContent": "none",
            "thumbnails": {
                "default": {"url": f"https://i.ytimg.com/vi/vid{number}/default.jpg"},
                "high": {"url": f"https://i.ytimg.com/vi/vid{number}/hqdefault.jpg"},
            },
        },
        "contentDetails": {"duration": length},
    }


class Google:
    """Stands in for Google's sign-in and the YouTube Data API."""

    def __init__(self) -> None:
        self.asked: list[str] = []
        self.forms: list[dict[str, str]] = []
        self.bearers: set[str] = set()
        self.refusal = ""
        self.api_error: tuple[int, str] | None = None
        self.down = False
        # channel id -> (title, how many videos YouTube says it has)
        self.subscriptions = {"UCbench": ("Bench Hours", 40), "UCkiln": ("Studio Kiln", 12)}
        self.uploads = {
            "UUbench": [("vid1", 1), ("vid2", 30)],  # (video, days ago)
            "UUkiln": [("vid3", 2)],
        }
        self.videos = {
            "vid1": video(1, "Bench Hours"),
            "vid2": video(2, "Bench Hours", days=30),
            "vid3": video(3, "Studio Kiln", days=2, length="PT1H2M3S"),
        }

    def __call__(self, request: httpx.Request) -> httpx.Response:
        if self.down:
            raise httpx.ConnectError("no route", request=request)
        path = request.url.path
        query = dict(request.url.params)
        if request.method == "POST":
            form = {k: v[0] for k, v in parse_qs(request.content.decode()).items()}
            self.forms.append(form)
            if path == "/revoke":
                return httpx.Response(200, json={})
            if self.refusal:
                return httpx.Response(400, json={"error": self.refusal})
            granted = {
                "access_token": "access-1",
                "expires_in": 3600,
                "scope": youtube.SCOPE,
                "token_type": "Bearer",
            }
            if form["grant_type"] == "authorization_code":
                granted["refresh_token"] = REFRESH
            return httpx.Response(200, json=granted)

        self.bearers.add(request.headers.get("authorization", ""))
        what = path.rsplit("/", 1)[-1]
        self.asked.append(what + ("?mine" if query.get("mine") else ""))
        if self.api_error:
            status, reason = self.api_error
            error = {"errors": [{"reason": reason}], "status": "X"}
            return httpx.Response(status, json={"error": error})
        if what == "subscriptions":
            items = [
                {
                    "snippet": {"title": title, "resourceId": {"channelId": channel}},
                    "contentDetails": {"totalItemCount": total},
                }
                for channel, (title, total) in self.subscriptions.items()
            ]
            return httpx.Response(200, json={"items": items})
        if what == "channels" and query.get("mine"):
            return httpx.Response(200, json={"items": [{"id": "UCme", "snippet": {"title": "Me"}}]})
        if what == "channels":
            items = [
                {"id": c, "contentDetails": {"relatedPlaylists": {"uploads": "UU" + c[2:]}}}
                for c in query["id"].split(",")
            ]
            return httpx.Response(200, json={"items": items})
        if what == "playlistItems":
            items = [
                {"contentDetails": {"videoId": v, "videoPublishedAt": ago(days=days)}}
                for v, days in self.uploads[query["playlistId"]]
            ]
            return httpx.Response(200, json={"items": items})
        assert what == "videos"
        return httpx.Response(200, json={"items": [self.videos[v] for v in query["id"].split(",")]})


@pytest.fixture
def google(web: Any) -> Google:
    stand = Google()
    web(stand)
    return stand


def set_up(client: Client) -> Any:
    body = {"client_id": f"  {CLIENT_ID} ", "client_secret": CLIENT_SECRET}
    return client.put("/api/sources/youtube/credentials", body, "application/json")


def sign_in(client: Client) -> Any:
    """Goes to Google and comes back with its code, as a browser would."""
    start = client.get("/api/sources/youtube/start")
    state = parse_qs(urlsplit(start["Location"]).query)["state"][0]
    return client.get("/api/sources/youtube/callback", {"code": "the-code", "state": state})


@pytest.fixture
def connected(owner_client: Client, google: Google) -> Client:
    set_up(owner_client)
    assert sign_in(owner_client)["Location"] == "/connections"
    return owner_client


def state(client: Client) -> Any:
    return client.get("/api/sources/youtube").json()


def test_before_anything_is_set_up_it_says_where_google_must_send_the_owner_back(
    owner_client: Client, settings: Any
) -> None:
    settings.ALLOWED_HOSTS = [*settings.ALLOWED_HOSTS, "munim.lan"]
    assert state(owner_client) == {
        "configured": False,
        "connected": False,
        "account": "",
        "synced_at": None,
        "problem": "",
        "redirect_uri": CALLBACK,
        # Google accepts only https, or this machine; the test's own address is neither.
        "redirect_ok": False,
    }
    # With nothing set up there is nowhere to send the owner.
    assert owner_client.get("/api/sources/youtube/start")["Location"] == "/connections"
    for host, ok in (("localhost:8000", True), ("127.0.0.1", True), ("munim.lan", False)):
        assert owner_client.get("/api/sources/youtube", HTTP_HOST=host).json()["redirect_ok"] is ok


def test_the_client_id_and_secret_are_stored_sealed_and_never_sent_back(
    owner_client: Client,
) -> None:
    saved = set_up(owner_client)
    assert saved.json()["configured"] is True
    assert saved.json()["connected"] is False
    stored = Connection.objects.get(source="YT")
    for secret in (CLIENT_ID, CLIENT_SECRET):
        assert secret not in saved.content.decode()
        assert secret not in stored.sealed
    assert youtube.secrets_of(stored) == {"client_id": CLIENT_ID, "client_secret": CLIENT_SECRET}
    short = {"client_id": "x", "client_secret": "y"}
    refused = owner_client.put("/api/sources/youtube/credentials", short, "application/json")
    assert refused.status_code == 422


def test_signing_in_goes_to_google_and_comes_back_with_lasting_read_only_access(
    owner_client: Client, google: Google
) -> None:
    set_up(owner_client)
    start = owner_client.get("/api/sources/youtube/start")
    assert start.status_code == 302
    asked = urlsplit(start["Location"])
    assert f"{asked.scheme}://{asked.netloc}{asked.path}" == youtube.AUTH
    query = {k: v[0] for k, v in parse_qs(asked.query).items()}
    assert query == {
        "client_id": CLIENT_ID,
        "redirect_uri": CALLBACK,
        "response_type": "code",
        "scope": "https://www.googleapis.com/auth/youtube.readonly",
        "access_type": "offline",
        "prompt": "consent",
        "state": query["state"],
    }
    assert len(query["state"]) > 30

    back = owner_client.get(
        "/api/sources/youtube/callback", {"code": "the-code", "state": query["state"]}
    )
    assert back["Location"] == "/connections"
    assert google.forms == [
        {
            "code": "the-code",
            "client_id": CLIENT_ID,
            "client_secret": CLIENT_SECRET,
            "redirect_uri": CALLBACK,
            "grant_type": "authorization_code",
        }
    ]
    now = state(owner_client)
    assert (now["connected"], now["account"], now["problem"]) == (True, "Me", "")
    stored = Connection.objects.get(source="YT")
    assert stored.enabled
    assert REFRESH not in stored.sealed
    assert youtube.secrets_of(stored)["refresh_token"] == REFRESH
    # The state is used once: the same answer cannot be played back.
    again = owner_client.get(
        "/api/sources/youtube/callback", {"code": "another", "state": query["state"]}
    )
    assert again["Location"] == "/connections"
    assert (
        state(owner_client)["problem"] == "That sign-in did not start here. Connect YouTube again."
    )


@pytest.mark.parametrize(
    ("answer", "said"),
    [
        (
            {"code": "c", "state": "made-up"},
            "That sign-in did not start here. Connect YouTube again.",
        ),
        ({"error": "access_denied"}, "Google sign-in was cancelled."),
        ({}, "Google sign-in was cancelled."),
    ],
)
def test_a_sign_in_that_is_cancelled_or_did_not_start_here_changes_nothing(
    owner_client: Client, google: Google, answer: dict[str, str], said: str
) -> None:
    set_up(owner_client)
    start = owner_client.get("/api/sources/youtube/start")
    real = parse_qs(urlsplit(start["Location"]).query)["state"][0]
    back = owner_client.get("/api/sources/youtube/callback", {"state": real, **answer})
    assert back["Location"] == "/connections"
    now = state(owner_client)
    assert (now["connected"], now["problem"]) == (False, said)
    assert google.forms == []


def test_google_refusing_the_code_is_said_plainly(owner_client: Client, google: Google) -> None:
    set_up(owner_client)
    google.refusal = "invalid_client"
    sign_in(owner_client)
    now = state(owner_client)
    assert now["connected"] is False
    assert now["problem"] == "Google does not recognise the client ID and secret. Check them."


def test_new_videos_arrive_from_subscribed_channels(connected: Client, google: Google) -> None:
    poll_youtube(timestamp=0)
    assert google.bearers == {"Bearer access-1"}
    videos = {item["title"]: item for item in connected.get("/api/items?source=YT").json()}
    # A channel seen for the first time brings what it posted in the last week, not its past.
    assert sorted(videos) == ["Video 1", "Video 3"]
    first = videos["Video 1"]
    assert (first["origin"], first["sub"], first["media"]) == (
        "Bench Hours",
        "video 18:24",
        "Video",
    )
    assert videos["Video 3"]["sub"] == "video 1:02:03"

    opened = connected.get(f"/api/items/{first['id']}").json()
    assert opened["url"] == "https://www.youtube.com/watch?v=vid1"
    # Its picture is fetched through Munim, like any other; its description is its text.
    assert opened["blocks"][0] == {
        "type": "image",
        "src": f"/api/items/{first['id']}/images/0",
        "alt": "",
    }
    assert [block["type"] for block in opened["blocks"][1:]] == ["paragraph", "paragraph"]
    assert state(connected)["synced_at"] is not None
    assert {c.title: c.videos for c in Channel.objects.all()} == {
        "Bench Hours": 40,
        "Studio Kiln": 12,
    }


def test_a_channel_is_read_again_only_when_it_has_a_new_video(
    connected: Client, google: Google
) -> None:
    poll_youtube(timestamp=0)
    connected.patch(
        f"/api/items/{Item.objects.get(guid='vid1').pk}", {"read": True}, "application/json"
    )

    google.asked.clear()
    poll_youtube(timestamp=0)
    # Nothing changed: one call for the subscriptions, and no more.
    assert google.asked == ["subscriptions?mine"]

    google.subscriptions["UCkiln"] = ("Studio Kiln", 13)
    google.uploads["UUkiln"] = [("vid4", 0), ("vid3", 2)]
    google.videos["vid4"] = video(4, "Studio Kiln", days=0, length="PT45S")
    google.asked.clear()
    poll_youtube(timestamp=0)
    assert google.asked == ["subscriptions?mine", "playlistItems", "videos"]
    titles = sorted(item["title"] for item in connected.get("/api/items?source=YT").json())
    assert titles == ["Video 1", "Video 3", "Video 4"]
    assert Item.objects.get(guid="vid4").sub == "video 0:45"
    # What the owner had read stays read.
    assert Item.objects.get(guid="vid1").read_at is not None

    # A channel the owner unsubscribed from is forgotten; its videos stay.
    del google.subscriptions["UCbench"]
    poll_youtube(timestamp=0)
    assert [c.title for c in Channel.objects.all()] == ["Studio Kiln"]
    assert Item.objects.filter(guid="vid1").exists()


@pytest.mark.parametrize(
    ("break_it", "said"),
    [
        (
            lambda g: setattr(g, "refusal", "invalid_grant"),
            "Google no longer accepts Munim's sign-in. Connect YouTube again.",
        ),
        (
            lambda g: setattr(g, "api_error", (403, "quotaExceeded")),
            "Google's daily allowance for this project is used up. It starts again at midnight, "
            "Pacific time.",
        ),
        (
            lambda g: setattr(g, "api_error", (403, "accessNotConfigured")),
            "The YouTube Data API is not switched on in the Google Cloud project.",
        ),
        (
            lambda g: setattr(g, "api_error", (500, "backendError")),
            "YouTube answered 500 (backendError).",
        ),
        (lambda g: setattr(g, "down", True), "Google could not be reached."),
    ],
)
def test_when_youtube_cannot_be_read_it_says_why_and_keeps_what_it_has(
    connected: Client, google: Google, break_it: Any, said: str
) -> None:
    poll_youtube(timestamp=0)
    break_it(google)
    poll_youtube(timestamp=0)
    now = state(connected)
    assert now["problem"] == said
    assert now["connected"] is True
    assert Item.objects.filter(source="YT").count() == 2
    for secret in (CLIENT_SECRET, REFRESH, "access-1"):
        assert secret not in connected.get("/api/sources/youtube").content.decode()


def test_disconnecting_forgets_the_sign_in_here_and_at_google(
    connected: Client, google: Google
) -> None:
    poll_youtube(timestamp=0)
    google.forms.clear()
    now = connected.delete("/api/sources/youtube").json()
    assert (now["configured"], now["connected"], now["account"]) == (True, False, "")
    assert google.forms == [{"token": REFRESH}]
    assert "refresh_token" not in youtube.secrets_of(Connection.objects.get(source="YT"))
    assert Channel.objects.count() == 0
    assert Item.objects.filter(source="YT").count() == 2
    # Nothing is fetched while it is disconnected.
    google.asked.clear()
    poll_youtube(timestamp=0)
    assert google.asked == []
    # Google being out of reach does not stop it being forgotten here.
    sign_in(connected)
    google.down = True
    assert connected.delete("/api/sources/youtube").json()["connected"] is False


def test_new_credentials_forget_a_sign_in_made_with_the_old_ones(connected: Client) -> None:
    assert state(connected)["connected"] is True
    assert set_up(connected).json()["connected"] is False
    assert "refresh_token" not in youtube.secrets_of(Connection.objects.get(source="YT"))


@pytest.mark.parametrize(
    ("duration", "shown"),
    [
        ("PT18M24S", "18:24"),
        ("PT45S", "0:45"),
        ("PT1H2M3S", "1:02:03"),
        ("PT2H", "2:00:00"),
        ("P1DT1H", "25:00:00"),
        ("P0D", "0:00"),
        ("", ""),
        ("soon", ""),
    ],
)
def test_a_length_is_shown_as_minutes_and_seconds(duration: str, shown: str) -> None:
    assert youtube.length(duration) == shown


def test_youtube_needs_an_open_session(client: Client, db: None) -> None:
    assert client.get("/api/sources/youtube").status_code == 401
    assert set_up(client).status_code == 401
    assert client.get("/api/sources/youtube/start").status_code == 401
    assert client.get("/api/sources/youtube/callback?code=x&state=y").status_code == 401
    assert client.delete("/api/sources/youtube").status_code == 401
    assert Connection.objects.count() == 0
