# Adds the text as blocks. Items already stored have only plain text, so each of their
# paragraphs becomes a paragraph block; the next fetch of their feed fills in the rest.

from django.db import migrations, models


def paragraphs_to_blocks(apps, schema_editor):  # type: ignore[no-untyped-def]
    Item = apps.get_model("reader", "Item")
    for item in Item.objects.exclude(body="").iterator():
        # Spelt out here, not imported: a migration must keep working as the app's code changes.
        item.blocks = [
            {"type": "paragraph", "spans": [{"text": text}]}
            for text in item.body.split("\n\n")
            if text
        ]
        item.save(update_fields=["blocks"])


class Migration(migrations.Migration):
    dependencies = [
        ("reader", "0002_items"),
    ]

    operations = [
        migrations.AddField(
            model_name="item",
            name="blocks",
            field=models.JSONField(blank=True, default=list),
        ),
        migrations.RunPython(paragraphs_to_blocks, migrations.RunPython.noop),
    ]
