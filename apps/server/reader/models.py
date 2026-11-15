from django.contrib.postgres.indexes import GinIndex
from django.contrib.postgres.search import SearchVector, SearchVectorField
from django.db import models
from django.db.models.functions import Left

# The dictionary search words are reduced with: "protocols" also finds "protocol".
# shortcut: English only, choose per feed if feeds in other languages need their own stemming.
SEARCH_LANGUAGE = "english"
# Postgres refuses to index more than a megabyte of words, which would stop an enormous article
# from being stored at all. shortcut: text past this point is kept and shown but not searched.
SEARCHED_CHARACTERS = 250_000


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
    # For a source the owner signs in to: whose account it is, to show; and what Munim needs to
    # act for them, sealed (see munim/vault.py) and never sent to the browser.
    account = models.CharField(max_length=300, blank=True)
    sealed = models.TextField(blank=True)

    def __str__(self) -> str:
        return self.get_source_display()


class Channel(models.Model):
    """A YouTube channel the owner subscribes to, and how much of it has been seen."""

    channel_id = models.CharField(max_length=64, primary_key=True)
    title = models.CharField(max_length=300)
    # The playlist that holds its uploads, which is where new videos are read from.
    uploads = models.CharField(max_length=64)
    # How many videos YouTube said it had when it was last read. It is read again only when
    # this changes, which is what keeps Munim inside Google's daily allowance.
    videos = models.PositiveIntegerField(null=True, blank=True)

    def __str__(self) -> str:
        return self.title


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
    # A second line beside that, such as "video 18:24". Often empty.
    sub = models.CharField(max_length=100, blank=True)
    # What it mainly is, if not text: "Video" or "Image".
    media = models.CharField(max_length=5, blank=True)
    # How many replies the source says it has, which can be more than are kept below.
    replies = models.PositiveIntegerField(default=0)
    # The discussion, flattened in reading order: who, at, depth, blocks.
    comments = models.JSONField(default=list, blank=True)
    # What the owner has done with it. Null means not read, not saved, not queued.
    read_at = models.DateTimeField(null=True, blank=True)
    saved_at = models.DateTimeField(null=True, blank=True)
    later_at = models.DateTimeField(null=True, blank=True)
    # The words of the title and the text, kept by Postgres itself whenever either changes. A
    # word in the title counts for more than one in the text.
    search = models.GeneratedField(
        expression=SearchVector("title", weight="A", config=SEARCH_LANGUAGE)
        + SearchVector(Left("body", SEARCHED_CHARACTERS), weight="B", config=SEARCH_LANGUAGE),
        output_field=SearchVectorField(),
        db_persist=True,
    )

    class Meta:
        ordering = ["-published_at", "-id"]
        indexes = [GinIndex(fields=["search"], name="item_search")]
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


class Highlight(models.Model):
    """A passage the owner marked, with an optional note: in an item, or in the answer to a
    question (`ask`). It is always in exactly one of the two."""

    item = models.ForeignKey(
        Item, null=True, blank=True, on_delete=models.CASCADE, related_name="highlights"
    )
    ask = models.ForeignKey(
        "Ask", null=True, blank=True, on_delete=models.CASCADE, related_name="highlights"
    )
    # Where the passage is. `reply` is null for the item's own text, or the number of the reply
    # it is in. `unit` counts the runs of text there: each paragraph, heading, paragraph of a
    # quotation and list item is one; in an answer, each of its lines that has words. `start`
    # and `end` are characters within that run.
    reply = models.PositiveIntegerField(null=True, blank=True)
    unit = models.PositiveIntegerField()
    start = models.PositiveIntegerField()
    end = models.PositiveIntegerField()
    # The words themselves. If the text has changed since (a feed corrected an article, a
    # discussion grew), the passage is found again by these.
    quote = models.TextField()
    note = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at", "-id"]
        constraints = [
            models.CheckConstraint(
                condition=models.Q(item__isnull=False, ask__isnull=True)
                | models.Q(item__isnull=True, ask__isnull=False),
                name="highlight_in_an_item_or_an_answer",
            )
        ]

    def __str__(self) -> str:
        return self.quote[:60]


class Ask(models.Model):
    """A question the owner asked, and what the model answered from the items in its scope.
    Answered by the worker: until then `answered_at` is empty."""

    class Scope(models.TextChoices):
        EVERYTHING = "everything", "Everything"
        SAVED = "saved", "Saved"
        WEEK = "week", "This week"
        ITEM = "item", "Open item"

    question = models.TextField()
    scope = models.CharField(max_length=10, choices=Scope.choices)
    # The item asked about, when the scope is one item. The exchange outlives the item.
    item = models.ForeignKey(
        Item, null=True, blank=True, on_delete=models.SET_NULL, related_name="asks"
    )
    # The question this one follows up, if it is a follow-up: it is answered from the same
    # items, with what was said before.
    follows = models.ForeignKey(
        "self", null=True, blank=True, on_delete=models.SET_NULL, related_name="followups"
    )
    # The items the model was given, in the order of their numbers in the prompt.
    given = models.JSONField(default=list, blank=True)
    answer = models.TextField(blank=True)
    # The items the answer cites, in the order of their numbers in it: each as it was then
    # (item, source, title, origin, icon), so a citation survives its item.
    cites = models.JSONField(default=list, blank=True)
    # Why there is no answer, in words for the owner. Empty if there is one.
    problem = models.CharField(max_length=300, blank=True)
    asked_at = models.DateTimeField(auto_now_add=True)
    answered_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["asked_at", "id"]

    def __str__(self) -> str:
        return self.question[:60]


class Digest(models.Model):
    """What came in, written up by a model for the owner: one a day, and one a week."""

    class Kind(models.TextChoices):
        DAILY = "daily", "Daily"
        WEEKLY = "weekly", "Weekly"

    kind = models.CharField(max_length=6, choices=Kind.choices)
    # The date it is for, on the owner's own clock: there is one of each kind for a day.
    day = models.DateField()
    lead = models.TextField(blank=True)
    # Each section as {head, text, cites}; a cite is an item as it was then (see Ask.cites).
    sections = models.JSONField(default=list, blank=True)
    # Why nothing was written, in words for the owner. Empty if something was.
    problem = models.CharField(max_length=300, blank=True)
    written_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-day", "-id"]
        constraints = [
            models.UniqueConstraint(fields=["kind", "day"], name="one_digest_of_a_kind_a_day")
        ]

    def __str__(self) -> str:
        return f"{self.kind} {self.day}"
