"""The one place that talks to the AI providers, through their official SDKs."""

import anthropic
import httpx2
import openai

from ai.models import Provider

TIMEOUT_SECONDS = 10

# Replaced in tests, so that nothing there reaches a real provider.
TRANSPORT: httpx2.BaseTransport | None = None


class Unreachable(Exception):
    """The provider could not be asked, so nothing was learned. Its message is for the owner
    and never contains the key."""


def accepts(provider: Provider, key: str) -> bool:
    """Whether the provider accepts this key. It is asked for its list of models: the one call
    that needs a key and costs nothing."""
    name = provider.label
    try:
        if provider == Provider.OPENAI:
            with openai.OpenAI(
                api_key=key,
                timeout=TIMEOUT_SECONDS,
                max_retries=0,
                http_client=openai.DefaultHttpxClient(transport=TRANSPORT),
            ) as client:
                client.models.list()
        else:
            with anthropic.Anthropic(
                api_key=key,
                timeout=TIMEOUT_SECONDS,
                max_retries=0,
                http_client=anthropic.DefaultHttpxClient(transport=TRANSPORT),
            ) as client:
                client.models.list()
    except (openai.AuthenticationError, anthropic.AuthenticationError):
        return False
    except (openai.APIStatusError, anthropic.APIStatusError) as problem:
        raise Unreachable(
            f"{name} answered {problem.status_code}, so the key was not checked."
        ) from None
    except (openai.APIConnectionError, anthropic.APIConnectionError):
        raise Unreachable(f"{name} could not be reached, so the key was not checked.") from None
    return True
