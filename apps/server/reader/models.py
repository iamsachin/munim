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


class Article(models.Model):
    """One entry of a feed, stored as plain text."""

    feed = models.ForeignKey(Feed, on_delete=models.CASCADE, related_name="articles")
    # The entry's own identifier in the feed, so a re-fetch updates it and does not add it again.
    guid = models.CharField(max_length=1000)
    url = models.URLField(max_length=1000, blank=True)
    title = models.CharField(max_length=500)
    # Plain text; paragraphs are separated by a blank line.
    body = models.TextField(blank=True)
    published_at = models.DateTimeField()

    class Meta:
        ordering = ["-published_at", "-id"]
        constraints = [
            models.UniqueConstraint(fields=["feed", "guid"], name="one_article_per_feed_entry")
        ]

    def __str__(self) -> str:
        return self.title
