from django.db import models


class Provider(models.TextChoices):
    OPENAI = "openai", "OpenAI"
    ANTHROPIC = "anthropic", "Anthropic"


class ProviderKey(models.Model):
    """The owner's API key for one provider. The key itself is sealed (see munim/vault.py)."""

    provider = models.CharField(max_length=20, choices=Provider.choices, primary_key=True)
    sealed = models.TextField()
    # The key's last four characters, so the owner can tell which key this is.
    tail = models.CharField(max_length=4)
    # Whether the provider accepted the key when it was last asked.
    ok = models.BooleanField()
    checked_at = models.DateTimeField()
    # The ids of the models the provider listed when it was last asked, newest first. Empty if
    # it rejected the key.
    models = models.JSONField(default=list)

    def __str__(self) -> str:
        return self.get_provider_display()


class Feature(models.TextChoices):
    """The features that call a model. A summary is not one: it is an Ask."""

    DIGEST = "digest", "Digest"
    ASK = "ask", "Ask"
    WATCH = "watch", "Watch matching"


class FeatureModel(models.Model):
    """The model one feature runs on. A feature with no row has none chosen, so it is off."""

    feature = models.CharField(max_length=20, choices=Feature.choices, primary_key=True)
    provider = models.CharField(max_length=20, choices=Provider.choices)
    model = models.CharField(max_length=200)

    def __str__(self) -> str:
        return f"{self.get_feature_display()}: {self.model}"
