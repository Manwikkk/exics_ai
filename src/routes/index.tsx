import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { Sidebar } from "@/components/exics/Sidebar";
import { ChatArea } from "@/components/exics/ChatArea";
import { InputBar, type InputBarHandle } from "@/components/exics/InputBar";
import { SettingsDialog } from "@/components/exics/SettingsDialog";
import { AuthDialog } from "@/components/exics/AuthDialog";
import { DragDropOverlay } from "@/components/exics/DragDropOverlay";
import { useExics, getActiveChat, findChatById, newId } from "@/lib/exics/store";
import { ingestFiles } from "@/lib/exics/api";
import { runChatQuery } from "@/lib/exics/chat-query";
import {
  API_KEY_MESSAGES,
  hasAnyProviderKey,
  hasProviderKey,
  providerDisplayName,
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
  const [globalDrag, setGlobalDrag] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const inputBarRef = useRef<InputBarHandle>(null);

  const state = useExics();
  const chat = getActiveChat(state);
  const theme = state.theme;

  const showDisclaimer =
    !!chat &&
    chat.messages.some(
      (m) => m.role === "user" && !m.meta?.type,
    );

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

  useEffect(() => {
    state.restoreSession();
    state.refreshProviderStatus();
  }, []);

  useEffect(() => () => {
    if (abortRef.current) abortRef.current.abort();
  }, []);

  useEffect(() => {
    const endDrag = () => setGlobalDrag(false);
    window.addEventListener("dragend", endDrag);
    window.addEventListener("drop", endDrag);
    return () => {
      window.removeEventListener("dragend", endDrag);
      window.removeEventListener("drop", endDrag);
    };
  }, []);

  useEffect(() => {
    const title =
      chat && chat.messages.some((m) => !m.meta?.type) && !state.incognito
        ? chat.title
        : "Exics";
    document.title = title;
  }, [chat?.title, chat?.messages, state.incognito]);

  const streamAssistant = useCallback(
    (
      chatId: string,
      assistantId: string,
      queryText: string,
      chatHistory: Pick<ChatMessage, "role" | "content">[],
      attachments?: Attachment[],
    ) => {
      const scoped = findChatById(useExics.getState(), chatId);
      const scopedDocIds = scoped?.docIds ?? [];
      const scopedDocNames = scoped?.docNames ?? [];

      setGenerating(true);
      const controller = new AbortController();
      abortRef.current = controller;

      const store = useExics.getState();

      const endStatuses = () => {
        store.clearLoadingStatusMessages(chatId, "web_search");
      };

      return runChatQuery({
        chatId,
        queryText,
        assistantId,
        chatHistory,
        attachments,
        docIds: scopedDocIds.length > 0 ? scopedDocIds : undefined,
        docNames: scopedDocNames.length > 0 ? scopedDocNames : undefined,
        signal: controller.signal,
        onToken: (content) => {
          if (content) endStatuses();
          const s = useExics.getState();
          const activeChat = getActiveChat(s);
          if (!activeChat) return;
          const msg = activeChat.messages.find((m) => m.id === assistantId);
          store.updateMessage(chatId, assistantId, {
            content: (msg?.content ?? "") + content,
          });
        },
        onCitations: (citations: Citation[]) => {
          store.updateMessage(chatId, assistantId, { citations });
        },
        onChatId: (serverChatId) => {
          if (serverChatId && serverChatId !== chatId) {
            store.migrateChatId(chatId, serverChatId);
          }
        },
        onTitle: (id, title) => store.renameChat(id, title),
        onError: (error) => {
          endStatuses();
          store.updateMessage(chatId, assistantId, { content: error });
          toast.error(error);
          setGenerating(false);
          abortRef.current = null;
        },
        onDone: () => {
          endStatuses();
          setGenerating(false);
          abortRef.current = null;
        },
      }).catch((err) => {
        if (err.name !== "AbortError") {
          toast.error("Connection error. Please try again.");
        }
        setGenerating(false);
        abortRef.current = null;
      });
    },
    [],
  );

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

    let chatId = live.activeChatId;
    const active = getActiveChat(live);
    if (!active) {
      chatId = live.newChat();
    }
    if (!chatId) return;

    const queryText =
      text.trim() ||
      (files.length > 0
        ? "Summarize the uploaded document(s) and answer based only on their content."
        : "");

    if (!queryText) return;

    const store = useExics.getState();
    const priorForHistory = (getActiveChat(store)?.messages || [])
      .filter((m) => !m.meta?.type)
      .slice(-10)
      .map((m) => ({ role: m.role, content: m.content }))
      .filter((m) => m.content.trim());

    const userMsg: ChatMessage = {
      id: newId(),
      role: "user",
      content: queryText,
      attachments: attachments.length ? attachments : undefined,
      createdAt: Date.now(),
    };
    store.appendMessage(chatId, userMsg);

    let statusId: string | null = null;

    const uniqueFiles =
      files.length > 0
        ? [
            ...new Map(
              files.map((f) => [`${f.name}\0${f.size}\0${f.lastModified}`, f] as const),
            ).values(),
          ]
        : [];

    if (uniqueFiles.length > 0) {
      statusId = newId();
      store.appendMessage(chatId, {
        id: statusId,
        role: "assistant",
        content: `Indexing ${uniqueFiles.length} file(s)… this may take a minute on first run.`,
        createdAt: Date.now(),
        meta: { type: "status", loading: true, statusKind: "indexing" },
      });
      setUploading(true);
      try {
        const ingestResult = await ingestFiles(uniqueFiles, chatId);
        const newDocIds = ingestResult.doc_ids || [];
        const newDocNames = uniqueFiles.map((f) => f.name);
        const failed = (ingestResult.documents || []).filter(
          (d: { status?: string }) => d.status === "error" || d.status === "empty",
        );

        if (newDocIds.length === 0) {
          const reason =
            failed[0]?.error ||
            "No text could be extracted. Use a PDF with selectable text.";
          if (statusId) {
            store.updateMessage(chatId, statusId, {
              content: `Indexing failed: ${reason}`,
              meta: { type: "status", loading: false },
            });
          }
          setUploading(false);
          return;
        }

        store.addDocIds(chatId, newDocIds, newDocNames);
        if (statusId) {
          store.updateMessage(chatId, statusId, {
            content: `Indexed ${newDocIds.length} document(s) — ready to answer.`,
            meta: { type: "status", loading: false, statusKind: "indexed" },
          });
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Upload failed";
        if (statusId) {
          store.updateMessage(chatId, statusId, {
            content: `File upload failed: ${msg}`,
            meta: { type: "status", loading: false },
          });
        }
        setUploading(false);
        return;
      } finally {
        setUploading(false);
      }
    }

    const assistantId = newId();
    store.appendMessage(chatId, {
      id: assistantId,
      role: "assistant",
      content: "",
      createdAt: Date.now(),
      model: live.selectedModel,
    });

    if (live.webSearchEnabled) {
      const webStatusId = newId();
      store.appendMessage(chatId, {
        id: webStatusId,
        role: "assistant",
        content: "Searching the web using Tavily…",
        createdAt: Date.now(),
        meta: { type: "status", loading: true, statusKind: "web_search" },
      });
    }

    await streamAssistant(
      chatId,
      assistantId,
      queryText,
      priorForHistory,
      attachments.length ? attachments : undefined,
    );
  }

  async function handleRegenerate(assistantId: string) {
    const live = useExics.getState();
    const active = getActiveChat(live);
    if (!active || generating) return;

    const idx = active.messages.findIndex((m) => m.id === assistantId);
    if (idx <= 0) return;
    const userMsg = active.messages[idx - 1];
    if (userMsg.role !== "user" || userMsg.meta?.type) return;

    const keyCtx = {
      apiKeys: live.apiKeys,
      groqDefaultDisabled: live.groqDefaultDisabled,
      providerStatus: live.providerStatus,
    };
    if (!hasProviderKey(live.selectedModel, keyCtx)) {
      toast.error(API_KEY_MESSAGES.providerRequired(providerDisplayName(live.selectedModel)));
      setSettingsOpen(true);
      return;
    }

    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }

    live.updateMessage(active.id, assistantId, {
      content: "",
      citations: undefined,
    });

    const chatHistory = active.messages
      .slice(0, idx - 1)
      .filter((m) => !m.meta?.type)
      .slice(-10)
      .map((m) => ({ role: m.role, content: m.content }))
      .filter((m) => m.content.trim());

    if (live.webSearchEnabled) {
      live.appendMessage(active.id, {
        id: newId(),
        role: "assistant",
        content: "Searching the web using Tavily…",
        createdAt: Date.now(),
        meta: { type: "status", loading: true, statusKind: "web_search" },
      });
    }

    await streamAssistant(
      active.id,
      assistantId,
      userMsg.content,
      chatHistory,
      userMsg.attachments,
    );
  }

  function handleStop() {
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
    setGenerating(false);
  }

  function handleGlobalDragEnter(e: React.DragEvent) {
    e.preventDefault();
    if (e.dataTransfer.types.includes("Files")) setGlobalDrag(true);
  }

  function handleGlobalDragLeave(e: React.DragEvent) {
    e.preventDefault();
    const root = e.currentTarget as HTMLElement;
    if (e.relatedTarget instanceof Node && root.contains(e.relatedTarget)) return;
    setGlobalDrag(false);
  }

  function handleGlobalDrop(e: React.DragEvent) {
    e.preventDefault();
    setGlobalDrag(false);
    if (e.dataTransfer.files?.length) {
      inputBarRef.current?.addFiles(Array.from(e.dataTransfer.files));
    }
  }

  if (!mounted) {
    return <div className="h-screen w-screen bg-background" />;
  }

  return (
    <div
      className={cn(
        "h-screen w-screen flex bg-background text-foreground overflow-hidden",
        theme === "dark" ? "dark" : "light",
      )}
      onDragEnter={handleGlobalDragEnter}
      onDragLeave={handleGlobalDragLeave}
      onDragOver={(e) => e.preventDefault()}
      onDrop={handleGlobalDrop}
    >
      <DragDropOverlay visible={globalDrag} />

      {isMobile && sidebarOpen && (
        <div
          onClick={() => setSidebarOpen(false)}
          className="fixed inset-0 z-30 bg-black/40 backdrop-blur-sm transition-opacity"
        />
      )}

      <div
        className={cn(
          "shrink-0 h-full overflow-hidden transition-[width] duration-300 ease-out",
          isMobile
            ? cn(
                "fixed inset-y-0 left-0 z-40",
                sidebarOpen ? "w-[260px]" : "w-0",
              )
            : sidebarOpen
              ? "w-[260px]"
              : "w-0",
        )}
      >
        <Sidebar
          open={sidebarOpen}
          onToggle={() => setSidebarOpen((o) => !o)}
          onNewChat={() => useExics.getState().newChat()}
          onOpenSettings={() => setSettingsOpen(true)}
          onOpenAuth={() => setAuthOpen(true)}
        />
      </div>

      <ChatArea
        chat={chat}
        generating={generating}
        sidebarOpen={sidebarOpen}
        onOpenSidebar={() => setSidebarOpen(true)}
        onNewChat={() => useExics.getState().newChat()}
        onRegenerate={handleRegenerate}
        showDisclaimer={showDisclaimer}
      >
        <InputBar
          ref={inputBarRef}
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
