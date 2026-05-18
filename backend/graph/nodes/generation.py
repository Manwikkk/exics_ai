"""
Answer Generation node — produce a grounded response from retrieved context.

Supports:
- Document-aware generation (knows which PDFs/files are active)
- Conversation memory via chat history injection
- Follow-up questions within a session
- Proper citation tracking
"""

from __future__ import annotations

import logging
import uuid

from langchain_core.messages import HumanMessage, SystemMessage, AIMessage

from backend.models.state import GraphState
from backend.services.api_key_resolver import friendly_llm_error
from backend.services.llm_provider import get_llm

logger = logging.getLogger("exics.graph.generation")

_SYSTEM_PROMPT = """You are Exics, a helpful and precise AI research assistant.

RULES:
1. Answer based on the provided context. If the context is insufficient, say so clearly — do NOT make up information.
2. Be concise, accurate, and well-structured. Use markdown formatting.
3. Use code blocks for code examples.
4. NEVER fabricate information, API signatures, code, or version numbers not present in the context.
5. When referencing information from context, naturally indicate the source (e.g., "According to the document...", "As mentioned in [Source X]...").
6. If multiple sources provide conflicting information, note the discrepancy.
7. Keep answers focused and helpful — clear, well-organized, no fluff.

DOCUMENT CONTEXT:
If the user has uploaded documents (PDFs, text files, etc.), your primary job is to answer
questions based on those documents. Treat the uploaded documents as your knowledge base.
When the user asks about "this document", "the paper", "the file", etc., they mean their
uploaded documents.

CONVERSATION CONTEXT:
You are in an ongoing conversation. The user may ask follow-up questions referencing
previous messages. Use the conversation history to understand context and resolve
pronouns like "it", "that", "this", "the above", etc. When a follow-up question
is ambiguous, interpret it in light of the most recent exchange.

WEB SEARCH:
When web search results are provided, base your answer on those results. Cite sources naturally.
If uploaded documents AND web results are both present, combine them: prefer the document for
document-specific facts, and use web results for broader or missing information.

When web search is enabled but returned no results, say so — do NOT invent an answer."""

_DOC_CONTEXT_TEMPLATE = """The user has uploaded the following documents: {doc_names}

Here is the retrieved context from those documents and/or other sources:

{context}

---
User question: {question}"""

_CONTEXT_TEMPLATE = """Here is the retrieved context to base your answer on:

{context}

---
User question: {question}"""

_NO_CONTEXT_TEMPLATE = """No documentation or web results were found for this question.

Tell the user you do not have enough information to answer. Do NOT invent facts or use unsupported general knowledge.

User question: {question}"""

_WEB_CONTEXT_TEMPLATE = """The user enabled web search. Answer using ONLY the web results below (from Tavily and/or Google/Serper).

{context}

---
User question: {question}

Instructions:
- Give a detailed, accurate answer grounded in the web results above.
- If document excerpts are included above, combine document facts with web facts clearly.
- Do not add information that is not supported by the provided context."""

_WEB_NO_RESULTS_TEMPLATE = """The user enabled web search, but Tavily and Serper returned no usable results.

You MUST tell the user that web search failed or found nothing. Do NOT guess or make up an answer.
Suggest they check that TAVILY_API_KEY and SERPER_API_KEY are valid in the server .env file, or rephrase the question.

User question: {question}"""

_DOC_NO_CONTEXT_TEMPLATE = """The user uploaded document(s): {doc_names}

However, no relevant passages were retrieved from those documents for this question.

You MUST:
1. State clearly that you could not find an answer in the uploaded document(s).
2. Do NOT invent facts, quotes, or content from the documents.
3. Suggest the user rephrase their question or confirm the PDF uploaded correctly and contains selectable text.
4. You may offer only very general guidance if helpful, and label it as general knowledge — not from their file.

User question: {question}"""


def generation(state: GraphState) -> GraphState:
    """Generate a grounded answer using the selected provider, with conversation memory and document awareness."""
    query = state.get("rewritten_query") or state["original_query"]
    original_query = state.get("original_query", query)
    relevant = state.get("relevant_chunks", [])
    web_results = state.get("web_search_results", [])
    provider = state.get("selected_provider", "groq")
    api_key = state.get("user_api_key")
    model_name = state.get("selected_model") or None
    chat_history = state.get("chat_history", [])
    doc_names = state.get("active_doc_names", [])
    has_uploaded_docs = state.get("has_uploaded_docs") or bool(state.get("doc_ids", []))
    web_enabled = bool(state.get("web_search_enabled") or state.get("web_search_needed"))

    # Build LLM context from retrieved docs + web (citations are web-only)
    context_parts: list[str] = []
    web_citations: list[dict] = []

    for i, chunk in enumerate(relevant):
        source_label = chunk.get("title") or chunk.get("source") or f"Document {i + 1}"
        page = chunk.get("page")
        page_info = f" (Page {page})" if page else ""
        context_parts.append(f"[{source_label}{page_info}]\n{chunk['text']}")

    for j, wr in enumerate(web_results):
        title = wr.get("title", f"Web result {j + 1}")
        url = wr.get("url", "")
        context_parts.append(f"[Web: {title}]\n{wr.get('content', '')}")
        if url:
            web_citations.append({
                "id": str(uuid.uuid4()),
                "title": title,
                "url": url,
                "snippet": wr.get("content", "")[:200],
            })

    # Build messages with conversation memory
    messages = [SystemMessage(content=_SYSTEM_PROMPT)]

    # Inject chat history for follow-up context (last 5 turns = 10 messages)
    if chat_history:
        for msg in chat_history[-10:]:
            role = msg.get("role", "user")
            content = msg.get("content", "")
            if not content:
                continue
            # Truncate very long previous messages to save context window
            truncated = content[:2000] + ("..." if len(content) > 2000 else "")
            if role == "user":
                messages.append(HumanMessage(content=truncated))
            else:
                messages.append(AIMessage(content=truncated))

    # Build the final user message with context
    if context_parts:
        context_str = "\n\n---\n\n".join(context_parts)
        if web_enabled:
            messages.append(
                HumanMessage(content=_WEB_CONTEXT_TEMPLATE.format(
                    context=context_str,
                    question=original_query,
                ))
            )
        elif doc_names:
            messages.append(
                HumanMessage(content=_DOC_CONTEXT_TEMPLATE.format(
                    doc_names=", ".join(doc_names),
                    context=context_str,
                    question=original_query,
                ))
            )
        else:
            messages.append(
                HumanMessage(content=_CONTEXT_TEMPLATE.format(
                    context=context_str,
                    question=original_query,
                ))
            )
    elif web_enabled:
        messages.append(
            HumanMessage(content=_WEB_NO_RESULTS_TEMPLATE.format(question=original_query))
        )
    elif has_uploaded_docs and doc_names:
        messages.append(
            HumanMessage(content=_DOC_NO_CONTEXT_TEMPLATE.format(
                doc_names=", ".join(doc_names),
                question=original_query,
            ))
        )
    elif has_uploaded_docs:
        messages.append(
            HumanMessage(content=_DOC_NO_CONTEXT_TEMPLATE.format(
                doc_names="uploaded document(s)",
                question=original_query,
            ))
        )
    else:
        messages.append(
            HumanMessage(content=_NO_CONTEXT_TEMPLATE.format(question=original_query))
        )

    try:
        llm = get_llm(
            provider,
            api_key,
            model_name=model_name,
            streaming=False,
            temperature=0.15,
        )
        result = llm.invoke(messages)
        content = result.content if isinstance(result.content, str) else str(result.content)

        # Sources panel: only show links when web search supplied results
        citations = web_citations if state.get("used_web_search") else []

        logger.info(
            "Generated %d chars | web_citations=%d (history: %d msgs, docs: %s)",
            len(content), len(citations), len(chat_history),
            doc_names[:3] if doc_names else "none",
        )
        return {**state, "generation": content, "citations": citations}

    except Exception as exc:
        logger.error("Generation failed: %s", exc)
        friendly = friendly_llm_error(
            exc,
            provider,
            model_name=model_name,
            web_search_enabled=web_enabled,
        )
        return {
            **state,
            "generation": friendly,
            "citations": [],
        }
