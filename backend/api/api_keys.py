"""
API key management endpoints.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException

from backend.auth.dependencies import get_current_user, get_optional_user, AuthenticatedUser
from backend.db import repository as repo
from backend.models.schemas import ApiKeyAdd, ApiKeyUpdate, ApiKeyStatusOut

router = APIRouter()


@router.post("/api-keys", status_code=201)
async def add_api_key(
    body: ApiKeyAdd,
    user: AuthenticatedUser = Depends(get_current_user),
):
    """Add or update an API key for a provider."""
    repo.save_api_key(user.id, body.provider.value, body.key)
    return {"status": "ok", "provider": body.provider.value}


@router.patch("/api-keys/{provider}")
async def update_api_key(
    provider: str,
    body: ApiKeyUpdate,
    user: AuthenticatedUser = Depends(get_current_user),
):
    """Update an existing API key."""
    if provider not in ("groq", "gemini", "claude", "openai"):
        raise HTTPException(status_code=400, detail="Invalid provider")
    repo.save_api_key(user.id, provider, body.key)
    return {"status": "ok", "provider": provider}


@router.delete("/api-keys/{provider}", status_code=204)
async def delete_api_key(
    provider: str,
    user: AuthenticatedUser = Depends(get_current_user),
):
    """Delete a stored API key."""
    if provider not in ("groq", "gemini", "claude", "openai"):
        raise HTTPException(status_code=400, detail="Invalid provider")
    deleted = repo.delete_api_key(user.id, provider)
    if not deleted:
        raise HTTPException(status_code=404, detail="API key not found")


@router.get("/api-keys/status", response_model=ApiKeyStatusOut)
async def api_key_status(
    user: AuthenticatedUser = Depends(get_current_user),
):
    """Return which providers have API keys configured."""
    return repo.get_api_key_status(user.id)


@router.get("/providers/status")
async def providers_status(
    user: AuthenticatedUser | None = Depends(get_optional_user),
):
    """
    Provider configuration for the settings UI.

    Groq shows as configured when a server default key exists or the user
    saved a custom key.
    """
    return repo.get_api_key_status_with_defaults(user.id if user else None)
