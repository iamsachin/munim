from django.contrib import admin

from reader.models import Connection, Feed, Highlight, Item


@admin.register(Feed)
class FeedAdmin(admin.ModelAdmin):  # type: ignore[type-arg]
    list_display = ["title", "url", "fetched_at", "problem"]


@admin.register(Item)
class ItemAdmin(admin.ModelAdmin):  # type: ignore[type-arg]
    list_display = ["title", "source", "feed", "published_at", "read_at", "saved_at"]
    list_filter = ["source", "feed"]


@admin.register(Connection)
class ConnectionAdmin(admin.ModelAdmin):  # type: ignore[type-arg]
    list_display = ["source", "enabled", "synced_at", "problem"]


@admin.register(Highlight)
class HighlightAdmin(admin.ModelAdmin):  # type: ignore[type-arg]
    list_display = ["quote", "item", "note", "created_at"]
