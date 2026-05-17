"""
Qdrant vector store wrapper.

Supports document-scoped retrieval via doc_ids filtering,
enabling per-chat document context isolation.
"""

from __future__ import annotations

import logging
import uuid
from typing import Any, Sequence

from qdrant_client import QdrantClient, models

from backend.config import settings
from backend.services.embeddings import embed_text, embed_batch

logger = logging.getLogger("exics.qdrant")

_client: QdrantClient | None = None


def _ensure_payload_indexes(client: QdrantClient) -> None:
    """
    Qdrant Cloud requires keyword indexes on filtered payload fields.
    Without these, doc-scoped search raises 400 and the RAG pipeline falls
    back to unrelated global / web results.
    """
    for field_name in ("doc_id", "source"):
        try:
            client.create_payload_index(
                collection_name=settings.qdrant_collection,
                field_name=field_name,
                field_schema=models.PayloadSchemaType.KEYWORD,
            )
            logger.info("Created payload index on '%s'", field_name)
        except Exception as exc:
            # Already exists or unsupported — safe to continue
            if "already exists" not in str(exc).lower():
                logger.debug("Payload index '%s': %s", field_name, exc)


async def init_qdrant():
    """Connect to Qdrant and ensure the collection exists."""
    global _client
    _client = QdrantClient(
        url=settings.qdrant_url,
        api_key=settings.qdrant_api_key or None,
        timeout=30,
    )
    collections = [c.name for c in _client.get_collections().collections]
    if settings.qdrant_collection not in collections:
        _client.create_collection(
            collection_name=settings.qdrant_collection,
            vectors_config=models.VectorParams(
                size=settings.embedding_dim,
                distance=models.Distance.COSINE,
            ),
        )
        logger.info("Created Qdrant collection '%s'", settings.qdrant_collection)
    else:
        logger.info("Qdrant collection '%s' already exists", settings.qdrant_collection)

    _ensure_payload_indexes(_client)


def get_qdrant() -> QdrantClient:
    if _client is None:
        raise RuntimeError("Qdrant not initialised — call init_qdrant() first")
    return _client


def upsert_chunks(
    chunks: Sequence[dict[str, Any]],
) -> int:
    """
    Insert document chunks into Qdrant.

    Each chunk dict must contain:
      - ``text``: str
      - ``metadata``: dict  (source, title, page, doc_id, etc.)

    Returns the number of points upserted.
    """
    client = get_qdrant()
    texts = [c["text"] for c in chunks]
    vectors = embed_batch(texts)

    points = [
        models.PointStruct(
            id=str(uuid.uuid4()),
            vector=vec,
            payload={
                "text": chunk["text"],
                **chunk.get("metadata", {}),
            },
        )
        for chunk, vec in zip(chunks, vectors)
    ]

    client.upsert(
        collection_name=settings.qdrant_collection,
        points=points,
    )
    logger.info("Upserted %d chunks into Qdrant", len(points))
    return len(points)


def search_chunks(
    query: str,
    top_k: int | None = None,
    *,
    doc_ids: list[str] | None = None,
) -> list[dict[str, Any]]:
    """
    Search Qdrant for chunks relevant to *query*.

    If *doc_ids* is provided, restricts search to chunks belonging
    to those documents (per-chat document scoping).

    Returns list of dicts with ``text``, ``score``, and metadata fields.
    """
    client = get_qdrant()
    k = top_k or settings.retrieval_top_k
    query_vec = embed_text(query)

    # Build filter for document scoping
    search_filter = None
    if doc_ids:
        search_filter = models.Filter(
            must=[
                models.FieldCondition(
                    key="doc_id",
                    match=models.MatchAny(any=doc_ids),
                )
            ]
        )

    results = client.search(
        collection_name=settings.qdrant_collection,
        query_vector=query_vec,
        query_filter=search_filter,
        limit=k,
        with_payload=True,
    )

    out: list[dict[str, Any]] = []
    for hit in results:
        payload = hit.payload or {}
        out.append(
            {
                "text": payload.get("text", ""),
                "score": hit.score,
                "source": payload.get("source", ""),
                "title": payload.get("title", ""),
                "page": payload.get("page"),
                "chunk_index": payload.get("chunk_index"),
                "doc_id": payload.get("doc_id", ""),
            }
        )
    return out


def delete_by_source(source: str) -> None:
    """Delete all chunks whose ``source`` metadata matches."""
    client = get_qdrant()
    client.delete(
        collection_name=settings.qdrant_collection,
        points_selector=models.FilterSelector(
            filter=models.Filter(
                must=[
                    models.FieldCondition(
                        key="source",
                        match=models.MatchValue(value=source),
                    )
                ]
            )
        ),
    )
    logger.info("Deleted chunks with source='%s'", source)


def delete_by_doc_id(doc_id: str) -> None:
    """Delete all chunks belonging to a specific document."""
    client = get_qdrant()
    client.delete(
        collection_name=settings.qdrant_collection,
        points_selector=models.FilterSelector(
            filter=models.Filter(
                must=[
                    models.FieldCondition(
                        key="doc_id",
                        match=models.MatchValue(value=doc_id),
                    )
                ]
            )
        ),
    )
    logger.info("Deleted chunks with doc_id='%s'", doc_id)
