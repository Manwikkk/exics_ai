"""
Fernet symmetric encryption for user-stored API keys.
"""

from __future__ import annotations

from cryptography.fernet import Fernet

from backend.config import settings

_fernet: Fernet | None = None


def _get_fernet() -> Fernet:
    global _fernet
    if _fernet is None:
        _fernet = Fernet(settings.encryption_key.encode())
    return _fernet


def encrypt_key(plain: str) -> str:
    """Encrypt an API key → URL-safe base64 string."""
    return _get_fernet().encrypt(plain.encode()).decode()


def decrypt_key(token: str) -> str:
    """Decrypt a stored encrypted key back to plaintext."""
    return _get_fernet().decrypt(token.encode()).decode()


def mask_key(plain: str) -> str:
    """Return a masked preview like ``sk-…abc1``."""
    if len(plain) <= 8:
        return "••••••••"
    return plain[:4] + "…" + plain[-4:]
