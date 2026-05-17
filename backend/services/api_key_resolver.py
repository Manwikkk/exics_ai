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


def friendly_llm_error(exc: BaseException, provider: str) -> str:
    """Map provider HTTP/auth failures to a user-facing message (no raw API bodies)."""
    msg = str(exc).lower()
    auth_markers = (
        "api key",
        "api_key",
        "authentication",
        "unauthorized",
        "invalid x-api-key",
        "incorrect api key",
        "invalid_api_key",
        "permission",
        "401",
        "403",
    )
    if any(marker in msg for marker in auth_markers):
        name = provider_display_name(provider)
        return MSG_PROVIDER.format(name=name)
    return (
        "Something went wrong while generating a response. "
        "Check your API key in Settings and try again."
    )
