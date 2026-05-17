"""
LangGraph state definition for the RAG pipeline.
"""

from __future__ import annotations

from typing import TypedDict, Any


class GraphState(TypedDict, total=False):
    """Shared mutable state flowing through every LangGraph node."""

    # ── Query ────────────────────────────────────────────────
    original_query: str
    rewritten_query: str
    query_type: str  # conceptual | how-to | troubleshooting | api-reference | mixed

    # ── Retrieval ────────────────────────────────────────────
    retrieved_chunks: list[dict[str, Any]]
    relevant_chunks: list[dict[str, Any]]

    # ── Generation ───────────────────────────────────────────
    generation: str
    citations: list[dict[str, Any]]

    # ── Control flow ─────────────────────────────────────────
    retry_count: int
    max_retries: int
    web_search_needed: bool         # Legacy routing flag (may be cleared by nodes)
    web_search_enabled: bool        # User toggled Web — preserved for entire run
    web_search_results: list[dict[str, Any]]
    used_web_search: bool           # True when answer used live web results
    retrieval_failed: bool          # True when Qdrant errors → auto web-search
    hallucination_score: str        # grounded | partial | ungrounded

    # ── Provider ─────────────────────────────────────────────
    selected_provider: str
    selected_model: str
    user_api_key: str | None

    # ── Context ──────────────────────────────────────────────────
    chat_history: list[dict[str, Any]]
    chat_id: str | None
    incognito: bool

    # ── Document scoping ─────────────────────────────────────────
    doc_ids: list[str]                  # Active document IDs for this chat
    active_doc_names: list[str]         # Human-readable filenames for the active docs
    has_uploaded_docs: bool             # True when doc_ids are active for this query

    # ── Error ────────────────────────────────────────────────────
    error: str | None
