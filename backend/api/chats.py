"""
Chat CRUD endpoints.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query

from backend.auth.dependencies import get_current_user, AuthenticatedUser
from backend.db import repository as repo
from backend.models.schemas import ChatCreate, ChatRename, ChatOut, MessageOut

router = APIRouter()


@router.get("/chats", response_model=list[ChatOut])
async def list_chats(user: AuthenticatedUser = Depends(get_current_user)):
    """List all chats for the current user."""
    return repo.list_chats(user.id)


@router.post("/chats", response_model=ChatOut, status_code=201)
async def create_chat(
    body: ChatCreate,
    user: AuthenticatedUser = Depends(get_current_user),
):
    """Create a new chat."""
    return repo.create_chat(user.id, body.title, body.model.value)


@router.get("/chats/search", response_model=list[ChatOut])
async def search_chats(
    q: str = Query(..., min_length=1),
    user: AuthenticatedUser = Depends(get_current_user),
):
    """Search chats by title."""
    return repo.search_chats(user.id, q)


@router.get("/chats/{chat_id}/messages", response_model=list[MessageOut])
async def get_messages(
    chat_id: str,
    user: AuthenticatedUser = Depends(get_current_user),
):
    """Load chat history (messages) for a specific chat."""
    # Verify ownership
    chat = repo.get_chat(chat_id, user.id)
    if not chat:
        raise HTTPException(status_code=404, detail="Chat not found")
    return repo.get_messages(chat_id)


@router.patch("/chats/{chat_id}", response_model=ChatOut)
async def rename_chat(
    chat_id: str,
    body: ChatRename,
    user: AuthenticatedUser = Depends(get_current_user),
):
    """Rename a chat."""
    result = repo.rename_chat(chat_id, user.id, body.title)
    if not result:
        raise HTTPException(status_code=404, detail="Chat not found")
    return result


@router.delete("/chats/{chat_id}", status_code=204)
async def delete_chat(
    chat_id: str,
    user: AuthenticatedUser = Depends(get_current_user),
):
    """Delete a chat and all its messages."""
    deleted = repo.delete_chat(chat_id, user.id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Chat not found")
