export type ProviderId = "groq" | "gemini" | "claude" | "openai";

export interface ModelInfo {
  id: ProviderId;
  name: string;
  description: string;
  badge?: string;
}

export const MODELS: ModelInfo[] = [
  { id: "groq", name: "Groq", description: "Fast inference, free tier", badge: "Default" },
  { id: "gemini", name: "Google Gemini", description: "Fast and cheap inference" },
  { id: "claude", name: "Anthropic", description: "Use any Claude model from your API" },
  { id: "openai", name: "OpenAI", description: "Use any OpenAI model from your API" },
];

export interface Attachment {
  id: string;
  name: string;
  type: string;
  size: number;
}

export interface Citation {
  id: string;
  title: string;
  url?: string;
  snippet?: string;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: number;
  attachments?: Attachment[];
  citations?: Citation[];
  model?: ProviderId;
}

export interface Chat {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  messages: ChatMessage[];
  model: ProviderId;
  docIds?: string[];       // Document IDs uploaded in this chat
  docNames?: string[];     // Human-readable filenames
}

export interface User {
  id: string;
  name: string;
  email: string;
  avatarUrl?: string;
}

export interface ApiKeys {
  groq?: string;
  gemini?: string;
  claude?: string;
  openai?: string;
}

export interface ProviderKeyStatus {
  configured: boolean;
  custom: boolean;
  default_available: boolean;
}
