import django.contrib.postgres.indexes
import django.contrib.postgres.search
import django.db.models.functions.text
from django.db import migrations, models

SEARCH = django.contrib.postgres.search.SearchVector


def _text(block):  # type: ignore[no-untyped-def]
    """The words of one block of a reply, as `reader.blocks.text_of` reads them today."""
    if block["type"] == "list":
        return "\n".join("".join(span["text"] for span in item) for item in block["items"])
    if block["type"] == "code":
        return block["text"]
    if block["type"] in ("image", "video"):
        return block["alt"]
    return "".join(span["text"] for span in block["spans"])


def say(apps, schema_editor):  # type: ignore[no-untyped-def]
    """The replies an install already holds become searchable: their words are written out."""
    Item = apps.get_model("reader", "Item")
    for item in Item.objects.exclude(comments=[]).only("comments").iterator():
        said = "\n".join(
            "\n\n".join(_text(block) for block in reply["blocks"])  # type: ignore[no-untyped-call]
            for reply in item.comments
        )
        Item.objects.filter(pk=item.pk).update(said=said)


class Migration(migrations.Migration):
    dependencies = [
        ("reader", "0013_match_judged"),
    ]

    operations = [
        migrations.AddField(
            model_name="item",
            name="said",
            field=models.TextField(blank=True),
        ),
        migrations.RunPython(say, migrations.RunPython.noop),
        # Postgres cannot change what a generated column is made from, so the search column is
        # dropped and made again, with its index. Nothing is lost: it holds only what Postgres
        # works out from the title, the text and now the replies.
        migrations.RemoveIndex(model_name="item", name="item_search"),
        migrations.RemoveField(model_name="item", name="search"),
        migrations.AddField(
            model_name="item",
            name="search",
            field=models.GeneratedField(
                db_persist=True,
                expression=SEARCH("title", config="english", weight="A")
                + SEARCH(
                    django.db.models.functions.text.Left("body", 250000),
                    config="english",
                    weight="B",
                )
                + SEARCH(
                    django.db.models.functions.text.Left("said", 250000),
                    config="english",
                    weight="C",
                ),
                output_field=django.contrib.postgres.search.SearchVectorField(),
            ),
        ),
        migrations.AddIndex(
            model_name="item",
            index=django.contrib.postgres.indexes.GinIndex(fields=["search"], name="item_search"),
        ),
    ]
