"""
Document ingestion pipeline.

Handles PDF, text, markdown, HTML, images (OCR), and URLs.
Splits text into chunks and indexes them in Qdrant.
"""

from __future__ import annotations

import io
import logging
import uuid
from pathlib import Path
from typing import Any

import httpx
from langchain_text_splitters import RecursiveCharacterTextSplitter

from backend.config import settings
from backend.services.vector_store import upsert_chunks

logger = logging.getLogger("exics.ingestion")


# ── Text splitter (shared) ───────────────────────────────────
_splitter = RecursiveCharacterTextSplitter(
    chunk_size=settings.chunk_size,
    chunk_overlap=settings.chunk_overlap,
    separators=["\n\n", "\n", ". ", " ", ""],
    length_function=len,
)


# ── Extractors ───────────────────────────────────────────────
def _extract_pdf_pymupdf(content: bytes, filename: str) -> list[dict[str, Any]]:
    """Extract text using PyMuPDF (best quality for most PDFs)."""
    import fitz  # pymupdf

    pages: list[dict[str, Any]] = []
    with fitz.open(stream=content, filetype="pdf") as doc:
        for i, page in enumerate(doc):
            text = page.get_text("text") or ""
            if text.strip():
                pages.append({"text": text, "page": i + 1})
    return pages


def _extract_pdf_pypdf2(content: bytes, filename: str) -> list[dict[str, Any]]:
    """Fallback PDF extraction via PyPDF2."""
    from PyPDF2 import PdfReader

    reader = PdfReader(io.BytesIO(content))
    pages: list[dict[str, Any]] = []
    for i, page in enumerate(reader.pages):
        text = page.extract_text() or ""
        if text.strip():
            pages.append({"text": text, "page": i + 1})
    return pages


def _extract_pdf(content: bytes, filename: str) -> list[dict[str, Any]]:
    """Extract text from a PDF — PyMuPDF first, PyPDF2 fallback."""
    try:
        pages = _extract_pdf_pymupdf(content, filename)
        if pages:
            return pages
    except Exception as exc:
        logger.warning("PyMuPDF extraction failed for %s: %s", filename, exc)

    try:
        return _extract_pdf_pypdf2(content, filename)
    except Exception as exc:
        logger.error("PDF extraction failed for %s: %s", filename, exc)
        return []


def _extract_docx(content: bytes, filename: str) -> list[dict[str, Any]]:
    """Extract text from Word .docx files."""
    from docx import Document

    doc = Document(io.BytesIO(content))
    paragraphs = [p.text.strip() for p in doc.paragraphs if p.text.strip()]
    if paragraphs:
        return [{"text": "\n\n".join(paragraphs), "page": None}]
    return []


def _extract_image(content: bytes, filename: str) -> list[dict[str, Any]]:
    """Extract text from an image via OCR (if tesseract is available)."""
    try:
        from PIL import Image
        import pytesseract

        img = Image.open(io.BytesIO(content))
        text = pytesseract.image_to_string(img)
        if text.strip():
            return [{"text": text, "page": None}]
    except Exception as exc:
        logger.warning("OCR failed for %s: %s", filename, exc)
    return [{"text": f"[Image: {filename} — OCR unavailable]", "page": None}]


def _extract_html(content: bytes, filename: str) -> list[dict[str, Any]]:
    """Extract text from HTML."""
    from bs4 import BeautifulSoup

    soup = BeautifulSoup(content, "html.parser")
    # Remove script/style tags
    for tag in soup(["script", "style", "nav", "footer", "header"]):
        tag.decompose()
    text = soup.get_text(separator="\n", strip=True)
    if text.strip():
        return [{"text": text, "page": None}]
    return []


def _extract_text(content: bytes, filename: str) -> list[dict[str, Any]]:
    """Plain text / markdown — just decode."""
    text = content.decode("utf-8", errors="replace")
    if text.strip():
        return [{"text": text, "page": None}]
    return []


_EXTRACTOR_MAP: dict[str, Any] = {
    "application/pdf": _extract_pdf,
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": _extract_docx,
    "text/plain": _extract_text,
    "text/markdown": _extract_text,
    "text/html": _extract_html,
    "image/png": _extract_image,
    "image/jpeg": _extract_image,
    "image/webp": _extract_image,
    "image/gif": _extract_image,
}


def _guess_extractor(content_type: str, filename: str):
    """Pick an extractor based on content type or file extension."""
    ext = Path(filename).suffix.lower()
    if content_type in _EXTRACTOR_MAP:
        return _EXTRACTOR_MAP[content_type]
    if ext == ".pdf":
        return _extract_pdf
    if ext == ".docx":
        return _extract_docx
    if ext in (".md", ".txt", ".rst"):
        return _extract_text
    if ext in (".html", ".htm"):
        return _extract_html
    if ext in (".png", ".jpg", ".jpeg", ".webp", ".gif"):
        return _extract_image
    # Fallback to plain-text
    return _extract_text


# ── Main ingestion ───────────────────────────────────────────
def ingest_file(
    content: bytes,
    filename: str,
    content_type: str,
    *,
    source: str | None = None,
    user_id: str | None = None,
) -> dict[str, Any]:
    """
    Process a single file → extract text → chunk → embed → upsert to Qdrant.

    Returns metadata dict: {doc_id, filename, chunk_count, status}.
    """
    doc_id = str(uuid.uuid4())
    source_name = source or filename

    extractor = _guess_extractor(content_type, filename)
    pages = extractor(content, filename)

    if not pages:
        logger.warning("No text extracted from %s", filename)
        return {
            "doc_id": doc_id,
            "filename": filename,
            "chunk_count": 0,
            "status": "empty",
        }

    # Flatten page texts into one string, then chunk
    all_text = "\n\n".join(p["text"] for p in pages)
    raw_chunks = _splitter.split_text(all_text)

    chunks = [
        {
            "text": chunk_text,
            "metadata": {
                "source": source_name,
                "title": filename,
                "doc_id": doc_id,
                "chunk_index": idx,
                "page": _find_page(pages, chunk_text),
            },
        }
        for idx, chunk_text in enumerate(raw_chunks)
    ]

    count = upsert_chunks(chunks)
    logger.info("Ingested %s → %d chunks", filename, count)

    return {
        "doc_id": doc_id,
        "filename": filename,
        "chunk_count": count,
        "status": "indexed",
    }


async def ingest_url(url: str) -> dict[str, Any]:
    """Fetch a URL, extract its text, and ingest it."""
    async with httpx.AsyncClient(timeout=30, follow_redirects=True) as client:
        resp = await client.get(url)
        resp.raise_for_status()

    content_type = resp.headers.get("content-type", "text/html").split(";")[0].strip()
    filename = url.rsplit("/", 1)[-1] or "page.html"

    return ingest_file(
        resp.content,
        filename,
        content_type,
        source=url,
    )


def _find_page(pages: list[dict[str, Any]], chunk_text: str) -> int | None:
    """Heuristic: find which page the chunk most likely came from."""
    for p in pages:
        if chunk_text[:80] in p["text"]:
            return p.get("page")
    return None
