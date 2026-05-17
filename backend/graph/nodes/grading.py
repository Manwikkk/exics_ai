"""
Document Grading node — filter retrieved chunks by relevance.
"""

from __future__ import annotations

import logging

from langchain_core.messages import HumanMessage, SystemMessage

from backend.models.state import GraphState
from backend.services.llm_provider import get_fast_llm

logger = logging.getLogger("exics.graph.grading")

_SYSTEM_PROMPT = """You are a relevance grader for a technical documentation retrieval system.
Given a user question and a retrieved document chunk, determine if the chunk is relevant to answering the question.
Respond with ONLY "yes" or "no". Nothing else."""


def grading(state: GraphState) -> GraphState:
    """Grade each retrieved chunk as relevant or irrelevant."""
    chunks = state.get("retrieved_chunks", [])
    query = state.get("rewritten_query") or state["original_query"]

    if not chunks:
        logger.info("No chunks to grade")
        return {**state, "relevant_chunks": []}

    llm = get_fast_llm()
    relevant: list[dict] = []

    for chunk in chunks:
        text = chunk.get("text", "")
        try:
            result = llm.invoke([
                SystemMessage(content=_SYSTEM_PROMPT),
                HumanMessage(
                    content=f"Question: {query}\n\nDocument chunk:\n{text[:1500]}"
                ),
            ])
            answer = result.content.strip().lower() if isinstance(result.content, str) else ""
            if answer.startswith("yes"):
                relevant.append(chunk)
        except Exception as exc:
            logger.warning("Grading call failed for chunk, including it: %s", exc)
            relevant.append(chunk)  # on error, include rather than exclude

    logger.info("Graded %d/%d chunks as relevant", len(relevant), len(chunks))
    return {**state, "relevant_chunks": relevant}
