"""
Resolve LLM API keys from server defaults, encrypted DB storage, and client-provided keys.
"""

from __future__ import annotations

from backend.config import settings
from backend.db import repository as repo

PROVIDER_DISPLAY: dict[str, str] = {
    "groq": "Groq",
    "gemini": "Google Gemini",
    "claude": "Anthropic",
    "openai": "OpenAI",
}

MSG_NONE = "Add at least one API key in Settings to continue."
MSG_PROVIDER = "Add an API key for {name} in Settings to use this model."
MSG_WEB_SEARCH = (
    "Web search could not fetch results. Add TAVILY_API_KEY to the server .env "
    "and try again."
)
MSG_MODEL = (
    'The model "{model}" is not available for {provider}. '
    "Open Settings and set a valid model ID for this provider."
)
MSG_GENERIC = "Something went wrong while generating a response. Please try again."


def provider_display_name(provider: str) -> str:
    return PROVIDER_DISPLAY.get(provider, provider)


def resolve_provider_api_key(
    provider: str,
    *,
    user_id: str | None,
    client_api_key: str | None = None,
    groq_use_server_default: bool = True,
) -> str | None:
    """Pick the best available key: client override → DB (signed-in) → Groq server default."""
    client_key = (client_api_key or "").strip() or None

    if provider == "groq":
        if client_key:
            return client_key
        if user_id:
            db_key = repo.get_api_key(user_id, "groq")
            if db_key:
                return db_key
        if groq_use_server_default and settings.groq_api_key:
            return settings.groq_api_key
        return None

    if user_id:
        db_key = repo.get_api_key(user_id, provider)
        if db_key:
            return db_key
    if client_key:
        return client_key
    return None


def any_provider_available(
    user_id: str | None,
    *,
    client_keys: dict[str, str | None] | None = None,
    groq_use_server_default: bool = True,
) -> bool:
    client_keys = client_keys or {}
    for provider in PROVIDER_DISPLAY:
        if resolve_provider_api_key(
            provider,
            user_id=user_id,
            client_api_key=client_keys.get(provider),
            groq_use_server_default=groq_use_server_default,
        ):
            return True
    return False


def friendly_llm_error(
    exc: BaseException,
    provider: str,
    *,
    model_name: str | None = None,
    web_search_enabled: bool = False,
) -> str:
    """Map provider failures to clear user-facing messages (avoid blaming API keys incorrectly)."""
    msg = str(exc).lower()
    name = provider_display_name(provider)

    auth_markers = (
        "api key",
        "api_key",
        "invalid api key",
        "incorrect api key",
        "invalid_api_key",
        "authentication",
        "unauthorized",
        "invalid x-api-key",
    )
    if any(marker in msg for marker in auth_markers):
        return MSG_PROVIDER.format(name=name)

    model_markers = (
        "model_not_found",
        "model not found",
        "does not exist",
        "decommissioned",
        "deprecated",
        "invalid model",
        "unsupported model",
        "unknown model",
    )
    if any(marker in msg for marker in model_markers) or (
        "model" in msg and any(k in msg for k in ("not found", "decommissioned", "deprecated", "invalid"))
    ):
        model = (model_name or "unknown").strip() or "unknown"
        return MSG_MODEL.format(model=model, provider=name)

    if web_search_enabled and any(
        k in msg for k in ("tavily", "serper", "web search", "search")
    ):
        return MSG_WEB_SEARCH

    if "rate" in msg and "limit" in msg:
        return f"{name} rate limit reached. Wait a moment and try again."

    if "timeout" in msg or "timed out" in msg:
        return "The request timed out. Try again with a shorter question."

    if "context" in msg and ("length" in msg or "window" in msg or "token" in msg):
        return "The conversation or context is too long. Start a new chat or shorten your message."

    return MSG_GENERIC
