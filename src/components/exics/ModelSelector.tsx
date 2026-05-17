import { Check, ChevronDown, KeyRound } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { useExics } from "@/lib/exics/store";
import { MODELS } from "@/lib/exics/types";
import { API_KEY_MESSAGES, hasProviderKey } from "@/lib/exics/provider-keys";
import { toast } from "sonner";

export function ModelSelector({ onNeedsKey }: { onNeedsKey: () => void }) {
  const {
    selectedModel,
    setSelectedModel,
    apiKeys,
    groqDefaultDisabled,
    providerStatus,
  } = useExics();
  const current = MODELS.find((m) => m.id === selectedModel) ?? MODELS[0];
  const keyCtx = { apiKeys, groqDefaultDisabled, providerStatus };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className="inline-flex items-center gap-1.5 h-8 px-2.5 rounded-md text-xs text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
          aria-label="Select model"
        >
          <span className="font-medium text-foreground/90">{current.name}</span>
          <ChevronDown size={13} />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72">
        <DropdownMenuLabel className="text-[11px] uppercase tracking-wider text-muted-foreground font-normal">
          Model
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {MODELS.map((m) => {
          const configured = hasProviderKey(m.id, keyCtx);
          const selected = m.id === selectedModel;
          return (
            <DropdownMenuItem
              key={m.id}
              onClick={() => {
                if (!configured) {
                  toast.error(API_KEY_MESSAGES.providerRequired(m.name));
                  onNeedsKey();
                  return;
                }
                setSelectedModel(m.id);
              }}
              className="flex items-start gap-2 py-2 cursor-pointer"
            >
              <div className="w-4 mt-0.5 shrink-0 flex items-center justify-center">
                {selected && <Check size={14} />}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="text-sm text-foreground">{m.name}</span>
                  {m.badge && (
                    <span className="text-[10px] uppercase tracking-wide text-muted-foreground border border-border rounded px-1 py-px">
                      {m.badge}
                    </span>
                  )}
                  {!configured && (
                    <KeyRound size={11} className="text-muted-foreground" />
                  )}
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">{m.description}</p>
                {!configured && (
                  <p className="text-[11px] text-muted-foreground/70 mt-1">
                    Add API key in Settings
                  </p>
                )}
              </div>
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
