"""
Generate concise chat titles from the first user question and assistant reply.
"""

from __future__ import annotations

import logging
import re

from langchain_core.messages import HumanMessage, SystemMessage

from backend.services.llm_provider import get_fast_llm

logger = logging.getLogger("exics.title")

_SYSTEM = """You write short chat titles for a sidebar (like ChatGPT).
Given the user's question and the assistant's reply, produce a clear title of 3–7 words.
Capture the topic, not the full question. No quotes, no punctuation at the end, no colons.
Examples: "LangGraph RAG Pipeline", "Python List Comprehensions", "PDF Summary Request"
Respond with ONLY the title text."""


def generate_chat_title(user_message: str, assistant_message: str) -> str:
    """Return a short AI-generated title, or a safe fallback."""
    user_message = (user_message or "").strip()
    assistant_message = (assistant_message or "").strip()

    if not user_message and not assistant_message:
        return "New chat"

    fallback = _fallback_title(user_message, assistant_message)

    try:
        llm = get_fast_llm()
        result = llm.invoke([
            SystemMessage(content=_SYSTEM),
            HumanMessage(
                content=(
                    f"User question:\n{user_message[:800]}\n\n"
                    f"Assistant reply:\n{assistant_message[:800]}"
                )
            ),
        ])
        raw = result.content.strip() if isinstance(result.content, str) else ""
        title = _clean_title(raw)
        if title and len(title) >= 3:
            return title[:80]
    except Exception as exc:
        logger.warning("Title generation failed: %s", exc)

    return fallback


def _clean_title(raw: str) -> str:
    t = raw.strip().strip('"\'').split("\n")[0].strip()
    t = re.sub(r"^(title:\s*)", "", t, flags=re.IGNORECASE)
    return t[:80]


def _fallback_title(user_message: str, assistant_message: str) -> str:
    base = user_message or assistant_message
    words = base.split()[:6]
    return " ".join(words)[:48].strip() or "New chat"
