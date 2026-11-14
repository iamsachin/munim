"""Images in articles, fetched by the server and kept on disk.

The browser never asks the publisher for an image: it asks Munim, and Munim asks the publisher.
So the publisher sees the server, not the owner's address or browser. An image is fetched the
first time it is wanted and then served from disk.
"""

import hashlib
import os
import uuid
from pathlib import Path

from django.conf import settings

from reader import feeds
from reader.models import Item

MAX_IMAGE_BYTES = 10_000_000

# Pictures only. SVG is left out on purpose: it can carry script, which would run on Munim's
# own address if the image were ever opened by itself.
ALLOWED_TYPES = frozenset(["image/jpeg", "image/png", "image/gif", "image/webp", "image/avif"])


class ImageProblem(Exception):
    """Why an image could not be shown."""


def source_of(item: Item, index: int) -> str:
    """The address of the item's nth image. Only images an item really has can be asked for."""
    sources = [block["src"] for block in item.blocks if block["type"] == "image"]
    if not 0 <= index < len(sources):
        raise ImageProblem("There is no such image.")
    return str(sources[index])


def _place(url: str) -> Path:
    name = hashlib.sha256(url.encode()).hexdigest()
    return Path(settings.DATA_DIR) / "images" / name[:2] / name


def fetch(url: str) -> tuple[bytes, str]:
    """The image's bytes and type, from disk if it was fetched before."""
    place = _place(url)
    kind_file = place.with_suffix(".type")
    if place.exists() and kind_file.exists():
        return place.read_bytes(), kind_file.read_text()

    try:
        got = feeds.download(url, limit=MAX_IMAGE_BYTES, what="image")
    except feeds.FeedProblem as problem:
        raise ImageProblem(str(problem)) from None
    if got is None or got.content_type not in ALLOWED_TYPES:
        raise ImageProblem("That is not a picture Munim can show.")

    place.parent.mkdir(parents=True, exist_ok=True)
    # Written under another name and moved into place, so a half-written file is never served.
    for path, data in ((place, got.content), (kind_file, got.content_type.encode())):
        # Its own name, so two requests for one image cannot move each other's file.
        part = path.with_name(f"{path.name}.{uuid.uuid4().hex}.part")
        part.write_bytes(data)
        os.replace(part, path)
    return got.content, got.content_type
