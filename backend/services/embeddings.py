"""
Sentence-transformer embedding model (local, free).

Uses ``all-MiniLM-L6-v2`` → 384-dim vectors, ~80 MB download on first run.
"""

from __future__ import annotations

import logging
from typing import Sequence

logger = logging.getLogger("exics.embeddings")

_model = None


def init_embeddings():
    """Load the model into memory once at startup."""
    global _model
    if _model is not None:
        return
    from sentence_transformers import SentenceTransformer

    logger.info("Loading embedding model (all-MiniLM-L6-v2) …")
    _model = SentenceTransformer("all-MiniLM-L6-v2")
    logger.info("Embedding model ready ✓")


def embed_text(text: str) -> list[float]:
    """Embed a single text string → 384-dim vector."""
    if _model is None:
        init_embeddings()
    return _model.encode(text, normalize_embeddings=True).tolist()  # type: ignore[union-attr]


def embed_batch(texts: Sequence[str], batch_size: int = 64) -> list[list[float]]:
    """Embed a batch of texts efficiently."""
    if _model is None:
        init_embeddings()
    embeddings = _model.encode(  # type: ignore[union-attr]
        list(texts),
        normalize_embeddings=True,
        batch_size=batch_size,
        show_progress_bar=False,
    )
    return [e.tolist() for e in embeddings]
