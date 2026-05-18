"""
Query endpoint — SSE streaming.

POST /api/v1/query
Runs the LangGraph RAG pipeline and streams tokens back to the frontend.

Document context flow:
  1. Frontend sends doc_ids with each query
  2. If chat_id exists, we also load doc_ids from the DB (for follow-ups)
  3. Both sources are merged and passed into the graph state
  4. The retrieval node uses doc_ids to scope its Qdrant search
"""

from __future__ import annotations

import asyncio
import json
import logging
import uuid
from typing import AsyncGenerator

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse

from backend.auth.dependencies import get_optional_user, AuthenticatedUser
from backend.config import settings
from backend.db import repository as repo
from backend.graph.builder import get_graph
from backend.models.schemas import QueryRequest
from backend.services.api_key_resolver import (
    MSG_NONE,
    MSG_PROVIDER,
    any_provider_available,
    friendly_llm_error,
    provider_display_name,
    resolve_provider_api_key,
)
from backend.services.title_generator import generate_chat_title

logger = logging.getLogger("exics.api.query")

router = APIRouter()


async def _run_graph(state: dict) -> dict:
    """Run the LangGraph pipeline synchronously in a thread."""
    graph = get_graph()
    loop = asyncio.get_event_loop()
    result = await loop.run_in_executor(None, graph.invoke, state)
    return result


async def _stream_response(
    request: QueryRequest,
    user: AuthenticatedUser | None,
) -> AsyncGenerator[str, None]:
    """Run the pipeline and yield SSE events."""

    provider = request.provider.value
    user_id = user.id if user else None
    client_keys = {provider: request.provider_api_key}

    if not any_provider_available(
        user_id,
        client_keys=client_keys,
        groq_use_server_default=request.groq_use_server_default,
    ):
        yield f"event: error\ndata: {json.dumps({'error': MSG_NONE})}\n\n"
        return

    api_key = resolve_provider_api_key(
        provider,
        user_id=user_id,
        client_api_key=request.provider_api_key,
        groq_use_server_default=request.groq_use_server_default,
    )
    if not api_key:
        name = provider_display_name(provider)
        yield f"event: error\ndata: {json.dumps({'error': MSG_PROVIDER.format(name=name)})}\n\n"
        return

    # Chat history: client sends recent turns; DB supplements for signed-in users
    chat_history: list[dict] = [
        {"role": m.role.value, "content": m.content}
        for m in request.chat_history[-10:]
        if m.content.strip()
    ]
    if request.chat_id and user and not request.incognito:
        try:
            if not repo.get_chat(request.chat_id, user.id):
                repo.ensure_chat(
                    request.chat_id,
                    user.id,
                    title=request.query[:48].strip() or "New chat",
                    model=provider,
                )
            db_msgs = repo.get_messages(request.chat_id)
            if len(db_msgs) > len(chat_history):
                chat_history = db_msgs[-10:]
        except Exception as exc:
            logger.warning("Failed to load chat from DB: %s", exc)

    # Document IDs scoped to THIS chat only (never bleed from other chats)
    doc_ids: list[str] = []
    doc_names: list[str] = []

    if request.chat_id:
        try:
            db_doc_ids = repo.get_chat_doc_ids(request.chat_id)
            db_doc_names = repo.get_chat_doc_names(request.chat_id)
            allowed = set(db_doc_ids)

            if user:
                if allowed:
                    incoming = list(request.doc_ids) if request.doc_ids else []
                    doc_ids = [d for d in incoming if d in allowed]
                    for did in db_doc_ids:
                        if did not in doc_ids:
                            doc_ids.append(did)
                    doc_names = list(db_doc_names)
                # else: logged-in chat has no linked PDFs — ignore stale client doc_ids
            else:
                doc_ids = list(request.doc_ids) if request.doc_ids else []
                doc_names = list(request.doc_names) if request.doc_names else []
        except Exception as exc:
            logger.warning("Failed to load chat doc context: %s", exc)
            if not user:
                doc_ids = list(request.doc_ids) if request.doc_ids else []
                doc_names = list(request.doc_names) if request.doc_names else []
    else:
        doc_ids = list(request.doc_ids) if request.doc_ids else []
        doc_names = list(request.doc_names) if request.doc_names else []

    logger.info(
        "Query: %s | chat_id=%s | web=%s | doc_ids=%s | history=%d msgs",
        request.query[:60],
        request.chat_id,
        request.web_search,
        doc_ids[:3] if doc_ids else "none",
        len(chat_history),
    )

    # Build initial state
    state = {
        "original_query": request.query,
        "rewritten_query": "",
        "query_type": "mixed",
        "retrieved_chunks": [],
        "relevant_chunks": [],
        "generation": "",
        "citations": [],
        "retry_count": 0,
        "max_retries": settings.max_retries,
        "web_search_needed": request.web_search,
        "web_search_enabled": request.web_search,
        "web_search_results": [],
        "used_web_search": False,
        "retrieval_failed": False,
        "has_uploaded_docs": bool(doc_ids),
        "hallucination_score": "",
        "selected_provider": provider,
        "selected_model": (request.model_name or "").strip() or None,
        "user_api_key": api_key,
        "chat_history": chat_history,
        "chat_id": request.chat_id,
        "incognito": request.incognito,
        "doc_ids": doc_ids,
        "active_doc_names": doc_names,
        "error": None,
    }

    # Run the graph
    try:
        result = await _run_graph(state)
    except Exception as exc:
        logger.error("Graph execution failed: %s", exc)
        yield f"event: error\ndata: {json.dumps({'error': friendly_llm_error(exc, provider, model_name=request.model_name, web_search_enabled=request.web_search)})}\n\n"
        return

    generation_text = result.get("generation", "")
    citations = result.get("citations", [])
    error = result.get("error")

    if error and not generation_text:
        yield f"event: error\ndata: {json.dumps({'error': friendly_llm_error(Exception(error), provider, model_name=request.model_name, web_search_enabled=request.web_search)})}\n\n"
        return

    # Stream tokens in small chunks for Claude-like feel
    chunk_size = 4
    for i in range(0, len(generation_text), chunk_size):
        token = generation_text[i : i + chunk_size]
        yield f"event: token\ndata: {json.dumps({'content': token})}\n\n"
        await asyncio.sleep(0.012)

    # Sources panel: only for web-search answers
    if citations and result.get("used_web_search"):
        yield f"event: citations\ndata: {json.dumps(citations)}\n\n"

    # Persist messages if logged in and not incognito
    if user and not request.incognito:
        try:
            chat_id = request.chat_id

            if not chat_id:
                chat_data = repo.create_chat(
                    user_id=user.id,
                    title="New chat",
                    model=provider,
                )
                chat_id = chat_data["id"]
            else:
                repo.ensure_chat(chat_id, user.id, title="New chat", model=provider)

            repo.create_message(
                chat_id=chat_id,
                role="user",
                content=request.query,
                attachments=[a.model_dump() for a in request.attachments] if request.attachments else None,
            )

            repo.create_message(
                chat_id=chat_id,
                role="assistant",
                content=generation_text,
                model=provider,
                citations=citations,
            )

            yield f"event: chat_id\ndata: {json.dumps({'chat_id': chat_id})}\n\n"

        except Exception as exc:
            logger.error("Failed to persist messages: %s", exc)

    # AI-generated sidebar title after the first Q&A in a chat
    is_first_exchange = len(request.chat_history) == 0
    if is_first_exchange and generation_text and request.chat_id and not request.incognito:
        try:
            new_title = generate_chat_title(request.query, generation_text)
            if user:
                repo.rename_chat(request.chat_id, user.id, new_title)
            yield (
                f"event: title\n"
                f"data: {json.dumps({'chat_id': request.chat_id, 'title': new_title})}\n\n"
            )
        except Exception as exc:
            logger.warning("Chat title generation failed: %s", exc)

    yield f"event: done\ndata: {json.dumps({})}\n\n"


@router.post("/query")
async def query(
    request: QueryRequest,
    user: AuthenticatedUser | None = Depends(get_optional_user),
):
    """Process a user query through the RAG pipeline."""
    if not user and request.provider.value != "groq":
        if not (request.provider_api_key or "").strip():
            raise HTTPException(
                status_code=403,
                detail=MSG_PROVIDER.format(
                    name=provider_display_name(request.provider.value),
                ),
            )

    return StreamingResponse(
        _stream_response(request, user),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
