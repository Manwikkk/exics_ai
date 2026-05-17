/**
 * Thin API client for the Exics backend.
 *
 * All calls go to the FastAPI server and include the Supabase auth
 * token when the user is logged in.
 */

import type { Attachment, ChatMessage, Citation, ProviderId, ProviderKeyStatus } from "./types";

const API_BASE = import.meta.env.VITE_API_URL ?? "http://localhost:8000/api/v1";

// ── Token management ─────────────────────────────────────────
let _authToken: string | null = null;

export function setAuthToken(token: string | null) {
  _authToken = token;
}

function headers(extra: Record<string, string> = {}): Record<string, string> {
  const h: Record<string, string> = { ...extra };
  if (_authToken) h["Authorization"] = `Bearer ${_authToken}`;
  return h;
}

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = await res.text();
    try {
      const parsed = JSON.parse(body);
      const detail = parsed?.detail;
      if (typeof detail === "string") throw new Error(detail);
      if (Array.isArray(detail)) {
        throw new Error(detail.map((d: { msg?: string }) => d.msg).filter(Boolean).join("; "));
      }
    } catch (e) {
      if (e instanceof Error && e.message !== body) throw e;
    }
    throw new Error(body || `HTTP ${res.status}`);
  }
  return res.json();
}

// ── Query (SSE streaming) ────────────────────────────────────
export interface QueryParams {
  query: string;
  provider: ProviderId;
  chat_id?: string | null;
  incognito: boolean;
  web_search: boolean;
  attachments?: Attachment[];
  doc_ids?: string[];
  doc_names?: string[];
  chat_history?: Pick<ChatMessage, "role" | "content">[];
  provider_api_key?: string;
  groq_use_server_default?: boolean;
}

export interface StreamCallbacks {
  onToken: (content: string) => void;
  onCitations: (citations: Citation[]) => void;
  onChatId: (chatId: string) => void;
  onTitle: (chatId: string, title: string) => void;
  onError: (error: string) => void;
  onDone: () => void;
}

export async function queryStream(
  params: QueryParams,
  callbacks: StreamCallbacks,
  signal?: AbortSignal,
) {
  const res = await fetch(`${API_BASE}/query`, {
    method: "POST",
    headers: headers({ "Content-Type": "application/json" }),
    body: JSON.stringify(params),
    signal,
  });

  if (!res.ok) {
    const text = await res.text();
    try {
      const parsed = JSON.parse(text);
      const detail = parsed?.detail;
      if (typeof detail === "string") {
        callbacks.onError(detail);
        return;
      }
    } catch {
      // fall through
    }
    callbacks.onError(text || `HTTP ${res.status}`);
    return;
  }

  const reader = res.body?.getReader();
  if (!reader) {
    callbacks.onError("No response body");
    return;
  }

  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      let currentEvent = "";
      for (const line of lines) {
        if (line.startsWith("event: ")) {
          currentEvent = line.slice(7).trim();
        } else if (line.startsWith("data: ")) {
          const data = line.slice(6);
          try {
            const parsed = JSON.parse(data);
            switch (currentEvent) {
              case "token":
                callbacks.onToken(parsed.content ?? "");
                break;
              case "citations":
                callbacks.onCitations(parsed as Citation[]);
                break;
              case "chat_id":
                callbacks.onChatId(parsed.chat_id ?? "");
                break;
              case "title":
                if (parsed.chat_id && parsed.title) {
                  callbacks.onTitle(parsed.chat_id, parsed.title);
                }
                break;
              case "error":
                callbacks.onError(parsed.error ?? "Unknown error");
                break;
              case "done":
                callbacks.onDone();
                break;
            }
          } catch {
            // ignore malformed JSON
          }
          currentEvent = "";
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

// ── Chats ────────────────────────────────────────────────────
export async function getChats() {
  const res = await fetch(`${API_BASE}/chats`, { headers: headers() });
  return json<any[]>(res);
}

export async function createChat(title: string, model: ProviderId) {
  const res = await fetch(`${API_BASE}/chats`, {
    method: "POST",
    headers: headers({ "Content-Type": "application/json" }),
    body: JSON.stringify({ title, model }),
  });
  return json<any>(res);
}

export async function getChatMessages(chatId: string) {
  const res = await fetch(`${API_BASE}/chats/${chatId}/messages`, {
    headers: headers(),
  });
  return json<any[]>(res);
}

export async function renameChat(chatId: string, title: string) {
  const res = await fetch(`${API_BASE}/chats/${chatId}`, {
    method: "PATCH",
    headers: headers({ "Content-Type": "application/json" }),
    body: JSON.stringify({ title }),
  });
  return json<any>(res);
}

export async function deleteChat(chatId: string) {
  await fetch(`${API_BASE}/chats/${chatId}`, {
    method: "DELETE",
    headers: headers(),
  });
}

export async function searchChats(query: string) {
  const res = await fetch(
    `${API_BASE}/chats/search?q=${encodeURIComponent(query)}`,
    { headers: headers() },
  );
  return json<any[]>(res);
}

// ── API Keys ─────────────────────────────────────────────────
export async function saveApiKey(provider: ProviderId, key: string) {
  const res = await fetch(`${API_BASE}/api-keys`, {
    method: "POST",
    headers: headers({ "Content-Type": "application/json" }),
    body: JSON.stringify({ provider, key }),
  });
  return json<any>(res);
}

export async function updateApiKey(provider: string, key: string) {
  const res = await fetch(`${API_BASE}/api-keys/${provider}`, {
    method: "PATCH",
    headers: headers({ "Content-Type": "application/json" }),
    body: JSON.stringify({ key }),
  });
  return json<any>(res);
}

export async function deleteApiKey(provider: string) {
  await fetch(`${API_BASE}/api-keys/${provider}`, {
    method: "DELETE",
    headers: headers(),
  });
}

export async function getApiKeyStatus() {
  const res = await fetch(`${API_BASE}/api-keys/status`, {
    headers: headers(),
  });
  return json<Record<string, boolean>>(res);
}

export async function getProviderStatus() {
  const res = await fetch(`${API_BASE}/providers/status`, {
    headers: headers(),
  });
  return json<Record<ProviderId, ProviderKeyStatus>>(res);
}

// ── Feedback ─────────────────────────────────────────────────
export async function submitFeedback(data: {
  chat_id?: string;
  message_id?: string;
  rating: "up" | "down";
  comment?: string;
}) {
  const res = await fetch(`${API_BASE}/feedback`, {
    method: "POST",
    headers: headers({ "Content-Type": "application/json" }),
    body: JSON.stringify(data),
  });
  return json<any>(res);
}

// ── Export ────────────────────────────────────────────────────
export async function exportPdf(chatId: string): Promise<Blob> {
  const res = await fetch(`${API_BASE}/export/pdf`, {
    method: "POST",
    headers: headers({ "Content-Type": "application/json" }),
    body: JSON.stringify({ chat_id: chatId }),
  });
  if (!res.ok) throw new Error(`Export failed: ${res.status}`);
  return res.blob();
}

// ── Ingest ───────────────────────────────────────────────────
export async function ingestFiles(files: File[], chatId?: string | null): Promise<{ documents: any[]; doc_ids: string[] }> {
  const form = new FormData();
  files.forEach((f) => form.append("files", f));
  if (chatId) {
    form.append("chat_id", chatId);
  }
  const res = await fetch(`${API_BASE}/ingest`, {
    method: "POST",
    headers: headers(),
    body: form,
  });
  return json<{ documents: any[]; doc_ids: string[] }>(res);
}

export async function ingestUrls(urls: string[]) {
  const res = await fetch(`${API_BASE}/ingest/urls`, {
    method: "POST",
    headers: headers({ "Content-Type": "application/json" }),
    body: JSON.stringify({ urls }),
  });
  return json<any>(res);
}

export async function getDocuments() {
  const res = await fetch(`${API_BASE}/documents`, { headers: headers() });
  return json<any[]>(res);
}
