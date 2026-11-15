"""The one place that talks to the AI providers, through their official SDKs."""

from itertools import islice

import anthropic
import httpx2
import openai

from ai.models import Provider

TIMEOUT_SECONDS = 10
# More than any provider lists; a bound on what one answer can make Munim store.
MOST_MODELS = 500
# Kinds of OpenAI model that make pictures, sound or numbers, named as OpenAI names them. These
# are kinds, not models: a new text model appears by itself, and a new kind missing from here
# is only one more line in the list the owner chooses from.
NOT_TEXT = (
    "image",
    "audio",
    "realtime",
    "live",
    "transcribe",
    "tts",
    "whisper",
    "embedding",
    "moderation",
)

# Replaced in tests, so that nothing there reaches a real provider.
TRANSPORT: httpx2.BaseTransport | None = None


class Unreachable(Exception):
    """The provider could not be asked, so nothing was learned. Its message is for the owner
    and never contains the key."""


def models_of(provider: Provider, key: str) -> list[str] | None:
    """The ids of the models the provider lists for this key, newest first, or None if it
    rejects the key. Listing models is the one call that needs a key and costs nothing."""
    name = provider.label
    try:
        if provider == Provider.OPENAI:
            with openai.OpenAI(
                api_key=key,
                timeout=TIMEOUT_SECONDS,
                max_retries=0,
                http_client=openai.DefaultHttpxClient(transport=TRANSPORT),
            ) as client:
                # OpenAI lists every kind of model and does not say which answer in text.
                listed = sorted(
                    islice(client.models.list(), MOST_MODELS),
                    key=lambda model: model.created,
                    reverse=True,
                )
                return [m.id for m in listed if not any(kind in m.id for kind in NOT_TEXT)]
        with anthropic.Anthropic(
            api_key=key,
            timeout=TIMEOUT_SECONDS,
            max_retries=0,
            http_client=anthropic.DefaultHttpxClient(transport=TRANSPORT),
        ) as client:
            # Anthropic lists the newest first, a page at a time; iterating asks for the rest.
            return [model.id for model in islice(client.models.list(limit=100), MOST_MODELS)]
    except (openai.AuthenticationError, anthropic.AuthenticationError):
        return None
    except (openai.APIStatusError, anthropic.APIStatusError) as problem:
        raise Unreachable(
            f"{name} answered {problem.status_code}, so the key was not checked."
        ) from None
    except (openai.APIConnectionError, anthropic.APIConnectionError):
        raise Unreachable(f"{name} could not be reached, so the key was not checked.") from None
