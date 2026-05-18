"""
Multi-provider LLM factory.

Maps ``ProviderId`` → LangChain chat model.
"""

from __future__ import annotations

import logging
from typing import Any

from langchain_core.language_models.chat_models import BaseChatModel

from backend.config import settings

logger = logging.getLogger("exics.llm")

# Provider → (LangChain class import path, default model name)
_PROVIDER_MAP: dict[str, dict[str, str]] = {
    "groq": {
        "cls": "langchain_groq.ChatGroq",
        "model": "llama-3.3-70b-versatile",
    },
    "gemini": {
        "cls": "langchain_google_genai.ChatGoogleGenerativeAI",
        "model": "gemini-2.0-flash",
    },
    "claude": {
        "cls": "langchain_anthropic.ChatAnthropic",
        "model": "claude-sonnet-4-20250514",
    },
    "openai": {
        "cls": "langchain_openai.ChatOpenAI",
        "model": "gpt-4o-mini",
    },
}


def _import_class(dotted_path: str) -> type:
    """Dynamically import a class from a dotted module path."""
    module_path, class_name = dotted_path.rsplit(".", 1)
    import importlib

    mod = importlib.import_module(module_path)
    return getattr(mod, class_name)


def get_llm(
    provider: str,
    api_key: str | None = None,
    *,
    model_name: str | None = None,
    streaming: bool = False,
    temperature: float = 0.1,
    **kwargs: Any,
) -> BaseChatModel:
    """
    Instantiate a LangChain chat model for the given provider.

    *api_key* is required for all providers except ``groq`` (which
    falls back to the server-side ``GROQ_API_KEY``).
    """
    info = _PROVIDER_MAP.get(provider)
    if info is None:
        raise ValueError(f"Unknown provider: {provider}")

    key = api_key
    if not key and provider == "groq":
        key = settings.groq_api_key

    if not key:
        raise ValueError(f"No API key available for provider '{provider}'")

    cls = _import_class(info["cls"])
    resolved_model = (model_name or "").strip() or info["model"]

    # Each provider uses slightly different kwarg names
    init_kwargs: dict[str, Any] = {
        "temperature": temperature,
        "streaming": streaming,
        **kwargs,
    }

    if provider == "groq":
        init_kwargs["groq_api_key"] = key
        init_kwargs["model_name"] = resolved_model
    elif provider == "gemini":
        init_kwargs["google_api_key"] = key
        init_kwargs["model"] = resolved_model
    elif provider == "claude":
        init_kwargs["anthropic_api_key"] = key
        init_kwargs["model_name"] = resolved_model
    elif provider == "openai":
        init_kwargs["openai_api_key"] = key
        init_kwargs["model_name"] = resolved_model

    logger.info(
        "Creating LLM: provider=%s model=%s streaming=%s",
        provider,
        resolved_model,
        streaming,
    )
    return cls(**init_kwargs)


def get_fast_llm(*, streaming: bool = False) -> BaseChatModel:
    """
    Return a fast, cheap LLM for internal tasks (grading, hallucination
    checks, query rewriting).  Always uses the server-side Groq key.
    """
    return get_llm(
        "groq",
        api_key=settings.groq_api_key,
        model_name=_PROVIDER_MAP["groq"]["model"],
        streaming=streaming,
        temperature=0.0,
    )
