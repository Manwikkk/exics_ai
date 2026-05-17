"""
Auth endpoints.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends

from backend.auth.dependencies import get_current_user, AuthenticatedUser

router = APIRouter()


@router.get("/auth/me")
async def me(user: AuthenticatedUser = Depends(get_current_user)):
    """Return the current user's info (session validation)."""
    return {
        "id": user.id,
        "email": user.email,
        "name": user.name,
        "avatar_url": user.avatar_url,
    }
