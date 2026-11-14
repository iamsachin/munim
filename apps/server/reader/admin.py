from django.contrib import admin

from reader.models import Article, Feed


@admin.register(Feed)
class FeedAdmin(admin.ModelAdmin):  # type: ignore[type-arg]
    list_display = ["title", "url", "fetched_at", "problem"]


@admin.register(Article)
class ArticleAdmin(admin.ModelAdmin):  # type: ignore[type-arg]
    list_display = ["title", "feed", "published_at"]
    list_filter = ["feed"]
