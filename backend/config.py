"""
Application configuration loaded from environment variables.
"""

from __future__ import annotations

from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

# Resolve the backend/.env path relative to this file
_ENV_PATH = Path(__file__).resolve().parent / ".env"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=str(_ENV_PATH),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # ── Supabase ──────────────────────────────────────────────
    supabase_url: str
    supabase_service_key: str
    supabase_jwt_secret: str

    # ── Qdrant ────────────────────────────────────────────────
    qdrant_url: str = "http://localhost:6333"
    qdrant_api_key: str = ""

    # ── Default Groq key (guest mode + internal grading calls) ─
    groq_api_key: str

    # ── Web search (optional) ────────────────────────────────
    tavily_api_key: str = ""
    serper_api_key: str = ""

    # ── Encryption ────────────────────────────────────────────
    encryption_key: str

    # ── CORS ──────────────────────────────────────────────────
    frontend_url: str = "http://localhost:5173"

    # ── RAG defaults ──────────────────────────────────────────
    chunk_size: int = 1000
    chunk_overlap: int = 200
    retrieval_top_k: int = 8
    max_retries: int = 2

    # ── Qdrant collection ─────────────────────────────────────
    qdrant_collection: str = "exics_documents"
    embedding_dim: int = 384


settings = Settings()  # type: ignore[call-arg]
