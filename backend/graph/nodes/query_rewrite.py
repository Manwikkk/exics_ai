"""
Query rewrite node for corrective RAG — used when grading finds no relevant chunks.

Rewrites the query with a different angle and increments retry_count before
re-running retrieval (assignment: rewrite query and re-retrieve with retry limit).
"""

from __future__ import annotations

import logging

from langchain_core.messages import HumanMessage, SystemMessage

from backend.models.state import GraphState
from backend.services.llm_provider import get_fast_llm

logger = logging.getLogger("exics.graph.query_rewrite")

_SYSTEM_PROMPT = """You rewrite user questions for semantic search over technical documents.
The previous retrieval returned no useful matches. Produce a NEW search query that:
- Uses different keywords and synonyms than the failed attempt
- Stays faithful to the user's intent and any active document names
- Is concise (one sentence, no preamble)

Respond with ONLY the rewritten search query. Nothing else."""


def query_rewrite_retry(state: GraphState) -> GraphState:
    """Rewrite the query for another retrieval attempt."""
    original = state["original_query"]
    previous = state.get("rewritten_query") or original
    doc_names = state.get("active_doc_names", [])
    retry_count = state.get("retry_count", 0)

    doc_hint = ""
    if doc_names:
        doc_hint = f"\nActive documents: {', '.join(doc_names)}"

    try:
        llm = get_fast_llm()
        result = llm.invoke([
            SystemMessage(content=_SYSTEM_PROMPT),
            HumanMessage(
                content=(
                    f"Original question: {original}\n"
                    f"Previous search query (no results): {previous}"
                    f"{doc_hint}\n\n"
                    "Write a better search query:"
                )
            ),
        ])
        rewritten = result.content.strip() if isinstance(result.content, str) else previous
        if not rewritten:
            rewritten = original
        logger.info("Retry rewrite (%d): %s", retry_count + 1, rewritten[:80])
        return {
            **state,
            "rewritten_query": rewritten,
            "retry_count": retry_count + 1,
            "retrieved_chunks": [],
            "relevant_chunks": [],
        }
    except Exception as exc:
        logger.warning("Query rewrite failed: %s", exc)
        return {**state, "retry_count": retry_count + 1}
