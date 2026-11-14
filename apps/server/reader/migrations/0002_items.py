# Written by hand. Django's generated version deleted the Article table and created an empty
# Item table, which would have destroyed every stored article. This renames it and keeps them.

import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("reader", "0001_initial"),
    ]

    operations = [
        migrations.RenameModel(old_name="Article", new_name="Item"),
        migrations.AlterField(
            model_name="item",
            name="feed",
            field=models.ForeignKey(
                on_delete=django.db.models.deletion.CASCADE,
                related_name="items",
                to="reader.feed",
            ),
        ),
        migrations.AddField(
            model_name="item",
            name="source",
            field=models.CharField(
                choices=[
                    ("RD", "Reddit"),
                    ("X", "X"),
                    ("IG", "Instagram"),
                    ("HN", "Hacker News"),
                    ("YT", "YouTube"),
                    ("RSS", "RSS"),
                ],
                default="RSS",
                max_length=3,
            ),
        ),
        migrations.AddField(
            model_name="item",
            name="read_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="item",
            name="saved_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="item",
            name="later_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
    ]
