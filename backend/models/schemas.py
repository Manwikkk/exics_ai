"""
Pydantic request / response schemas.

These mirror the frontend ``types.ts`` exactly so the JSON
shapes match what the UI expects.
"""

from __future__ import annotations

from enum import Enum
from typing import Optional

from pydantic import BaseModel, Field


# ── Enums ─────────────────────────────────────────────────────
class ProviderId(str, Enum):
    groq = "groq"
    gemini = "gemini"
    claude = "claude"
    openai = "openai"


class MessageRole(str, Enum):
    user = "user"
    assistant = "assistant"


# ── Shared sub-models ─────────────────────────────────────────
class AttachmentSchema(BaseModel):
    id: str
    name: str
    type: str
    size: int


class CitationSchema(BaseModel):
    id: str
    title: str
    url: Optional[str] = None
    snippet: Optional[str] = None


# ── Query ─────────────────────────────────────────────────────
class ChatHistoryMessage(BaseModel):
    role: MessageRole
    content: str


class QueryRequest(BaseModel):
    query: str = Field(..., min_length=1, max_length=12000)
    provider: ProviderId = ProviderId.groq
    chat_id: Optional[str] = None
    incognito: bool = False
    web_search: bool = False
    attachments: list[AttachmentSchema] = []
    doc_ids: list[str] = []  # Active document IDs for this chat
    doc_names: list[str] = []  # Filenames for active docs (from client state)
    chat_history: list[ChatHistoryMessage] = []  # Client-side history for follow-ups
    # Browser-stored key for the active provider (guests + fallback when DB has no key)
    provider_api_key: Optional[str] = Field(None, max_length=512)
    # When false, do not use the server GROQ_API_KEY (user removed built-in Groq key)
    groq_use_server_default: bool = True
    # Optional model override (e.g. gpt-4o, claude-opus-4-20250514)
    model_name: Optional[str] = Field(None, max_length=128)


# ── Chats ─────────────────────────────────────────────────────
class ChatCreate(BaseModel):
    title: str = "New chat"
    model: ProviderId = ProviderId.groq


class ChatRename(BaseModel):
    title: str = Field(..., min_length=1, max_length=200)


class ChatOut(BaseModel):
    id: str
    title: str
    model: str
    created_at: float  # epoch ms — matches frontend
    updated_at: float


class MessageOut(BaseModel):
    id: str
    role: MessageRole
    content: str
    created_at: float
    attachments: list[AttachmentSchema] = []
    citations: list[CitationSchema] = []
    model: Optional[str] = None


# ── API Keys ──────────────────────────────────────────────────
class ApiKeyAdd(BaseModel):
    provider: ProviderId
    key: str = Field(..., min_length=1)


class ApiKeyUpdate(BaseModel):
    key: str = Field(..., min_length=1)


class ApiKeyStatusOut(BaseModel):
    groq: bool = False
    gemini: bool = False
    claude: bool = False
    openai: bool = False


# ── Feedback ──────────────────────────────────────────────────
class FeedbackCreate(BaseModel):
    chat_id: Optional[str] = None
    message_id: Optional[str] = None
    rating: str = Field(..., pattern="^(up|down)$")
    comment: Optional[str] = None


# ── Ingest ────────────────────────────────────────────────────
class IngestURLRequest(BaseModel):
    urls: list[str] = Field(..., min_length=1)


class DocumentOut(BaseModel):
    id: str
    filename: str
    file_type: str
    file_size: Optional[int] = None
    chunk_count: int = 0
    status: str = "processing"
    source_url: Optional[str] = None
    created_at: float


# ── Export ────────────────────────────────────────────────────
class ExportPdfRequest(BaseModel):
    chat_id: str
