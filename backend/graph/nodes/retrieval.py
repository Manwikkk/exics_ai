"""
Retrieval node — query Qdrant for relevant chunks.

Implements two-phase retrieval:
  1. If doc_ids are present (user uploaded PDFs in this chat),
     search ONLY within those documents first.
  2. If no relevant results from phase 1, or no doc_ids,
     fall back to global collection search.

On Qdrant failure, automatically flags ``retrieval_failed=True``
so the routing layer falls back to web search.
"""

from __future__ import annotations

import logging

from backend.models.state import GraphState
from backend.services.vector_store import search_chunks

logger = logging.getLogger("exics.graph.retrieval")

# Minimum cosine similarity to keep a chunk (lower when scoped to uploaded docs)
_MIN_SCORE_GLOBAL = 0.25
_MIN_SCORE_DOC_SCOPED = 0.12


def retrieval(state: GraphState) -> GraphState:
    """
    Search Qdrant using the rewritten query.

    When the user uploaded documents (doc_ids), search ONLY within those
    documents — never fall back to the global corpus (which causes unrelated
  answers). Global search is used only when no chat documents are active.
    """
    query = state.get("rewritten_query") or state["original_query"]
    doc_ids = state.get("doc_ids", [])
    has_uploaded_docs = bool(doc_ids)
    logger.info("Retrieving chunks for: %s (doc_ids=%s)", query[:80], doc_ids[:3] if doc_ids else "none")

    web_enabled = bool(state.get("web_search_enabled") or state.get("web_search_needed"))

    try:
        if has_uploaded_docs:
            chunks = search_chunks(query, doc_ids=doc_ids)
            min_score = _MIN_SCORE_DOC_SCOPED
            chunks = [c for c in chunks if c.get("score", 0) >= min_score]
            logger.info("Doc-scoped retrieval: %d chunks (min_score=%.2f)", len(chunks), min_score)
        else:
            # No documents in THIS chat — do not search other chats' PDFs in Qdrant
            chunks = []
            logger.info("No documents in this chat — skipping vector retrieval")

        return {
            **state,
            "retrieved_chunks": chunks,
            "retrieval_failed": False,
            "has_uploaded_docs": has_uploaded_docs,
        }

    except Exception as exc:
        logger.error("Retrieval failed: %s", exc)
        return {
            **state,
            "retrieved_chunks": [],
            "retrieval_failed": True,
            "has_uploaded_docs": has_uploaded_docs,
            "web_search_needed": bool(state.get("web_search_needed")) and not has_uploaded_docs,
            "error": f"Vector DB retrieval error: {exc}",
        }
