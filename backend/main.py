"""
Exics FastAPI backend — application entry point.
"""

from __future__ import annotations

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from backend.config import settings
from backend.services.supabase_client import init_supabase
from backend.services.vector_store import init_qdrant
from backend.services.embeddings import init_embeddings

logger = logging.getLogger("exics")


# ── Lifespan ──────────────────────────────────────────────────
@asynccontextmanager
async def lifespan(_app: FastAPI):
    """Startup / shutdown hooks."""
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s  %(levelname)-8s  %(name)s  %(message)s",
    )
    logger.info("Starting Exics backend …")

    # Initialise shared singletons
    init_supabase()
    init_embeddings()
    await init_qdrant()

    logger.info("Exics backend ready ✓")
    yield
    logger.info("Shutting down Exics backend")


# ── App ───────────────────────────────────────────────────────
app = FastAPI(
    title="Exics API",
    description="Backend for the Exics AI technical documentation assistant",
    version="1.0.0",
    lifespan=lifespan,
)

# CORS — allow the frontend dev server
app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.frontend_url, "http://localhost:5173", "http://localhost:3000", "http://localhost:8080"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Health ────────────────────────────────────────────────────
@app.get("/health", tags=["Health"])
async def health():
    from backend.config import settings

    return {
        "status": "ok",
        "web_search": {
            "tavily_configured": bool(settings.tavily_api_key),
            "serper_configured": bool(settings.serper_api_key),
        },
    }


# ── Register routers ─────────────────────────────────────────
from backend.api.auth import router as auth_router  # noqa: E402
from backend.api.query import router as query_router  # noqa: E402
from backend.api.chats import router as chats_router  # noqa: E402
from backend.api.ingest import router as ingest_router  # noqa: E402
from backend.api.feedback import router as feedback_router  # noqa: E402
from backend.api.export import router as export_router  # noqa: E402
from backend.api.api_keys import router as api_keys_router  # noqa: E402

app.include_router(auth_router, prefix="/api/v1", tags=["Auth"])
app.include_router(query_router, prefix="/api/v1", tags=["Query"])
app.include_router(chats_router, prefix="/api/v1", tags=["Chats"])
app.include_router(ingest_router, prefix="/api/v1", tags=["Ingest"])
app.include_router(feedback_router, prefix="/api/v1", tags=["Feedback"])
app.include_router(export_router, prefix="/api/v1", tags=["Export"])
app.include_router(api_keys_router, prefix="/api/v1", tags=["API Keys"])
