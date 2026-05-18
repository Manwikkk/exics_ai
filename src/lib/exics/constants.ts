import type { ProviderId } from "./types";

/** Default model IDs per provider (overridable in Settings). */
export const DEFAULT_PROVIDER_MODELS: Record<ProviderId, string> = {
  groq: "llama-3.3-70b-versatile",
  gemini: "gemini-2.0-flash",
  claude: "claude-sonnet-4-20250514",
  openai: "gpt-4o-mini",
};

export const AI_DISCLAIMER =
  "Exics is AI and can make mistakes. Verify important information before you rely on it.";
