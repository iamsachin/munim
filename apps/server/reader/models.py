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


class Connection(models.Model):
    """A source that is followed as a whole, not feed by feed: whether the owner has it on, and
    how its last fetch went. A source with no row is off."""

    source = models.CharField(max_length=3, choices=Source.choices, primary_key=True)
    enabled = models.BooleanField(default=False)
    synced_at = models.DateTimeField(null=True, blank=True)
    # Why the last fetch failed, in words for the owner. Empty if it worked.
    problem = models.CharField(max_length=300, blank=True)

    def __str__(self) -> str:
        return self.get_source_display()


class Item(models.Model):
    """One thing in the stream: a feed article, or a story from another source."""

    source = models.CharField(max_length=3, choices=Source.choices, default=Source.RSS)
    # The feed it came from. Null for sources that are not feeds.
    feed = models.ForeignKey(
        Feed, on_delete=models.CASCADE, related_name="items", null=True, blank=True
    )
    # Its own identifier at the source, so a re-fetch updates it and does not add it again.
    guid = models.CharField(max_length=1000)
    url = models.URLField(max_length=1000, blank=True)
    title = models.CharField(max_length=500)
    # The text as blocks (see reader/blocks.py), which is what is shown.
    blocks = models.JSONField(default=list, blank=True)
    # The same words as plain text, for search and reading time.
    body = models.TextField(blank=True)
    published_at = models.DateTimeField()
    # Where it came from, for sources that are not feeds: "612 points", a subreddit, a channel.
    origin = models.CharField(max_length=300, blank=True)
    # How many replies the source says it has, which can be more than are kept below.
    replies = models.PositiveIntegerField(default=0)
    # The discussion, flattened in reading order: who, at, depth, blocks.
    comments = models.JSONField(default=list, blank=True)
    # What the owner has done with it. Null means not read, not saved, not queued.
    read_at = models.DateTimeField(null=True, blank=True)
    saved_at = models.DateTimeField(null=True, blank=True)
    later_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-published_at", "-id"]
        constraints = [
            models.UniqueConstraint(fields=["feed", "guid"], name="one_article_per_feed_entry"),
            models.UniqueConstraint(
                fields=["source", "guid"],
                condition=models.Q(feed__isnull=True),
                name="one_item_per_source_entry",
            ),
        ]

    def __str__(self) -> str:
        return self.title
