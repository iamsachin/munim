from django.db import models


class Feed(models.Model):
    """An RSS or Atom feed the owner follows."""

    url = models.URLField(max_length=1000, unique=True)
    title = models.CharField(max_length=300)
    site_url = models.URLField(max_length=1000, blank=True)
    added_at = models.DateTimeField(auto_now_add=True)
    fetched_at = models.DateTimeField(null=True, blank=True)
    # Why the last fetch failed, in words for the owner. Empty if it worked.
    problem = models.CharField(max_length=300, blank=True)
    # What the feed's server gave us last time, sent back so it can answer "nothing new".
    etag = models.CharField(max_length=300, blank=True)
    last_modified = models.CharField(max_length=100, blank=True)

    class Meta:
        ordering = ["title"]

    def __str__(self) -> str:
        return self.title


class Source(models.TextChoices):
    REDDIT = "RD", "Reddit"
    X = "X", "X"
    INSTAGRAM = "IG", "Instagram"
    HACKER_NEWS = "HN", "Hacker News"
    YOUTUBE = "YT", "YouTube"
    RSS = "RSS", "RSS"


class Item(models.Model):
    """One thing in the stream. So far only feed articles; other sources will add their own."""

    source = models.CharField(max_length=3, choices=Source.choices, default=Source.RSS)
    feed = models.ForeignKey(Feed, on_delete=models.CASCADE, related_name="items")
    # The entry's own identifier in the feed, so a re-fetch updates it and does not add it again.
    guid = models.CharField(max_length=1000)
    url = models.URLField(max_length=1000, blank=True)
    title = models.CharField(max_length=500)
    # The text as blocks (see reader/blocks.py), which is what is shown.
    blocks = models.JSONField(default=list, blank=True)
    # The same words as plain text, for search and reading time.
    body = models.TextField(blank=True)
    published_at = models.DateTimeField()
    # What the owner has done with it. Null means not read, not saved, not queued.
    read_at = models.DateTimeField(null=True, blank=True)
    saved_at = models.DateTimeField(null=True, blank=True)
    later_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-published_at", "-id"]
        constraints = [
            models.UniqueConstraint(fields=["feed", "guid"], name="one_article_per_feed_entry")
        ]

    def __str__(self) -> str:
        return self.title
