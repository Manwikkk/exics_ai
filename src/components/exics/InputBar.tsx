import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { ArrowUp, Globe, Mic, Paperclip, Square, X, FileText, Image as ImageIcon } from "lucide-react";
import { ModelSelector } from "./ModelSelector";
import { useExics } from "@/lib/exics/store";
import type { Attachment } from "@/lib/exics/types";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface Props {
  onSend: (text: string, attachments: Attachment[], files: File[]) => void;
  onOpenSettings: () => void;
  generating: boolean;
  uploading?: boolean;
  onStop: () => void;
}

export type InputBarHandle = {
  addFiles: (files: File[]) => void;
};

interface SpeechRecognitionLike {
  start: () => void;
  stop: () => void;
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((e: any) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: any) => void) | null;
}

export const InputBar = forwardRef<InputBarHandle, Props>(function InputBar(
  { onSend, onOpenSettings, generating, uploading = false, onStop },
  ref,
) {
  const { webSearchEnabled, toggleWebSearch, incognito } = useExics();
  const [text, setText] = useState("");
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [listening, setListening] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const fileMapRef = useRef<Map<string, File>>(new Map());

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "0px";
    el.style.height = Math.min(el.scrollHeight, 220) + "px";
  }, [text]);

  function fileKey(f: File) {
    return `${f.name}\0${f.size}\0${f.lastModified}`;
  }

  function handleFiles(files: FileList | null) {
    if (!files) return;
    const list: Attachment[] = [];
    const existing = new Set(
      [...fileMapRef.current.values()].map(fileKey),
    );
    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      const key = fileKey(f);
      if (existing.has(key)) continue;
      existing.add(key);
      const id = Math.random().toString(36).slice(2);
      list.push({
        id,
        name: f.name,
        type: f.type || "application/octet-stream",
        size: f.size,
      });
      fileMapRef.current.set(id, f);
    }
    if (list.length === 0) return;
    setAttachments((p) => [...p, ...list]);
  }

  useImperativeHandle(ref, () => ({
    addFiles: (files: File[]) => {
      if (!files.length) return;
      const dt = new DataTransfer();
      for (const f of files) dt.items.add(f);
      handleFiles(dt.files);
    },
  }));

  function startDictation() {
    const SR: any =
      (typeof window !== "undefined" &&
        ((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition)) ||
      null;
    if (!SR) {
      toast.error("Voice dictation isn't supported in this browser.");
      return;
    }
    const rec: SpeechRecognitionLike = new SR();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = "en-US";
    let baseline = text;
    rec.onresult = (e: any) => {
      let interim = "";
      let finalText = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const t = e.results[i][0].transcript;
        if (e.results[i].isFinal) finalText += t;
        else interim += t;
      }
      if (finalText) baseline = (baseline ? baseline + " " : "") + finalText.trim();
      setText((baseline + (interim ? " " + interim : "")).trim());
    };
    rec.onend = () => setListening(false);
    rec.onerror = () => setListening(false);
    rec.start();
    recognitionRef.current = rec;
    setListening(true);
  }

  function stopDictation() {
    recognitionRef.current?.stop();
    setListening(false);
  }

  function submit() {
    const trimmed = text.trim();
    if (!trimmed && attachments.length === 0) return;
    if (generating || uploading) return;
    const files: File[] = [];
    for (const a of attachments) {
      const f = fileMapRef.current.get(a.id);
      if (f) files.push(f);
    }
    onSend(trimmed, attachments, files);
    setText("");
    setAttachments([]);
    fileMapRef.current.clear();
  }

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        e.stopPropagation();
        setDragOver(false);
        handleFiles(e.dataTransfer.files);
      }}
      className={cn(
        "w-full rounded-2xl border bg-card transition-[border-color,box-shadow,background-color] duration-200",
        incognito ? "border-dashed border-border/90" : "border-border",
        dragOver && "border-foreground/30 bg-accent/40",
        webSearchEnabled && "ring-1 ring-primary/25",
        listening && "ring-1 ring-primary/20",
      )}
    >
      {attachments.length > 0 && (
        <div className="px-3 pt-3 flex flex-wrap gap-2">
          {attachments.map((a) => {
            const isImg = a.type.startsWith("image/");
            return (
              <div
                key={a.id}
                className="group flex items-center gap-2 pl-2 pr-1 py-1 rounded-md bg-secondary text-xs text-foreground"
              >
                {isImg ? <ImageIcon size={13} /> : <FileText size={13} />}
                <span className="max-w-[180px] truncate">{a.name}</span>
                <button
                  onClick={() => setAttachments((p) => p.filter((x) => x.id !== a.id))}
                  className="h-5 w-5 inline-flex items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-accent"
                  aria-label="Remove attachment"
                >
                  <X size={12} />
                </button>
              </div>
            );
          })}
        </div>
      )}

      <div className="px-3 pt-3">
        <textarea
          ref={textareaRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
          placeholder={
            incognito
              ? "How can I help you today?"
              : "Attach a technical document and ask about it…"
          }
          rows={1}
          className="w-full bg-transparent resize-none outline-none text-[15px] text-foreground placeholder:text-muted-foreground leading-6 max-h-[220px]"
        />
      </div>

      <div className="flex items-center gap-1 px-2 pb-2 pt-1">
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept="image/*,.pdf,.doc,.docx,.txt,.md"
          className="hidden"
          onChange={(e) => {
            handleFiles(e.target.files);
            e.target.value = "";
          }}
        />
        <ToolButton label="Attach files" onClick={() => fileInputRef.current?.click()}>
          <Paperclip size={16} />
        </ToolButton>
        <ToolButton
          label={webSearchEnabled ? "Web Search: on" : "Web Search: off"}
          active={webSearchEnabled}
          onClick={toggleWebSearch}
        >
          <Globe size={16} />
          <span className="hidden sm:inline ml-1 text-xs">Web Search</span>
        </ToolButton>
        <ToolButton
          label={listening ? "Stop dictation" : "Voice dictation"}
          active={listening}
          onClick={listening ? stopDictation : startDictation}
        >
          <Mic size={16} />
          {listening && <span className="hidden sm:inline ml-1 text-xs">Listening…</span>}
        </ToolButton>

        <div className="flex-1" />

        <ModelSelector onNeedsKey={onOpenSettings} />

        {generating ? (
          <button
            onClick={onStop}
            className="h-8 w-8 inline-flex items-center justify-center rounded-md bg-foreground text-background hover:opacity-90 transition-opacity"
            aria-label="Stop"
          >
            <Square size={13} fill="currentColor" />
          </button>
        ) : (
          <button
            onClick={submit}
            disabled={uploading || (!text.trim() && attachments.length === 0)}
            className="h-8 w-8 inline-flex items-center justify-center rounded-md bg-foreground text-background disabled:opacity-30 disabled:cursor-not-allowed hover:opacity-90 transition-opacity"
            aria-label="Send"
          >
            <ArrowUp size={16} />
          </button>
        )}
      </div>
    </div>
  );
});

function ToolButton({
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
      onClick={onClick}
      title={label}
      aria-label={label}
      aria-pressed={active}
      className={cn(
        "inline-flex items-center h-8 px-2 rounded-md transition-all duration-200",
        active
          ? "text-foreground bg-primary/15 ring-1 ring-primary/30 shadow-[inset_0_0_0_1px_hsl(var(--primary)/0.15)]"
          : "text-muted-foreground hover:text-foreground hover:bg-accent/70",
      )}
    >
      {children}
    </button>
  );
}
