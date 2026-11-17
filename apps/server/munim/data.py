"""Everything the owner has put into Munim: handing it over as an archive, and removing it."""

import json
import shutil
import tempfile
import zipfile
from collections.abc import Iterable
from pathlib import Path
from typing import IO, Any

from django.conf import settings
from django.db import transaction
from django.utils.text import slugify

from account.models import Preferences
from ai.models import FeatureModel, ModelPrice, ProviderKey, Usage
from reader.models import Ask, Channel, Connection, Digest, Feed, Highlight, Item, Watch

ABOUT = """\
Everything Munim held when this archive was made.

feeds.json        the feeds you follow
items.json        every item: where it came from, what you did with it, its text and replies
highlights.json   your highlights and notes, each with the id of its item, or the question
                  whose answer it is from
asks.json         what you asked, what was answered, and the items each answer cited
digests.json      the digests written for you, and the items each names
watches.json      your watches, and the items that matched each
settings.json     the settings kept on the server
ai-usage.json     each call made to an AI model: when, by which feature, its tokens and cost
saved/            the text of each item you saved, as a plain file

Not here: the API keys and source sign-ins you gave Munim, your passphrase, and the pictures in
articles (those are fetched again from where they were published).
"""


def _rows(archive: zipfile.ZipFile, name: str, rows: Iterable[dict[str, Any]]) -> None:
    """Writes rows as one JSON list, a row at a time, so a large table is never all in memory."""
    with archive.open(name, "w") as out:
        out.write(b"[")
        for n, row in enumerate(rows):
            line = json.dumps(row, ensure_ascii=False, default=str)
            out.write((",\n" if n else "\n").encode() + line.encode())
        out.write(b"\n]\n")


def _item(item: Item) -> dict[str, Any]:
    return {
        "id": item.pk,
        "source": item.get_source_display(),
        "from": item.feed.title if item.feed else item.origin,
        "feed": item.feed.url if item.feed else None,
        "url": item.url,
        "title": item.title,
        "published_at": item.published_at,
        "read_at": item.read_at,
        "saved_at": item.saved_at,
        "later_at": item.later_at,
        "replies": item.replies,
        "text": item.body,
        "blocks": item.blocks,
        "comments": item.comments,
    }


def export() -> IO[bytes]:
    """A zip of everything, in a temporary file that is removed when it is closed."""
    out = tempfile.TemporaryFile()  # noqa: SIM115  handed to the response, which closes it
    with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as archive:
        archive.writestr("README.txt", ABOUT)
        _rows(
            archive,
            "feeds.json",
            ({"title": f.title, "url": f.url, "added_at": f.added_at} for f in Feed.objects.all()),
        )
        items = Item.objects.select_related("feed")
        _rows(archive, "items.json", (_item(item) for item in items.iterator()))
        _rows(
            archive,
            "highlights.json",
            (
                {
                    "item": h.item_id,
                    "asked": h.ask.question if h.ask else None,
                    "quote": h.quote,
                    "note": h.note,
                    "created_at": h.created_at,
                }
                for h in Highlight.objects.select_related("ask").iterator()
            ),
        )
        on = set(Connection.objects.filter(enabled=True).values_list("source", flat=True))
        prefs = Preferences.load()
        chosen = FeatureModel.objects.all()
        _rows(
            archive,
            "settings.json",
            [
                {
                    "lock_after_minutes": prefs.lock_after_minutes,
                    "sources_on": sorted(on),
                    "ai_models": {c.feature: f"{c.provider}/{c.model}" for c in chosen},
                    "ai_limit": prefs.ai_limit,
                    "digest_on": prefs.digest_on,
                    "time_zone": prefs.time_zone,
                    "ai_prices": {
                        f"{p.provider}/{p.model}": {"input": p.input, "output": p.output}
                        for p in ModelPrice.objects.all()
                    },
                }
            ],
        )
        _rows(
            archive,
            "ai-usage.json",
            (dict(call) for call in Usage.objects.order_by("at").values().iterator()),
        )
        _rows(
            archive,
            "asks.json",
            (
                {
                    "question": a.question,
                    "scope": a.get_scope_display(),
                    "answer": a.answer or a.problem,
                    "cites": [cite["title"] for cite in a.cites],
                    "asked_at": a.asked_at,
                }
                for a in Ask.objects.iterator()
            ),
        )
        _rows(
            archive,
            "digests.json",
            (
                {
                    "kind": d.kind,
                    "day": d.day,
                    "lead": d.lead or d.problem,
                    "sections": [
                        {
                            "head": section["head"],
                            "text": section["text"],
                            "items": [cite["title"] for cite in section["cites"]],
                        }
                        for section in d.sections
                    ],
                }
                for d in Digest.objects.iterator()
            ),
        )
        _rows(
            archive,
            "watches.json",
            (
                {
                    "name": w.name,
                    "kind": w.get_kind_display(),
                    "on": w.on,
                    "on_x": w.on_x,
                    "matches": [match.item.title for match in w.matches.select_related("item")],
                }
                for w in Watch.objects.iterator()
            ),
        )
        for item in items.filter(saved_at__isnull=False).iterator():
            name = f"saved/{item.pk}-{slugify(item.title)[:60] or 'untitled'}.txt"
            archive.writestr(name, f"{item.title}\n{item.url}\n\n{item.body}\n")
    out.seek(0)
    return out


def delete_all() -> None:
    """Removes what the owner put in: feeds, items with their highlights, what was asked and
    answered, the digests, the watches, which sources are on,
    the API keys, the model chosen for each AI feature, the prices and the record of AI use. The
    account itself (passphrase, devices, lock setting, AI limit) stays."""
    with transaction.atomic():
        Ask.objects.all().delete()
        Digest.objects.all().delete()
        Watch.objects.all().delete()
        Item.objects.all().delete()
        Feed.objects.all().delete()
        Connection.objects.all().delete()
        Channel.objects.all().delete()
        ProviderKey.objects.all().delete()
        FeatureModel.objects.all().delete()
        ModelPrice.objects.all().delete()
        Usage.objects.all().delete()
    shutil.rmtree(Path(settings.DATA_DIR) / "images", ignore_errors=True)
