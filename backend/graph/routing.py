"""
Conditional edge functions for the LangGraph RAG pipeline.
"""

from __future__ import annotations

from backend.models.state import GraphState


def _web_enabled(state: GraphState) -> bool:
    """True when the user turned on the Web button (chat or settings)."""
    return bool(state.get("web_search_enabled") or state.get("web_search_needed"))


def after_retrieval(state: GraphState) -> str:
    """
    After retrieval:
      - Web ON + no uploaded docs → skip grading, go straight to web search
      - Web ON + retrieval failed → web search
      - Otherwise → grade retrieved chunks
    """
    if _web_enabled(state) and not state.get("has_uploaded_docs"):
        return "web_search"
    if state.get("retrieval_failed") and _web_enabled(state):
        return "web_search"
    return "grading"


def route_after_grading(state: GraphState) -> str:
    """
    After grading:
      - Web ON → always run Tavily/Serper (combine with any PDF chunks already graded)
      - Web OFF + relevant PDF chunks → generate
      - Web OFF + no relevant + docs + retries left → rewrite and re-retrieve
      - Otherwise → generate
    """
    if _web_enabled(state):
        return "web_search"

    relevant = state.get("relevant_chunks", [])
    if relevant:
        return "generate"

    retry_count = state.get("retry_count", 0)
    max_retries = state.get("max_retries", 2)
    has_docs = state.get("has_uploaded_docs") or bool(state.get("doc_ids"))

    if has_docs and retry_count < max_retries:
        return "rewrite_retry"

    return "generate"


def should_regenerate(state: GraphState) -> str:
    """After hallucination check — regenerate if ungrounded."""
    generation = state.get("generation", "")
    retry_count = state.get("retry_count", 0)
    max_retries = state.get("max_retries", 2)
    if not generation and retry_count < max_retries:
        return "regenerate"
    return "done"
