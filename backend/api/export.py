"""
PDF export endpoint.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response

from backend.auth.dependencies import get_current_user, AuthenticatedUser
from backend.db import repository as repo
from backend.models.schemas import ExportPdfRequest
from backend.services.pdf_export import export_chat_to_pdf

router = APIRouter()


@router.post("/export/pdf")
async def export_pdf(
    body: ExportPdfRequest,
    user: AuthenticatedUser = Depends(get_current_user),
):
    """Export a chat conversation to a polished PDF."""
    chat = repo.get_chat(body.chat_id, user.id)
    if not chat:
        raise HTTPException(status_code=404, detail="Chat not found")

    messages = repo.get_messages(body.chat_id)
    if not messages:
        raise HTTPException(status_code=400, detail="Chat has no messages")

    pdf_bytes = export_chat_to_pdf(
        title=chat["title"],
        messages=messages,
        updated_at=chat.get("updated_at"),
    )

    safe_title = "".join(c if c.isalnum() or c in " -_" else "_" for c in chat["title"])[:60]

    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'attachment; filename="{safe_title}.pdf"',
        },
    )
