import { useEffect, useRef } from "react";
import { Logo } from "./Logo";
import { MessageBubble, TypingIndicator } from "./MessageBubble";
import type { Chat } from "@/lib/exics/types";
import { Ghost, Download, PanelLeftOpen, FileText } from "lucide-react";
import { useExics } from "@/lib/exics/store";
import { exportChatToPdf } from "@/lib/exics/export-pdf";
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
  children: React.ReactNode; // input bar
}

export function ChatArea({ chat, generating, sidebarOpen, onOpenSidebar, children }: Props) {
  const { incognito } = useExics();
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [chat?.messages.length, generating]);

  const empty = !chat || chat.messages.length === 0;

  return (
    <div className="flex-1 flex flex-col h-full min-w-0 bg-background">
      {/* Top bar */}
      <div className="h-14 shrink-0 flex items-center px-3 md:px-5 border-b border-border/60">
        {!sidebarOpen && (
          <button
            onClick={onOpenSidebar}
            className="md:hidden h-8 w-8 mr-1 inline-flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
            aria-label="Open sidebar"
          >
            <PanelLeftOpen size={16} />
          </button>
        )}
        <div className="flex items-center gap-2 min-w-0">
          {incognito && (
            <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground border border-border rounded-md px-2 py-1">
              <Ghost size={12} /> Incognito
            </span>
          )}
          {chat && !incognito && (
            <span className="text-sm text-muted-foreground truncate">{chat.title}</span>
          )}
          {chat?.docNames && chat.docNames.length > 0 && (
            <span
              className="inline-flex items-center gap-1 text-xs text-muted-foreground border border-border rounded-md px-2 py-0.5 max-w-[220px] truncate"
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
        {chat && chat.messages.length > 0 && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                className="h-8 px-2.5 inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground hover:bg-accent rounded-md transition-colors"
                aria-label="Chat options"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/></svg>
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

      {/* Body */}
      {empty ? (
        <div className="flex-1 flex flex-col items-center justify-center px-4">
          <div className="w-full max-w-2xl flex flex-col items-center">
            <Logo size={28} className="mb-5 text-foreground/80" />
            <h1 className="font-serif text-3xl md:text-4xl font-medium tracking-tight text-center text-foreground/90">
              {incognito ? "Incognito chat" : greeting()}
            </h1>
            {incognito && (
              <p className="mt-3 text-sm text-muted-foreground text-center max-w-md">
                Messages in this conversation won't be saved to your history.
              </p>
            )}
            <div className="w-full mt-10">{children}</div>
          </div>
        </div>
      ) : (
        <>
          <div ref={scrollRef} className="flex-1 overflow-y-auto">
            <div className="max-w-3xl mx-auto w-full px-4 md:px-8 py-8 space-y-6">
              {chat!.messages.map((m) => (
                <MessageBubble key={m.id} message={m} />
              ))}
              {generating && (
                <div className="pl-1">
                  <TypingIndicator />
                </div>
              )}
            </div>
          </div>
          <div className="shrink-0 px-4 md:px-8 pb-5 pt-2">
            <div className="max-w-3xl mx-auto w-full">{children}</div>
          </div>
        </>
      )}
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
