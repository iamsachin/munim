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

    def __str__(self) -> str:
        return self.get_provider_display()
