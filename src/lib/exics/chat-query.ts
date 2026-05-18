import { queryStream } from "./api";
import type { Attachment, ChatMessage, Citation, ProviderId } from "./types";
import { resolveClientApiKey } from "./provider-keys";
import { useExics } from "./store";

export interface RunQueryOptions {
  chatId: string;
  queryText: string;
  assistantId: string;
  chatHistory: Pick<ChatMessage, "role" | "content">[];
  attachments?: Attachment[];
  docIds?: string[];
  docNames?: string[];
  signal?: AbortSignal;
  onToken: (content: string) => void;
  onCitations: (citations: Citation[]) => void;
  onChatId: (id: string) => void;
  onTitle: (chatId: string, title: string) => void;
  onError: (error: string) => void;
  onDone: () => void;
}

export function runChatQuery(opts: RunQueryOptions) {
  const s = useExics.getState();
  return queryStream(
    {
      query: opts.queryText,
      provider: s.selectedModel,
      model_name: s.getProviderModel(s.selectedModel),
      chat_id: opts.chatId,
      incognito: s.incognito,
      web_search: s.webSearchEnabled,
      attachments: opts.attachments,
      doc_ids: opts.docIds,
      doc_names: opts.docNames,
      chat_history: opts.chatHistory.length > 0 ? opts.chatHistory : undefined,
      provider_api_key: resolveClientApiKey(s.selectedModel, s.apiKeys),
      groq_use_server_default:
        !s.groqDefaultDisabled && !s.apiKeys.groq?.trim(),
    },
    {
      onToken: opts.onToken,
      onCitations: opts.onCitations,
      onChatId: opts.onChatId,
      onTitle: opts.onTitle,
      onError: opts.onError,
      onDone: opts.onDone,
    },
    opts.signal,
  );
}
