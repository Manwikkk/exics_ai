"""
Self-RAG inspired Hallucination / Grounding Check node.

Performs a multi-dimensional verification:
  1. Faithfulness — is every claim in the answer traceable to the context?
  2. Relevance   — does the answer actually address the user's question?
  3. Completeness — does the answer cover the key points from the context?

If the answer fails, it triggers regeneration with a tighter prompt.
"""

from __future__ import annotations

import logging

from langchain_core.messages import HumanMessage, SystemMessage

from backend.models.state import GraphState
from backend.services.llm_provider import get_fast_llm

logger = logging.getLogger("exics.graph.hallucination")

_SYSTEM_PROMPT = """You are a Self-RAG grounding verifier for an AI documentation assistant.

You must evaluate the generated answer against the retrieved context on THREE dimensions:

1. **Faithfulness**: Is every factual claim in the answer directly supported by or inferable from the context? Flag any claim that cannot be traced back to a specific context passage.

2. **Relevance**: Does the answer address the user's original question? An answer can be faithful to context but miss the point.

3. **Completeness**: Does the answer cover the important information available in the context, or does it omit key details?

Respond in EXACTLY this format:
FAITHFULNESS: <grounded|partial|ungrounded>
RELEVANCE: <relevant|off-topic>
COMPLETENESS: <complete|partial|incomplete>
VERDICT: <grounded|partial|ungrounded>
ISSUES: <one-line summary of problems, or "none">

Rules:
- General-knowledge definitions are acceptable even without context support.
- If the answer explicitly states no documentation was found, always verdict "grounded".
- Be strict about fabricated code examples, API signatures, or version numbers not in context.
- "partial" means the core answer is correct but contains some unsupported additions."""


def hallucination_check(state: GraphState) -> GraphState:
    """
    Self-RAG style grounding verification.

    Checks faithfulness, relevance, and completeness.
    If ungrounded -> clears generation to trigger retry.
    If partial -> accepts but logs the issues.
    """
    generation = state.get("generation", "")
    relevant = state.get("relevant_chunks", [])
    web_results = state.get("web_search_results", [])
    retry_count = state.get("retry_count", 0)
    max_retries = state.get("max_retries", 2)

    all_context = relevant + web_results
    if not all_context:
        logger.info("No context to check against — skipping hallucination check")
        return {**state, "hallucination_score": "grounded"}

    if retry_count >= max_retries:
        logger.warning("Max retries (%d) reached — accepting current generation", max_retries)
        return {**state, "hallucination_score": "accepted_after_retries"}

    context_parts = []
    for c in relevant[:5]:
        context_parts.append(c.get("text", ""))
    for w in web_results[:3]:
        context_parts.append(w.get("content", ""))
    context_text = "\n\n---\n\n".join(context_parts)

    original_query = state.get("original_query", "")

    try:
        llm = get_fast_llm()
        result = llm.invoke([
            SystemMessage(content=_SYSTEM_PROMPT),
            HumanMessage(
                content=(
                    f"User question: {original_query}\n\n"
                    f"Context:\n{context_text[:4000]}\n\n"
                    f"Generated answer:\n{generation[:3000]}"
                )
            ),
        ])
        response = result.content.strip() if isinstance(result.content, str) else ""

        verdict = "grounded"
        issues = "none"
        for line in response.split("\n"):
            line_up = line.strip().upper()
            if line_up.startswith("VERDICT:"):
                v = line.split(":", 1)[1].strip().lower()
                if "ungrounded" in v:
                    verdict = "ungrounded"
                elif "partial" in v:
                    verdict = "partial"
                else:
                    verdict = "grounded"
            elif line_up.startswith("ISSUES:"):
                issues = line.split(":", 1)[1].strip()

        if verdict == "grounded":
            logger.info("Self-RAG check: GROUNDED")
            return {**state, "hallucination_score": "grounded"}
        elif verdict == "partial":
            logger.info("Self-RAG check: PARTIAL (accepting) — issues: %s", issues)
            return {**state, "hallucination_score": "partial"}
        else:
            logger.warning(
                "Self-RAG check: UNGROUNDED (retry %d/%d) — issues: %s",
                retry_count + 1, max_retries, issues,
            )
            return {
                **state,
                "retry_count": retry_count + 1,
                "generation": "",
                "hallucination_score": "ungrounded",
            }

    except Exception as exc:
        logger.warning("Hallucination check failed, accepting generation: %s", exc)
        return {**state, "hallucination_score": "check_failed"}
