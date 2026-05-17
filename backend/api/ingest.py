"""
Document ingestion endpoints.

Supports per-chat document scoping:
  - Accepts optional ``chat_id`` to link ingested documents to a chat.
  - Returns ``doc_ids`` so the frontend can track which documents are active.
"""

from __future__ import annotations

import asyncio
import logging
from typing import Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile

from backend.auth.dependencies import get_optional_user, AuthenticatedUser
from backend.db import repository as repo
from backend.models.schemas import DocumentOut, IngestURLRequest
from backend.services.ingestion import ingest_file, ingest_url

logger = logging.getLogger("exics.api.ingest")

router = APIRouter()


@router.post("/ingest", status_code=201)
async def ingest(
    files: list[UploadFile] = File(default=[]),
    chat_id: Optional[str] = Form(default=None),
    user: AuthenticatedUser | None = Depends(get_optional_user),
):
    """
    Ingest uploaded files. Extracts text, chunks, embeds, and stores in Qdrant.
    Also records document metadata in Supabase.

    If ``chat_id`` is provided, links the documents to that chat for
    per-chat document scoping (so follow-up questions retrieve the right context).
    """
    if not files:
        raise HTTPException(status_code=400, detail="No files provided")

    results = []
    doc_ids = []  # Collect doc_ids for the frontend

    loop = asyncio.get_event_loop()

    for f in files:
        try:
            content = await f.read()
            result = await loop.run_in_executor(
                None,
                lambda c=content, fn=f.filename, ct=f.content_type: ingest_file(
                    c,
                    fn or "unnamed",
                    ct or "application/octet-stream",
                    user_id=user.id if user else None,
                ),
            )

            # Track the doc_id
            if result.get("doc_id") and result.get("status") == "indexed":
                doc_ids.append(result["doc_id"])

            # Persist document metadata
            try:
                repo.create_document(
                    user_id=user.id if user else None,
                    filename=f.filename or "unnamed",
                    file_type=f.content_type or "unknown",
                    file_size=len(content),
                    chunk_count=result["chunk_count"],
                    status=result["status"],
                    doc_id=result["doc_id"],
                )
            except Exception as exc:
                logger.warning("Failed to store document metadata: %s", exc)

            # Link document to chat (persisted per chat for follow-up questions)
            if chat_id and result.get("doc_id") and result.get("status") == "indexed":
                try:
                    if user:
                        repo.ensure_chat(chat_id, user.id, title="New chat")
                    repo.link_document_to_chat(
                        chat_id=chat_id,
                        doc_id=result["doc_id"],
                        filename=f.filename or "unnamed",
                    )
                except Exception as exc:
                    logger.warning("Failed to link doc to chat: %s", exc)

            results.append(result)
        except Exception as exc:
            logger.error("Ingestion failed for %s: %s", f.filename, exc)
            results.append({
                "doc_id": None,
                "filename": f.filename,
                "chunk_count": 0,
                "status": "error",
                "error": str(exc),
            })

    if not doc_ids and results:
        errors = [r for r in results if r.get("status") in ("error", "empty")]
        if errors and len(errors) == len(results):
            detail = errors[0].get("error") or (
                "No text could be extracted from the file(s). "
                "Ensure PDFs contain selectable text (not scanned images only)."
            )
            raise HTTPException(status_code=422, detail=detail)

    return {"documents": results, "doc_ids": doc_ids}


@router.post("/ingest/urls", status_code=201)
async def ingest_urls(
    body: IngestURLRequest,
    user: AuthenticatedUser | None = Depends(get_optional_user),
):
    """Ingest documents from URLs."""
    results = []
    doc_ids = []

    for url in body.urls:
        try:
            result = await ingest_url(url)

            if result.get("doc_id") and result.get("status") == "indexed":
                doc_ids.append(result["doc_id"])

            # Persist metadata
            try:
                repo.create_document(
                    user_id=user.id if user else None,
                    filename=result["filename"],
                    file_type="text/html",
                    chunk_count=result["chunk_count"],
                    status=result["status"],
                    source_url=url,
                    doc_id=result["doc_id"],
                )
            except Exception as exc:
                logger.warning("Failed to store document metadata: %s", exc)

            results.append(result)
        except Exception as exc:
            logger.error("URL ingestion failed for %s: %s", url, exc)
            results.append({
                "doc_id": None,
                "filename": url,
                "chunk_count": 0,
                "status": "error",
                "error": str(exc),
            })

    return {"documents": results, "doc_ids": doc_ids}


@router.get("/documents", response_model=list[DocumentOut])
async def list_documents(
    user: AuthenticatedUser | None = Depends(get_optional_user),
):
    """List all indexed documents."""
    return repo.list_documents(user_id=user.id if user else None)
