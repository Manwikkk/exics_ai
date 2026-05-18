import type { ReactNode } from "react";

/** Normalize common LLM markdown quirks before rendering. */
export function normalizeAssistantMarkdown(content: string): string {
  let s = content.replace(/\r\n/g, "\n");

  // Literal "\n" sequences instead of real newlines
  if (s.includes("\\n")) {
    s = s.replace(/\\n/g, "\n");
  }

  // Unwrap a single outer fenced block (model sometimes wraps entire answer)
  const outerFence = s.match(/^```(?:\w+)?\n([\s\S]*)\n```\s*$/);
  if (outerFence) {
    s = outerFence[1];
  }

  // Fix list items followed by raw fence markers on the same line
  s = s.replace(
    /^(\s*[-*]\s+.+?)\s+\\?`{3}(\w*)\s*$/gm,
    "$1\n\n```$2\n",
  );

  // Ensure fenced blocks have a newline after opening fence
  s = s.replace(/```(\w*)\s*(?!\n)/g, "```$1\n");

  return s.trimEnd();
}

export function extractMarkdownText(node: ReactNode): string {
  if (node == null || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(extractMarkdownText).join("");
  if (typeof node === "object" && "props" in node) {
    const props = (node as { props?: { children?: ReactNode } }).props;
    return extractMarkdownText(props?.children);
  }
  return "";
}
