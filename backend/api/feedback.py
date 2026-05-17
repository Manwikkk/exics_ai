"""
Feedback endpoint.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends

from backend.auth.dependencies import get_optional_user, AuthenticatedUser
from backend.db import repository as repo
from backend.models.schemas import FeedbackCreate

router = APIRouter()


@router.post("/feedback", status_code=201)
async def submit_feedback(
    body: FeedbackCreate,
    user: AuthenticatedUser | None = Depends(get_optional_user),
):
    """Submit thumbs up/down feedback on a response."""
    repo.create_feedback(
        user_id=user.id if user else None,
        chat_id=body.chat_id,
        message_id=body.message_id,
        rating=body.rating,
        comment=body.comment,
    )
    return {"status": "ok"}
