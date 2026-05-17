"""
Supabase data-access layer.

Thin wrappers around Supabase PostgREST calls for chats, messages,
documents, API keys, and feedback.
"""

from __future__ import annotations

import json
import logging
import uuid
from datetime import datetime, timezone
from typing import Any

from backend.services.supabase_client import get_supabase
from backend.services.encryption import encrypt_key, decrypt_key

logger = logging.getLogger("exics.db")


def _now_ms() -> float:
    """Current UTC timestamp in epoch milliseconds."""
    return datetime.now(timezone.utc).timestamp() * 1000


def _iso_to_ms(iso: str | None) -> float:
    """Convert an ISO-8601 timestamp to epoch milliseconds."""
    if not iso:
        return _now_ms()
    try:
        dt = datetime.fromisoformat(iso.replace("Z", "+00:00"))
        return dt.timestamp() * 1000
    except Exception:
        return _now_ms()


# ═══════════════════════════════════════════════════════════════
#  CHATS
# ═══════════════════════════════════════════════════════════════

def create_chat(user_id: str, title: str = "New chat", model: str = "groq") -> dict[str, Any]:
    sb = get_supabase()
    row = {
        "id": str(uuid.uuid4()),
        "user_id": user_id,
        "title": title,
        "model": model,
    }
    result = sb.table("chats").insert(row).execute()
    chat = result.data[0]
    return _format_chat(chat)


def list_chats(user_id: str) -> list[dict[str, Any]]:
    sb = get_supabase()
    result = (
        sb.table("chats")
        .select("*")
        .eq("user_id", user_id)
        .order("updated_at", desc=True)
        .execute()
    )
    return [_format_chat(c) for c in result.data]


def ensure_chat(
    chat_id: str,
    user_id: str,
    *,
    title: str = "New chat",
    model: str = "groq",
) -> str:
    """Create the chat row if it does not exist (idempotent). Returns chat_id."""
    sb = get_supabase()
    existing = (
        sb.table("chats")
        .select("id")
        .eq("id", chat_id)
        .eq("user_id", user_id)
        .execute()
    )
    if existing.data:
        return chat_id

    sb.table("chats").insert(
        {
            "id": chat_id,
            "user_id": user_id,
            "title": title,
            "model": model,
        }
    ).execute()
    logger.info("Created chat %s for user %s", chat_id, user_id)
    return chat_id


def get_chat(chat_id: str, user_id: str) -> dict[str, Any] | None:
    sb = get_supabase()
    result = (
        sb.table("chats")
        .select("*")
        .eq("id", chat_id)
        .eq("user_id", user_id)
        .execute()
    )
    if not result.data:
        return None
    return _format_chat(result.data[0])


def rename_chat(chat_id: str, user_id: str, title: str) -> dict[str, Any] | None:
    sb = get_supabase()
    result = (
        sb.table("chats")
        .update({"title": title, "updated_at": datetime.now(timezone.utc).isoformat()})
        .eq("id", chat_id)
        .eq("user_id", user_id)
        .execute()
    )
    if not result.data:
        return None
    return _format_chat(result.data[0])


def delete_chat(chat_id: str, user_id: str) -> bool:
    sb = get_supabase()
    result = (
        sb.table("chats")
        .delete()
        .eq("id", chat_id)
        .eq("user_id", user_id)
        .execute()
    )
    return bool(result.data)


def search_chats(user_id: str, query: str) -> list[dict[str, Any]]:
    sb = get_supabase()
    result = (
        sb.table("chats")
        .select("*")
        .eq("user_id", user_id)
        .ilike("title", f"%{query}%")
        .order("updated_at", desc=True)
        .execute()
    )
    return [_format_chat(c) for c in result.data]


def update_chat_timestamp(chat_id: str) -> None:
    sb = get_supabase()
    sb.table("chats").update(
        {"updated_at": datetime.now(timezone.utc).isoformat()}
    ).eq("id", chat_id).execute()


def _format_chat(row: dict) -> dict[str, Any]:
    return {
        "id": row["id"],
        "title": row["title"],
        "model": row.get("model", "groq"),
        "created_at": _iso_to_ms(row.get("created_at")),
        "updated_at": _iso_to_ms(row.get("updated_at")),
    }


# ═══════════════════════════════════════════════════════════════
#  MESSAGES
# ═══════════════════════════════════════════════════════════════

def create_message(
    chat_id: str,
    role: str,
    content: str,
    *,
    model: str | None = None,
    attachments: list[dict] | None = None,
    citations: list[dict] | None = None,
) -> dict[str, Any]:
    sb = get_supabase()
    row = {
        "id": str(uuid.uuid4()),
        "chat_id": chat_id,
        "role": role,
        "content": content,
        "model": model,
        "attachments": json.dumps(attachments or []),
        "citations": json.dumps(citations or []),
    }
    result = sb.table("messages").insert(row).execute()
    msg = result.data[0]
    # Also bump the parent chat's updated_at
    update_chat_timestamp(chat_id)
    return _format_message(msg)


def get_messages(chat_id: str) -> list[dict[str, Any]]:
    sb = get_supabase()
    result = (
        sb.table("messages")
        .select("*")
        .eq("chat_id", chat_id)
        .order("created_at", desc=False)
        .execute()
    )
    return [_format_message(m) for m in result.data]


def _format_message(row: dict) -> dict[str, Any]:
    attachments = row.get("attachments", "[]")
    if isinstance(attachments, str):
        attachments = json.loads(attachments)
    citations = row.get("citations", "[]")
    if isinstance(citations, str):
        citations = json.loads(citations)
    return {
        "id": row["id"],
        "role": row["role"],
        "content": row["content"],
        "created_at": _iso_to_ms(row.get("created_at")),
        "attachments": attachments,
        "citations": citations,
        "model": row.get("model"),
    }


# ═══════════════════════════════════════════════════════════════
#  DOCUMENTS
# ═══════════════════════════════════════════════════════════════

def create_document(
    user_id: str | None,
    filename: str,
    file_type: str,
    file_size: int | None = None,
    chunk_count: int = 0,
    status: str = "processing",
    source_url: str | None = None,
    doc_id: str | None = None,
) -> dict[str, Any]:
    sb = get_supabase()
    row: dict[str, Any] = {
        "id": doc_id or str(uuid.uuid4()),
        "filename": filename,
        "file_type": file_type,
        "file_size": file_size,
        "chunk_count": chunk_count,
        "status": status,
        "source_url": source_url,
    }
    if user_id:
        row["user_id"] = user_id
    result = sb.table("documents").insert(row).execute()
    return _format_document(result.data[0])


def list_documents(user_id: str | None = None) -> list[dict[str, Any]]:
    sb = get_supabase()
    q = sb.table("documents").select("*").order("created_at", desc=True)
    if user_id:
        q = q.eq("user_id", user_id)
    result = q.execute()
    return [_format_document(d) for d in result.data]


def update_document(doc_id: str, **fields: Any) -> None:
    sb = get_supabase()
    sb.table("documents").update(fields).eq("id", doc_id).execute()


def _format_document(row: dict) -> dict[str, Any]:
    return {
        "id": row["id"],
        "filename": row["filename"],
        "file_type": row["file_type"],
        "file_size": row.get("file_size"),
        "chunk_count": row.get("chunk_count", 0),
        "status": row.get("status", "processing"),
        "source_url": row.get("source_url"),
        "created_at": _iso_to_ms(row.get("created_at")),
    }


# ═══════════════════════════════════════════════════════════════
#  CHAT ↔ DOCUMENT LINKING
# ═══════════════════════════════════════════════════════════════

def link_document_to_chat(chat_id: str, doc_id: str, filename: str) -> None:
    """Link a document to a chat for per-chat document scoping."""
    sb = get_supabase()
    try:
        sb.table("chat_documents").upsert(
            {
                "id": str(uuid.uuid4()),
                "chat_id": chat_id,
                "doc_id": doc_id,
                "filename": filename,
            },
            on_conflict="chat_id,doc_id",
        ).execute()
        logger.info("Linked doc %s to chat %s", doc_id, chat_id)
    except Exception as exc:
        logger.warning("Failed to link doc to chat: %s", exc)


def get_chat_doc_ids(chat_id: str) -> list[str]:
    """Get all document IDs linked to a chat."""
    sb = get_supabase()
    try:
        result = (
            sb.table("chat_documents")
            .select("doc_id")
            .eq("chat_id", chat_id)
            .execute()
        )
        return [row["doc_id"] for row in result.data]
    except Exception as exc:
        logger.warning("Failed to get chat doc IDs: %s", exc)
        return []


def get_chat_doc_names(chat_id: str) -> list[str]:
    """Get all document filenames linked to a chat."""
    sb = get_supabase()
    try:
        result = (
            sb.table("chat_documents")
            .select("filename")
            .eq("chat_id", chat_id)
            .execute()
        )
        return [row["filename"] for row in result.data]
    except Exception as exc:
        logger.warning("Failed to get chat doc names: %s", exc)
        return []


# ═══════════════════════════════════════════════════════════════
#  API KEYS
# ═══════════════════════════════════════════════════════════════

def save_api_key(user_id: str, provider: str, plain_key: str) -> None:
    sb = get_supabase()
    encrypted = encrypt_key(plain_key)
    # Upsert (on conflict user_id+provider)
    sb.table("api_keys").upsert(
        {
            "user_id": user_id,
            "provider": provider,
            "encrypted_key": encrypted,
            "updated_at": datetime.now(timezone.utc).isoformat(),
        },
        on_conflict="user_id,provider",
    ).execute()


def get_api_key(user_id: str, provider: str) -> str | None:
    sb = get_supabase()
    result = (
        sb.table("api_keys")
        .select("encrypted_key")
        .eq("user_id", user_id)
        .eq("provider", provider)
        .execute()
    )
    if not result.data:
        return None
    return decrypt_key(result.data[0]["encrypted_key"])


def delete_api_key(user_id: str, provider: str) -> bool:
    sb = get_supabase()
    result = (
        sb.table("api_keys")
        .delete()
        .eq("user_id", user_id)
        .eq("provider", provider)
        .execute()
    )
    return bool(result.data)


def get_api_key_status(user_id: str) -> dict[str, bool]:
    sb = get_supabase()
    result = (
        sb.table("api_keys")
        .select("provider")
        .eq("user_id", user_id)
        .execute()
    )
    providers = {row["provider"] for row in result.data}
    return {
        "groq": "groq" in providers,
        "gemini": "gemini" in providers,
        "claude": "claude" in providers,
        "openai": "openai" in providers,
    }


def get_api_key_status_with_defaults(user_id: str | None) -> dict[str, dict[str, bool]]:
    """
    Provider key status for the settings UI.

    Groq is marked configured when the user saved a custom key OR the server
  default Groq key is available.
    """
    from backend.config import settings

    custom = get_api_key_status(user_id) if user_id else {
        "groq": False,
        "gemini": False,
        "claude": False,
        "openai": False,
    }
    groq_default = bool(settings.groq_api_key)

    return {
        "groq": {
            "configured": custom["groq"] or groq_default,
            "custom": custom["groq"],
            "default_available": groq_default,
        },
        "gemini": {"configured": custom["gemini"], "custom": custom["gemini"], "default_available": False},
        "claude": {"configured": custom["claude"], "custom": custom["claude"], "default_available": False},
        "openai": {"configured": custom["openai"], "custom": custom["openai"], "default_available": False},
    }


# ═══════════════════════════════════════════════════════════════
#  FEEDBACK
# ═══════════════════════════════════════════════════════════════

def create_feedback(
    user_id: str | None,
    chat_id: str | None,
    message_id: str | None,
    rating: str,
    comment: str | None = None,
) -> dict[str, Any]:
    sb = get_supabase()
    row: dict[str, Any] = {
        "id": str(uuid.uuid4()),
        "rating": rating,
        "comment": comment,
    }
    if user_id:
        row["user_id"] = user_id
    if chat_id:
        row["chat_id"] = chat_id
    if message_id:
        row["message_id"] = message_id
    result = sb.table("feedback").insert(row).execute()
    return result.data[0]
