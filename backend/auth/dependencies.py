"""
FastAPI dependencies for Supabase JWT authentication.

Provides ``get_current_user`` (401 if missing) and
``get_optional_user`` (returns *None* for guest requests).
"""

from __future__ import annotations

import logging
from dataclasses import dataclass

import jwt
from fastapi import Depends, HTTPException, Request, status

from backend.config import settings

logger = logging.getLogger("exics.auth")

_JWT_ALGORITHMS = ["HS256"]


# ── User dataclass ────────────────────────────────────────────
@dataclass
class AuthenticatedUser:
    id: str
    email: str
    name: str
    avatar_url: str | None = None


# ── Token extraction ─────────────────────────────────────────
def _extract_token(request: Request) -> str | None:
    auth = request.headers.get("Authorization")
    if auth and auth.lower().startswith("bearer "):
        return auth[7:].strip()
    return None


def _decode_token(token: str) -> dict:
    """Verify and decode a Supabase-issued JWT."""
    try:
        payload = jwt.decode(
            token,
            settings.supabase_jwt_secret,
            algorithms=_JWT_ALGORITHMS,
            audience="authenticated",
            options={"verify_exp": True},
        )
        return payload
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token expired")
    except jwt.InvalidTokenError as exc:
        logger.warning("JWT validation failed: %s", exc)
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")


def _payload_to_user(payload: dict) -> AuthenticatedUser:
    user_meta = payload.get("user_metadata", {})
    return AuthenticatedUser(
        id=payload["sub"],
        email=payload.get("email", ""),
        name=user_meta.get("full_name") or user_meta.get("name") or payload.get("email", ""),
        avatar_url=user_meta.get("avatar_url"),
    )


# ── Dependencies ──────────────────────────────────────────────
async def get_current_user(request: Request) -> AuthenticatedUser:
    """Require a valid Supabase JWT — raises 401 otherwise."""
    token = _extract_token(request)
    if not token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing auth token")
    payload = _decode_token(token)
    return _payload_to_user(payload)


async def get_optional_user(request: Request) -> AuthenticatedUser | None:
    """Return the user if a valid token is present, else *None* (guest)."""
    token = _extract_token(request)
    if not token:
        return None
    try:
        payload = _decode_token(token)
        return _payload_to_user(payload)
    except HTTPException:
        return None
