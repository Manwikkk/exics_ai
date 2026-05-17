import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Sidebar } from "@/components/exics/Sidebar";
import { ChatArea } from "@/components/exics/ChatArea";
import { InputBar } from "@/components/exics/InputBar";
import { SettingsDialog } from "@/components/exics/SettingsDialog";
import { AuthDialog } from "@/components/exics/AuthDialog";
import { useExics, getActiveChat, findChatById, newId } from "@/lib/exics/store";
import { queryStream, ingestFiles } from "@/lib/exics/api";
import {
  API_KEY_MESSAGES,
  hasAnyProviderKey,
  hasProviderKey,
  providerDisplayName,
  resolveClientApiKey,
} from "@/lib/exics/provider-keys";
import type { Attachment, ChatMessage, Citation } from "@/lib/exics/types";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

export const Route = createFileRoute("/")({
  component: ExicsApp,
});

function ExicsApp() {
  const [mounted, setMounted] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [isMobile, setIsMobile] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [authOpen, setAuthOpen] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [uploading, setUploading] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const state = useExics();
  const chat = getActiveChat(state);

  useEffect(() => {
    setMounted(true);
    const mq = window.matchMedia("(max-width: 768px)");
    const update = () => {
      setIsMobile(mq.matches);
      if (mq.matches) setSidebarOpen(false);
    };
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  // Restore Supabase session and provider key status on mount
  useEffect(() => {
    state.restoreSession();
    state.refreshProviderStatus();
  }, []);

  // Cleanup on unmount
  useEffect(() => () => {
    if (abortRef.current) abortRef.current.abort();
  }, []);

  async function handleSend(text: string, attachments: Attachment[], files: File[]) {
    const live = useExics.getState();
    const keyCtx = {
      apiKeys: live.apiKeys,
      groqDefaultDisabled: live.groqDefaultDisabled,
      providerStatus: live.providerStatus,
    };
    if (!hasAnyProviderKey(keyCtx)) {
      toast.error(API_KEY_MESSAGES.noneConfigured);
      setSettingsOpen(true);
      return;
    }
    if (!hasProviderKey(live.selectedModel, keyCtx)) {
      toast.error(API_KEY_MESSAGES.providerRequired(providerDisplayName(live.selectedModel)));
      setSettingsOpen(true);
      return;
    }

    // Get or create a chat FIRST, so we have a chatId for ingestion
    let chatId = state.activeChatId;
    const active = getActiveChat(state);
    if (!active) {
      chatId = state.newChat();
    }
    if (!chatId) return;

    const queryText =
      text.trim() ||
      (files.length > 0
        ? "Summarize the uploaded document(s) and answer based only on their content."
        : "");

    if (!queryText) return;

    // Get the current chat's existing doc_ids (for follow-up queries)
    const currentState = useExics.getState();
    const currentChat = getActiveChat(currentState);
    let docIds = currentChat?.docIds || [];
    let docNames = currentChat?.docNames || [];

    // Auto-ingest attached files into Qdrant BEFORE querying
    if (files.length > 0) {
      setUploading(true);
      try {
        toast.info(`Indexing ${files.length} file(s)… this may take a minute on first run.`);
        const ingestResult = await ingestFiles(files, chatId);

        const newDocIds = ingestResult.doc_ids || [];
        const newDocNames = files.map((f) => f.name);
        const failed = (ingestResult.documents || []).filter(
          (d: { status?: string }) => d.status === "error" || d.status === "empty",
        );

        if (newDocIds.length === 0) {
          const reason =
            failed[0]?.error ||
            "No text could be extracted. Use a PDF with selectable text (not a scan-only image).";
          toast.error(`Indexing failed: ${reason}`);
          setUploading(false);
          return;
        }

        state.addDocIds(chatId, newDocIds, newDocNames);
        docIds = [...docIds, ...newDocIds.filter((d) => !docIds.includes(d))];
        docNames = [...docNames, ...newDocNames.filter((n) => !docNames.includes(n))];
        toast.success(`Indexed ${newDocIds.length} document(s) — ready to answer.`);
      } catch (err: any) {
        toast.error(`File upload failed: ${err.message}`);
        setUploading(false);
        return;
      } finally {
        setUploading(false);
      }
    }

    // Prior messages for follow-up context (before this turn)
    const chatHistory = (currentChat?.messages || [])
      .slice(-10)
      .map((m) => ({ role: m.role, content: m.content }))
      .filter((m) => m.content.trim());

    // Add user message
    const userMsg: ChatMessage = {
      id: newId(),
      role: "user",
      content: queryText,
      attachments: attachments.length ? attachments : undefined,
      createdAt: Date.now(),
    };
    state.appendMessage(chatId, userMsg);

    // Add placeholder assistant message
    const assistantId = newId();
    state.appendMessage(chatId, {
      id: assistantId,
      role: "assistant",
      content: "",
      createdAt: Date.now(),
      model: state.selectedModel,
    });

    setGenerating(true);
    if (state.webSearchEnabled) {
      toast.info("Web search on — fetching from Tavily & Google…");
    }
    const controller = new AbortController();
    abortRef.current = controller;

    const currentChatId = chatId;

    // Re-read document scope from THIS chat only (never another chat's PDFs)
    const scoped = findChatById(useExics.getState(), currentChatId);
    const scopedDocIds = scoped?.docIds ?? [];
    const scopedDocNames = scoped?.docNames ?? [];

    const sendState = useExics.getState();
    queryStream(
      {
        query: queryText,
        provider: sendState.selectedModel,
        chat_id: currentChatId,
        incognito: sendState.incognito,
        web_search: sendState.webSearchEnabled,
        attachments: attachments.length ? attachments : undefined,
        doc_ids: scopedDocIds.length > 0 ? scopedDocIds : undefined,
        doc_names: scopedDocNames.length > 0 ? scopedDocNames : undefined,
        chat_history: chatHistory.length > 0 ? chatHistory : undefined,
        provider_api_key: resolveClientApiKey(sendState.selectedModel, sendState.apiKeys),
        groq_use_server_default:
          !sendState.groqDefaultDisabled && !sendState.apiKeys.groq?.trim(),
      },
      {
        onToken: (content) => {
          const s = useExics.getState();
          const activeChat = getActiveChat(s);
          if (!activeChat) return;
          const msg = activeChat.messages.find((m) => m.id === assistantId);
          const currentContent = msg?.content ?? "";
          state.updateMessage(currentChatId, assistantId, {
            content: currentContent + content,
          });
        },
        onCitations: (citations: Citation[]) => {
          state.updateMessage(currentChatId, assistantId, { citations });
        },
        onChatId: (serverChatId: string) => {
          if (serverChatId && serverChatId !== currentChatId) {
            state.migrateChatId(currentChatId, serverChatId);
          }
        },
        onTitle: (id, title) => {
          state.renameChat(id, title);
        },
        onError: (error) => {
          state.updateMessage(currentChatId, assistantId, { content: error });
          toast.error(error);
          setGenerating(false);
          abortRef.current = null;
        },
        onDone: () => {
          setGenerating(false);
          abortRef.current = null;
        },
      },
      controller.signal,
    ).catch((err) => {
      if (err.name !== "AbortError") {
        toast.error("Connection error. Please try again.");
      }
      setGenerating(false);
      abortRef.current = null;
    });
  }

  function handleStop() {
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
    setGenerating(false);
  }

  if (!mounted) {
    // Avoid SSR/CSR mismatch from persisted state and matchMedia
    return <div className="h-screen w-screen bg-background" />;
  }

  return (
    <div className="dark h-screen w-screen flex bg-background text-foreground overflow-hidden">
      {/* Mobile overlay */}
      {isMobile && sidebarOpen && (
        <div
          onClick={() => setSidebarOpen(false)}
          className="fixed inset-0 z-30 bg-black/40 backdrop-blur-sm transition-opacity"
        />
      )}

      <div
        className={cn(
          isMobile
            ? cn(
                "fixed inset-y-0 left-0 z-40 transition-transform duration-300 ease-out",
                sidebarOpen ? "translate-x-0" : "-translate-x-full"
              )
            : "relative h-full"
        )}
      >
        <Sidebar
          open={sidebarOpen}
          onToggle={() => setSidebarOpen((o) => !o)}
          onOpenSettings={() => setSettingsOpen(true)}
          onOpenAuth={() => setAuthOpen(true)}
        />
      </div>

      <ChatArea
        chat={chat}
        generating={generating}
        sidebarOpen={sidebarOpen}
        onOpenSidebar={() => setSidebarOpen(true)}
      >
        <InputBar
          onSend={handleSend}
          onOpenSettings={() => setSettingsOpen(true)}
          generating={generating}
          uploading={uploading}
          onStop={handleStop}
        />
      </ChatArea>

      <SettingsDialog
        open={settingsOpen}
        onOpenChange={(open) => {
          setSettingsOpen(open);
          if (!open) useExics.getState().refreshProviderStatus();
        }}
      />
      <AuthDialog open={authOpen} onOpenChange={setAuthOpen} />
    </div>
  );
}
