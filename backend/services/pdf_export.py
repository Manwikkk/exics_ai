"""
Server-side PDF export for chat conversations.

Uses fpdf2 for lightweight, dependency-free PDF generation.
"""

from __future__ import annotations

import re
from datetime import datetime, timezone
from typing import Any

from fpdf import FPDF


def export_chat_to_pdf(
    title: str,
    messages: list[dict[str, Any]],
    updated_at: float | None = None,
) -> bytes:
    """
    Generate a polished PDF from a list of chat messages.

    Returns raw PDF bytes.
    """
    pdf = FPDF(unit="pt", format="A4")
    pdf.set_auto_page_break(auto=True, margin=48)
    pdf.add_page()

    page_w = pdf.w
    margin = 48
    max_w = page_w - margin * 2
    y = margin

    # ── Helpers ───────────────────────────────────────────────
    def _set_font(name: str = "Helvetica", style: str = "", size: int = 11):
        pdf.set_font(name, style, size)

    def _write_line(
        text: str,
        *,
        size: int = 11,
        bold: bool = False,
        mono: bool = False,
        color: tuple[int, int, int] = (30, 30, 30),
        indent: int = 0,
    ):
        nonlocal y
        font = "Courier" if mono else "Helvetica"
        style = "B" if bold else ""
        _set_font(font, style, size)
        pdf.set_text_color(*color)
        lines = pdf.multi_cell(
            w=max_w - indent,
            h=size * 1.35,
            text=text,
            split_only=True,
        )
        line_h = size * 1.35
        for ln in lines:
            if y + line_h > pdf.h - margin:
                pdf.add_page()
                y = margin
            pdf.set_xy(margin + indent, y)
            pdf.cell(w=max_w - indent, h=line_h, text=ln)
            y += line_h

    def _blank(h: float = 6):
        nonlocal y
        y += h

    # ── Header ────────────────────────────────────────────────
    _write_line("Exics", size=16, bold=True)
    _write_line(title, size=13, bold=True)
    ts = datetime.fromtimestamp(
        (updated_at or 0) / 1000, tz=timezone.utc
    ).strftime("%Y-%m-%d %H:%M UTC") if updated_at else ""
    if ts:
        _write_line(ts, size=9, color=(120, 120, 120))
    _blank(10)
    pdf.set_draw_color(220, 220, 220)
    pdf.line(margin, y, page_w - margin, y)
    _blank(14)

    # ── Messages ──────────────────────────────────────────────
    for msg in messages:
        role = msg.get("role", "user")
        content = msg.get("content", "")
        citations = msg.get("citations", [])

        label = "You" if role == "user" else "Assistant"
        label_color = (120, 120, 120) if role == "user" else (80, 80, 80)
        _write_line(label, size=9, bold=True, color=label_color)
        _blank(2)

        # Lightweight markdown rendering
        for seg in _split_markdown(content):
            if seg["type"] == "code":
                _write_line(seg["text"], size=10, mono=True, indent=8)
            elif seg["type"] == "heading":
                _write_line(seg["text"], size=12, bold=True)
            elif seg["type"] == "bullet":
                _write_line("• " + seg["text"], size=11, indent=4)
            else:
                _write_line(seg["text"], size=11)
            _blank(2)

        # Citations
        if citations:
            _blank(2)
            _write_line("Sources", size=9, bold=True, color=(120, 120, 120))
            for i, c in enumerate(citations):
                cite_title = c.get("title", "")
                cite_url = c.get("url", "")
                line = f"[{i + 1}] {cite_title}"
                if cite_url:
                    line += f"  —  {cite_url}"
                _write_line(line, size=9, color=(100, 100, 100), indent=4)

        _blank(10)
        pdf.set_draw_color(235, 235, 235)
        pdf.line(margin, y, page_w - margin, y)
        _blank(10)

    return pdf.output()


# ── Markdown splitter ─────────────────────────────────────────
def _split_markdown(md: str) -> list[dict[str, str]]:
    out: list[dict[str, str]] = []
    lines = md.split("\n")
    i = 0
    para: list[str] = []

    def flush():
        if para:
            out.append({"type": "para", "text": " ".join(para)})
            para.clear()

    while i < len(lines):
        ln = lines[i]
        if ln.startswith("```"):
            flush()
            buf: list[str] = []
            i += 1
            while i < len(lines) and not lines[i].startswith("```"):
                buf.append(lines[i])
                i += 1
            out.append({"type": "code", "text": "\n".join(buf)})
            i += 1
            continue
        if re.match(r"^#{1,6}\s+", ln):
            flush()
            out.append({"type": "heading", "text": re.sub(r"^#{1,6}\s+", "", ln)})
            i += 1
            continue
        if re.match(r"^\s*[-*]\s+", ln):
            flush()
            out.append({"type": "bullet", "text": re.sub(r"^\s*[-*]\s+", "", ln)})
            i += 1
            continue
        if ln.strip() == "":
            flush()
            i += 1
            continue
        para.append(ln)
        i += 1

    flush()
    return out
