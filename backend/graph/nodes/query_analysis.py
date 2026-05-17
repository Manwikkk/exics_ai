"""
Query Analysis node — rewrite and classify the user query.

Uses chat history AND active document context to resolve
follow-up references like "it", "that", "the above", "tell me more", etc.

When documents are active, the rewriter preserves document-specific
intent rather than generalizing the query.
"""

from __future__ import annotations

import logging

from langchain_core.messages import HumanMessage, SystemMessage

from backend.models.state import GraphState
from backend.services.llm_provider import get_fast_llm

logger = logging.getLogger("exics.graph.query_analysis")

_SYSTEM_PROMPT = """You are a query analysis assistant for a document Q&A system.
Your job is to:
1. Rewrite the user's query to be more specific and better suited for semantic search retrieval.
2. Classify the query intent into one of: conceptual, how-to, troubleshooting, api-reference, mixed.

IMPORTANT — Follow-up handling:
- If the user's query is a follow-up (e.g., "tell me more", "what about X?", "explain that"),
  you MUST incorporate context from the conversation history into the rewritten query.
- Replace pronouns ("it", "this", "that") with the actual subject from previous messages.
- If a document/PDF was discussed, reference it in the rewritten query.
- A stand-alone query should be rewritten on its own merits.

IMPORTANT — Document context:
- If the user has uploaded documents, their queries are likely about those documents.
- When documents are active, bias the rewrite toward searching within those documents.
- If the user says "summarize this", "what is this about", "explain chapter X", etc.,
  rewrite to be specific about the document content, NOT a generic web query.
- Keep document-specific terminology and references intact.

Respond in EXACTLY this format (no extra text):
REWRITTEN: <your rewritten query>
TYPE: <intent type>

Rules:
- Keep the rewritten query concise but specific.
- Expand acronyms if obvious.
- If the query references code, keep technical terms.
- Do not add information the user didn't imply.
- For follow-ups, merge the current question with relevant context from history."""


def query_analysis(state: GraphState) -> GraphState:
    """Rewrite the user query and classify its intent, using chat history and document context for follow-ups."""
    original = state["original_query"]
    chat_history = state.get("chat_history", [])
    doc_ids = state.get("doc_ids", [])
    doc_names = state.get("active_doc_names", [])
    logger.info("Analysing query: %s", original[:80])

    # Build context from recent chat history for follow-up resolution
    history_context = ""
    if chat_history:
        recent = chat_history[-6:]  # last 3 turns
        parts = []
        for msg in recent:
            role = msg.get("role", "user")
            content = msg.get("content", "")
            if content:
                parts.append(f"{role}: {content[:500]}")
        if parts:
            history_context = "\n\nRecent conversation:\n" + "\n".join(parts)

    # Build document context
    doc_context = ""
    if doc_names:
        doc_context = f"\n\nActive documents in this chat: {', '.join(doc_names)}"
        doc_context += "\nThe user's question is likely about these documents."

    try:
        llm = get_fast_llm()

        prompt_content = f"Current query: {original}"
        if doc_context:
            prompt_content = f"{doc_context}\n\n{prompt_content}"
        if history_context:
            prompt_content = f"{history_context}\n\n{prompt_content}"

        result = llm.invoke([
            SystemMessage(content=_SYSTEM_PROMPT),
            HumanMessage(content=prompt_content),
        ])
        text = result.content if isinstance(result.content, str) else str(result.content)

        rewritten = original
        query_type = "mixed"

        for line in text.strip().split("\n"):
            if line.upper().startswith("REWRITTEN:"):
                rewritten = line.split(":", 1)[1].strip()
            elif line.upper().startswith("TYPE:"):
                qt = line.split(":", 1)[1].strip().lower()
                if qt in ("conceptual", "how-to", "troubleshooting", "api-reference", "mixed"):
                    query_type = qt

        logger.info("Rewritten: %s | Type: %s", rewritten[:80], query_type)
        return {**state, "rewritten_query": rewritten, "query_type": query_type}

    except Exception as exc:
        logger.warning("Query analysis failed, using original: %s", exc)
        return {**state, "rewritten_query": original, "query_type": "mixed"}
