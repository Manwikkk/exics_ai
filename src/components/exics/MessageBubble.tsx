import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { FileText, Image as ImageIcon, ExternalLink } from "lucide-react";
import type { ChatMessage } from "@/lib/exics/types";
import { cn } from "@/lib/utils";

export function MessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === "user";
  const webCitations = message.citations?.filter((c) => c.url) ?? [];

  return (
    <div className={cn("w-full flex", isUser ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "max-w-full md:max-w-[88%]",
          isUser ? "ml-10" : "mr-10"
        )}
      >
        {message.attachments && message.attachments.length > 0 && (
          <div className={cn("mb-2 flex flex-wrap gap-2", isUser ? "justify-end" : "justify-start")}>
            {message.attachments.map((a) => (
              <div
                key={a.id}
                className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-secondary text-xs text-foreground"
              >
                {a.type.startsWith("image/") ? <ImageIcon size={12} /> : <FileText size={12} />}
                <span className="truncate max-w-[180px]">{a.name}</span>
              </div>
            ))}
          </div>
        )}

        {isUser ? (
          <div className="inline-block px-4 py-2.5 rounded-2xl bg-secondary text-foreground text-[15px] leading-7 whitespace-pre-wrap">
            {message.content}
          </div>
        ) : (
          <div className="exics-prose">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{message.content || ""}</ReactMarkdown>
            {webCitations.length > 0 && (
              <div className="mt-4 pt-3 border-t border-border">
                <div className="text-[11px] uppercase tracking-wider text-muted-foreground mb-2">
                  Web sources
                </div>
                <ul className="space-y-1.5">
                  {webCitations.map((c, i) => (
                    <li key={c.id} className="text-xs">
                      <a
                        href={c.url}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-start gap-1.5 text-muted-foreground hover:text-foreground transition-colors group"
                      >
                        <span className="text-foreground/80 shrink-0 mt-px">[{i + 1}]</span>
                        <span className="underline underline-offset-2 decoration-border group-hover:decoration-foreground/40">
                          {c.title}
                        </span>
                        <ExternalLink size={11} className="mt-0.5 opacity-60" />
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export function TypingIndicator() {
  return (
    <div className="flex items-center gap-1.5 text-muted-foreground text-sm">
      <span className="h-1.5 w-1.5 rounded-full bg-current animate-pulse" />
      <span>Thinking…</span>
    </div>
  );
}
