import { useEffect, useRef } from "react";
import { Logo } from "./Logo";
import { MessageBubble, TypingIndicator } from "./MessageBubble";
import type { Chat } from "@/lib/exics/types";
import { Ghost, Download, PanelLeftOpen, FileText, X } from "lucide-react";
import { useExics } from "@/lib/exics/store";
import { exportChatToPdf } from "@/lib/exics/export-pdf";
import { AI_DISCLAIMER } from "@/lib/exics/constants";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";

interface Props {
  chat: Chat | null;
  generating: boolean;
  sidebarOpen: boolean;
  onOpenSidebar: () => void;
  onNewChat: () => void;
  onRegenerate: (assistantMessageId: string) => void;
  showDisclaimer: boolean;
  children: React.ReactNode;
}

export function ChatArea({
  chat,
  generating,
  sidebarOpen,
  onOpenSidebar,
  onNewChat,
  onRegenerate,
  showDisclaimer,
  children,
}: Props) {
  const { incognito, toggleIncognito } = useExics();
  const scrollRef = useRef<HTMLDivElement>(null);

  const normalMessages = chat?.messages.filter((m) => !m.meta?.type) ?? [];
  const empty = normalMessages.length === 0;
  const hasWebSearchStatus =
    generating &&
    !!chat?.messages.some(
      (m) => m.meta?.type === "status" && m.meta?.statusKind === "web_search" && m.meta?.loading,
    );

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [chat?.messages.length, generating]);

  return (
    <div className="flex-1 flex flex-col h-full min-w-0 bg-background">
      <div className="h-14 shrink-0 flex items-center px-3 md:px-5 border-b border-border/60 gap-2">
        {!sidebarOpen && (
          <button
            onClick={onOpenSidebar}
            className="h-8 w-8 inline-flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors shrink-0"
            aria-label="Open sidebar"
          >
            <PanelLeftOpen size={16} />
          </button>
        )}
        <div className="flex items-center gap-2 min-w-0 flex-1">
          {incognito && (
            <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground border border-border rounded-md px-2 py-1 shrink-0">
              <Ghost size={12} /> Incognito
            </span>
          )}
          {chat && !incognito && (
            <span className="text-sm text-muted-foreground truncate">{chat.title}</span>
          )}
          {chat?.docNames && chat.docNames.length > 0 && (
            <span
              className="inline-flex items-center gap-1 text-xs text-muted-foreground border border-border rounded-md px-2 py-0.5 max-w-[220px] truncate shrink-0"
              title={chat.docNames.join(", ")}
            >
              <FileText size={12} className="shrink-0" />
              {chat.docNames.length === 1
                ? chat.docNames[0]
                : `${chat.docNames.length} documents`}
            </span>
          )}
        </div>
        <div className="flex-1" />
        {chat && normalMessages.length > 0 && !incognito && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                className="h-8 px-2.5 inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground hover:bg-accent rounded-md transition-colors"
                aria-label="Chat options"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                  <circle cx="5" cy="12" r="1.6" />
                  <circle cx="12" cy="12" r="1.6" />
                  <circle cx="19" cy="12" r="1.6" />
                </svg>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuItem onClick={() => exportChatToPdf(chat)}>
                <Download size={14} className="mr-2" /> Export to PDF
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      {empty ? (
        <div className="flex-1 flex flex-col items-center justify-center px-4 overflow-y-auto">
          {incognito ? (
            <IncognitoEmpty onExit={toggleIncognito}>{children}</IncognitoEmpty>
          ) : (
            <div className="w-full max-w-2xl flex flex-col items-center">
              <Logo size={44} className="mb-6 text-foreground/85" />
              <h1 className="font-serif text-3xl md:text-4xl font-medium tracking-tight text-center text-foreground/90">
                {greeting()}
              </h1>
              <div className="w-full mt-10">{children}</div>
            </div>
          )}
        </div>
      ) : (
        <>
          <div ref={scrollRef} className="flex-1 overflow-y-auto">
            <div className="max-w-3xl mx-auto w-full px-4 md:px-8 py-8 space-y-6">
              {chat!.messages.map((m) => (
                <MessageBubble
                  key={m.id}
                  message={m}
                  onRetry={
                    m.role === "assistant" && !m.meta?.type ? onRegenerate : undefined
                  }
                />
              ))}
              {generating && !hasWebSearchStatus && (
                <div className="pl-1">
                  <TypingIndicator />
                </div>
              )}
            </div>
          </div>
          <div className="shrink-0 px-4 md:px-8 pb-2 pt-2">
            <div className="max-w-3xl mx-auto w-full">{children}</div>
            {showDisclaimer && (
              <p className="max-w-3xl mx-auto w-full text-center text-[10px] text-muted-foreground/80 mt-3 px-2 leading-relaxed">
                {AI_DISCLAIMER}
              </p>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function IncognitoEmpty({
  children,
  onExit,
}: {
  children: React.ReactNode;
  onExit: () => void;
}) {
  return (
    <div className="w-full max-w-2xl flex flex-col items-center">
      <div className="w-full rounded-2xl border border-border/80 bg-card/30 overflow-hidden shadow-sm">
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-border/60 bg-muted/30">
          <span className="inline-flex items-center gap-2 text-xs text-muted-foreground">
            <Ghost size={14} />
            Incognito chat
          </span>
          <button
            type="button"
            onClick={onExit}
            className="h-7 w-7 inline-flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
            aria-label="Exit incognito"
          >
            <X size={14} />
          </button>
        </div>
        <div className="px-6 pt-12 pb-6 flex flex-col items-center">
          <div className="flex items-center gap-3 mb-4">
            <Logo size={32} className="text-foreground/90 shrink-0" />
            <h1 className="font-serif text-3xl md:text-4xl font-medium tracking-tight text-foreground/95">
              You&apos;re incognito
            </h1>
          </div>
          <div className="w-full mt-8 [&_textarea]:min-h-[52px]">
            {children}
          </div>
          <p className="mt-6 text-xs text-muted-foreground text-center max-w-md leading-relaxed">
            Incognito chats aren&apos;t saved to history or used to train models.
          </p>
        </div>
      </div>
    </div>
  );
}

function greeting() {
  const h = new Date().getHours();
  if (h < 5) return "Working late?";
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}
