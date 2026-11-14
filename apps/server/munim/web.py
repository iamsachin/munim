"""Serves the built web app's page. Its files (/assets) are served by WhiteNoise; every other
address, the front page included, gets the page from here, so a link to /stream or /rss works
when it is opened directly."""

from django.conf import settings
from django.http import HttpRequest, HttpResponse


def web_app(request: HttpRequest, path: str = "") -> HttpResponse:
    index = settings.WEB_DIR / "index.html"
    if not index.is_file():
        # Development: the web app is served by Vite, not from here.
        return HttpResponse("The web app is not built here.", status=404, content_type="text/plain")
    response = HttpResponse(index.read_bytes(), content_type="text/html; charset=utf-8")
    # The page names its scripts by their contents, so it must be asked for afresh each time.
    response["Cache-Control"] = "no-cache"
    return response
