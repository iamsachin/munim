"""Background jobs for AI settings. Run by the worker: `manage.py procrastinate worker`."""

from procrastinate.contrib.django import app

from ai import providers
from ai.api import asked
from ai.models import Provider, ProviderKey
from munim import vault


@app.periodic(cron="23 4 * * *")
@app.task(queueing_lock="refresh_models", lock="refresh_models")
def refresh_models(timestamp: int) -> None:
    """Daily: ask each provider again which models it lists, so that new ones can be chosen and
    a key withdrawn since is shown as rejected."""
    for key in ProviderKey.objects.all():
        try:
            listed = providers.models_of(Provider(key.provider), vault.unseal(key.sealed))
        except providers.Unreachable:
            continue  # Nothing was learned, so what is stored stands until tomorrow.
        ProviderKey.objects.filter(pk=key.pk).update(**asked(listed))
