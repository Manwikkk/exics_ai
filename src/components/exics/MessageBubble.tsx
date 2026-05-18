import { useState } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  extractMarkdownText,
  normalizeAssistantMarkdown,
} from "@/lib/exics/markdown";
import {
  FileText,
  Image as ImageIcon,
  ExternalLink,
  Copy,
  ThumbsUp,
  ThumbsDown,
  RotateCcw,
  Loader2,
} from "lucide-react";
import type { ChatMessage } from "@/lib/exics/types";
import { cn } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { toast } from "sonner";

function formatShortDate(ts: number) {
  return new Date(ts).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function formatFullDate(ts: number) {
  return new Date(ts).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

const TOAST_SHORT = { duration: 2000 } as const;

async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast.success("Copied to clipboard", TOAST_SHORT);
  } catch {
    toast.error("Could not copy", TOAST_SHORT);
  }
}

const markdownComponents: Components = {
  pre({ children }) {
    const text = extractMarkdownText(children).trim();
    if (!text) return null;
    return <pre className="exics-code-block">{children}</pre>;
  },
  code({ className, children, ...props }) {
    const inline = !className;
    if (inline) {
      return (
        <code className="exics-inline-code" {...props}>
          {children}
        </code>
      );
    }
    return (
      <code className={className} {...props}>
        {children}
      </code>
    );
  },
};

export function MessageBubble({
  message,
  onRetry,
}: {
  message: ChatMessage;
  onRetry?: (messageId: string) => void;
}) {
  const isUser = message.role === "user";
  const isStatus = message.meta?.type === "status";
  const webCitations = message.citations?.filter((c) => c.url) ?? [];
  const [liked, setLiked] = useState<"up" | "down" | null>(null);
  const [hovered, setHovered] = useState(false);

  if (isStatus) {
    return (
      <div className="w-full flex justify-start pl-1">
        <div className="inline-flex items-center gap-2 text-sm text-muted-foreground py-1">
          {message.meta?.loading && (
            <Loader2 size={14} className="animate-spin shrink-0" />
          )}
          <span>{message.content}</span>
        </div>
      </div>
    );
  }

  return (
    <TooltipProvider delayDuration={300}>
      <div
        className={cn("w-full flex group/msg", isUser ? "justify-end" : "justify-start")}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      >
        <div
          className={cn(
            "max-w-full md:max-w-[88%]",
            isUser ? "ml-10" : "mr-10",
          )}
        >
          {message.attachments && message.attachments.length > 0 && (
            <div
              className={cn(
                "mb-2 flex flex-wrap gap-2",
                isUser ? "justify-end" : "justify-start",
              )}
            >
              {message.attachments.map((a) => (
                <div
                  key={a.id}
                  className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-secondary text-xs text-foreground"
                >
                  {a.type.startsWith("image/") ? (
                    <ImageIcon size={12} />
                  ) : (
                    <FileText size={12} />
                  )}
                  <span className="truncate max-w-[180px]">{a.name}</span>
                </div>
              ))}
            </div>
          )}

          {isUser ? (
            <>
              <div className="inline-block px-4 py-2.5 rounded-2xl bg-secondary text-foreground text-[15px] leading-7 whitespace-pre-wrap">
                {message.content}
              </div>
              <div
                className={cn(
                  "flex items-center justify-end gap-2 mt-1.5 min-h-[22px] transition-opacity duration-150",
                  hovered ? "opacity-100" : "opacity-0 pointer-events-none",
                )}
              >
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="text-[11px] text-muted-foreground cursor-default tabular-nums">
                      {formatShortDate(message.createdAt)}
                    </span>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="text-xs">
                    {formatFullDate(message.createdAt)}
                  </TooltipContent>
                </Tooltip>
                <IconBtn
                  label="Copy"
                  onClick={() => copyText(message.content)}
                >
                  <Copy size={14} />
                </IconBtn>
              </div>
            </>
          ) : (
            <>
              <div className="exics-prose">
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  components={markdownComponents}
                >
                  {normalizeAssistantMarkdown(message.content || "")}
                </ReactMarkdown>
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
                            className="exics-web-source-link inline-flex items-start gap-1.5 text-muted-foreground transition-colors group"
                          >
                            <span className="exics-web-source-index shrink-0 mt-px">
                              [{i + 1}]
                            </span>
                            <span className="exics-web-source-title">
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
              {message.content && (
                <div
                  className={cn(
                    "flex items-center gap-0.5 mt-2 transition-opacity duration-150",
                    hovered ? "opacity-100" : "opacity-0 pointer-events-none",
                  )}
                >
                  <IconBtn
                    label="Copy"
                    onClick={() => copyText(message.content)}
                  >
                    <Copy size={14} />
                  </IconBtn>
                  <IconBtn
                    label="Good response"
                    active={liked === "up"}
                    onClick={() => setLiked((v) => (v === "up" ? null : "up"))}
                  >
                    <ThumbsUp
                      size={14}
                      fill={liked === "up" ? "currentColor" : "none"}
                      className={cn(
                        "transition-all duration-200",
                        liked === "up" ? "scale-110 text-foreground" : "text-muted-foreground",
                      )}
                    />
                  </IconBtn>
                  <IconBtn
                    label="Bad response"
                    active={liked === "down"}
                    onClick={() => setLiked((v) => (v === "down" ? null : "down"))}
                  >
                    <ThumbsDown
                      size={14}
                      fill={liked === "down" ? "currentColor" : "none"}
                      className={cn(
                        "transition-all duration-200",
                        liked === "down" ? "scale-110 text-foreground" : "text-muted-foreground",
                      )}
                    />
                  </IconBtn>
                  {onRetry && (
                    <IconBtn
                      label="Retry"
                      onClick={() => onRetry(message.id)}
                    >
                      <RotateCcw size={14} />
                    </IconBtn>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </TooltipProvider>
  );
}

function IconBtn({
  children,
  label,
  onClick,
  active,
}: {
  children: React.ReactNode;
  label: string;
  onClick: () => void;
  active?: boolean;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={onClick}
      className={cn(
        "h-7 w-7 inline-flex items-center justify-center rounded-md text-muted-foreground",
        "hover:text-foreground hover:bg-accent/80 transition-colors",
        active && "text-foreground bg-accent",
      )}
    >
      {children}
    </button>
  );
}

export function TypingIndicator({ label = "Thinking…" }: { label?: string }) {
  return (
    <div className="flex items-center gap-1.5 text-muted-foreground text-sm pl-1">
      <Loader2 size={14} className="animate-spin shrink-0" />
      <span>{label}</span>
    </div>
  );
}
