import jsPDF from "jspdf";
import type { Chat } from "./types";

export function exportChatToPdf(chat: Chat) {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 48;
  const maxWidth = pageWidth - margin * 2;
  let y = margin;

  function ensureSpace(h: number) {
    if (y + h > pageHeight - margin) {
      doc.addPage();
      y = margin;
    }
  }

  function writeLine(text: string, options?: { size?: number; bold?: boolean; color?: [number, number, number]; mono?: boolean; indent?: number }) {
    const size = options?.size ?? 11;
    doc.setFont(options?.mono ? "courier" : "helvetica", options?.bold ? "bold" : "normal");
    doc.setFontSize(size);
    const color = options?.color ?? [30, 30, 30];
    doc.setTextColor(color[0], color[1], color[2]);
    const indent = options?.indent ?? 0;
    const lines = doc.splitTextToSize(text, maxWidth - indent) as string[];
    const lineHeight = size * 1.35;
    lines.forEach((ln) => {
      ensureSpace(lineHeight);
      doc.text(ln, margin + indent, y);
      y += lineHeight;
    });
  }

  function blank(h = 6) {
    y += h;
  }

  // Header
  writeLine("Exics", { size: 16, bold: true });
  writeLine(chat.title, { size: 13, bold: true });
  writeLine(new Date(chat.updatedAt).toLocaleString(), { size: 9, color: [120, 120, 120] });
  blank(10);
  doc.setDrawColor(220);
  doc.line(margin, y, pageWidth - margin, y);
  blank(14);

  chat.messages.forEach((m) => {
    writeLine(m.role === "user" ? "You" : "Assistant", {
      size: 9,
      bold: true,
      color: m.role === "user" ? [120, 120, 120] : [80, 80, 80],
    });
    blank(2);

    // Very lightweight markdown rendering: code blocks, headings, bullets
    const segments = splitMarkdown(m.content || "");
    segments.forEach((seg) => {
      if (seg.type === "code") {
        // background box
        const lines = doc.splitTextToSize(seg.text, maxWidth - 16) as string[];
        const blockH = lines.length * 11 * 1.35 + 12;
        ensureSpace(blockH);
        doc.setFillColor(244, 244, 244);
        doc.roundedRect(margin, y - 2, maxWidth, blockH, 4, 4, "F");
        doc.setFont("courier", "normal");
        doc.setFontSize(10);
        doc.setTextColor(40, 40, 40);
        lines.forEach((ln, i) => {
          doc.text(ln, margin + 8, y + 10 + i * 10 * 1.35);
        });
        y += blockH + 4;
      } else if (seg.type === "heading") {
        writeLine(seg.text, { size: 12, bold: true });
      } else if (seg.type === "bullet") {
        writeLine("• " + seg.text, { size: 11, indent: 4 });
      } else {
        writeLine(seg.text, { size: 11 });
      }
      blank(2);
    });

    if (m.citations && m.citations.length) {
      blank(2);
      writeLine("Sources", { size: 9, bold: true, color: [120, 120, 120] });
      m.citations.forEach((c, i) => {
        writeLine(`[${i + 1}] ${c.title}${c.url ? "  —  " + c.url : ""}`, {
          size: 9,
          color: [100, 100, 100],
          indent: 4,
        });
      });
    }

    blank(10);
    doc.setDrawColor(235);
    doc.line(margin, y, pageWidth - margin, y);
    blank(10);
  });

  doc.save(`${(chat.title || "chat").replace(/[^a-z0-9-_\s]/gi, "_").slice(0, 60)}.pdf`);
}

type Segment =
  | { type: "code"; text: string }
  | { type: "heading"; text: string }
  | { type: "bullet"; text: string }
  | { type: "para"; text: string };

function splitMarkdown(md: string): Segment[] {
  const out: Segment[] = [];
  const lines = md.split(/\r?\n/);
  let i = 0;
  let para: string[] = [];
  const flushPara = () => {
    if (para.length) {
      out.push({ type: "para", text: para.join(" ") });
      para = [];
    }
  };
  while (i < lines.length) {
    const ln = lines[i];
    if (/^```/.test(ln)) {
      flushPara();
      const buf: string[] = [];
      i++;
      while (i < lines.length && !/^```/.test(lines[i])) {
        buf.push(lines[i]);
        i++;
      }
      out.push({ type: "code", text: buf.join("\n") });
      i++;
      continue;
    }
    if (/^#{1,6}\s+/.test(ln)) {
      flushPara();
      out.push({ type: "heading", text: ln.replace(/^#{1,6}\s+/, "") });
      i++;
      continue;
    }
    if (/^\s*[-*]\s+/.test(ln)) {
      flushPara();
      out.push({ type: "bullet", text: ln.replace(/^\s*[-*]\s+/, "") });
      i++;
      continue;
    }
    if (ln.trim() === "") {
      flushPara();
      i++;
      continue;
    }
    para.push(ln);
    i++;
  }
  flushPara();
  return out;
}
