import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useExics } from "@/lib/exics/store";
import { MODELS, type ProviderId, type ProviderKeyStatus } from "@/lib/exics/types";
import { deleteApiKey, getProviderStatus, saveApiKey } from "@/lib/exics/api";
import { API_KEY_MESSAGES, hasAnyProviderKey } from "@/lib/exics/provider-keys";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export function SettingsDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const {
    apiKeys,
    setApiKey,
    removeApiKey,
    groqDefaultDisabled,
    disableGroqDefault,
    enableGroqDefault,
    refreshProviderStatus,
    webSearchEnabled,
    toggleWebSearch,
    incognito,
    toggleIncognito,
    clearAllChats,
    user,
    signOut,
  } = useExics();
  const [confirmClear, setConfirmClear] = useState(false);
  const [providerStatus, setProviderStatus] = useState<Record<ProviderId, ProviderKeyStatus> | null>(
    null,
  );

  useEffect(() => {
    if (!open) return;
    getProviderStatus()
      .then((status) => {
        setProviderStatus(status);
        refreshProviderStatus();
      })
      .catch(() => setProviderStatus(null));
  }, [open, refreshProviderStatus]);

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-2xl p-0 overflow-hidden">
          <DialogHeader className="px-6 pt-6 pb-3">
            <DialogTitle className="text-base font-medium">Settings</DialogTitle>
            <DialogDescription className="text-xs">
              Manage providers, preferences, and chat data.
            </DialogDescription>
          </DialogHeader>
          <Tabs defaultValue="keys" className="w-full">
            <TabsList className="mx-6 bg-secondary">
              <TabsTrigger value="keys">API Keys</TabsTrigger>
              <TabsTrigger value="preferences">Preferences</TabsTrigger>
              <TabsTrigger value="data">Data</TabsTrigger>
              <TabsTrigger value="account">Account</TabsTrigger>
            </TabsList>

            <TabsContent value="keys" className="px-6 py-4 space-y-3">
              <p className="text-xs text-muted-foreground">
                Custom keys are stored locally in your browser. Groq uses the built-in server key by
                default — replace it only if you want your own quota.
              </p>
              {MODELS.map((m) => {
                const server = providerStatus?.[m.id];
                const isGroq = m.id === "groq";
                const hasCustomKey = !!apiKeys[m.id];
                const serverDefaultAvailable = server?.default_available ?? false;
                const usesServerDefault =
                  isGroq &&
                  !hasCustomKey &&
                  !groqDefaultDisabled &&
                  serverDefaultAvailable;
                const configured =
                  hasCustomKey || usesServerDefault || (!!server?.configured && !isGroq);
                const canRestoreGroqDefault =
                  isGroq &&
                  groqDefaultDisabled &&
                  !hasCustomKey &&
                  serverDefaultAvailable;

                return (
                  <ApiKeyRow
                    key={m.id}
                    providerId={m.id}
                    name={m.name}
                    description={
                      isGroq && usesServerDefault
                        ? "Built-in server key — ready to use. Add your own key below to override."
                        : m.description
                    }
                    statusLabel={
                      configured
                        ? usesServerDefault
                          ? "Already added"
                          : "Added"
                        : "Not added"
                    }
                    statusHint={
                      usesServerDefault ? "Server default" : hasCustomKey ? "Your key" : undefined
                    }
                    hasKey={configured}
                    isServerDefault={usesServerDefault}
                    canRestoreDefault={canRestoreGroqDefault}
                    onRestoreDefault={
                      canRestoreGroqDefault
                        ? () => {
                            enableGroqDefault();
                            toast.success("Built-in Groq key restored");
                            refreshProviderStatus();
                          }
                        : undefined
                    }
                    onSave={async (k) => {
                      if (isGroq) enableGroqDefault();
                      setApiKey(m.id, k);
                      if (user) {
                        try {
                          await saveApiKey(m.id, k);
                        } catch {
                          toast.error("Saved locally but failed to sync to account");
                          return;
                        }
                      }
                      await refreshProviderStatus();
                      toast.success(`${m.name} key saved`);
                    }}
                    onRemove={async () => {
                      if (isGroq && usesServerDefault) {
                        disableGroqDefault();
                        toast.message(
                          "Built-in Groq key removed. Add your own key, or use “Use built-in key” to restore it.",
                        );
                      } else {
                        removeApiKey(m.id);
                        if (user) {
                          try {
                            await deleteApiKey(m.id);
                          } catch {
                            toast.error("Removed locally but failed to remove from account");
                          }
                        }
                        const next = useExics.getState();
                        if (
                          !hasAnyProviderKey({
                            apiKeys: next.apiKeys,
                            groqDefaultDisabled: next.groqDefaultDisabled,
                            providerStatus,
                          })
                        ) {
                          toast.error(API_KEY_MESSAGES.noneConfigured);
                        } else {
                          toast.success(`${m.name} key removed`);
                        }
                      }
                      await refreshProviderStatus();
                    }}
                  />
                );
              })}
            </TabsContent>

            <TabsContent value="preferences" className="px-6 py-4 space-y-1">
              <ToggleRow
                title="Web search"
                description="Search the web when needed. Sources appear only for web-backed answers."
                checked={webSearchEnabled}
                onCheckedChange={toggleWebSearch}
              />
              <ToggleRow
                title="Incognito mode"
                description="Chats won't be saved to history. No persistent memory."
                checked={incognito}
                onCheckedChange={toggleIncognito}
              />
              <ToggleRow
                title="Theme"
                description="Dark theme (fixed in this release)."
                checked
                disabled
                onCheckedChange={() => {}}
              />
            </TabsContent>

            <TabsContent value="data" className="px-6 py-4 space-y-3">
              <ClearHistoryRow onClear={() => setConfirmClear(true)} />
            </TabsContent>

            <TabsContent value="account" className="px-6 py-4 space-y-3">
              {user ? (
                <>
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-full bg-accent flex items-center justify-center text-sm">
                      {user.name.slice(0, 1).toUpperCase()}
                    </div>
                    <div>
                      <p className="text-sm">{user.name}</p>
                      <p className="text-xs text-muted-foreground">{user.email}</p>
                    </div>
                  </div>
                  <Button variant="secondary" size="sm" onClick={signOut}>
                    Sign out
                  </Button>
                </>
              ) : (
                <p className="text-sm text-muted-foreground">
                  You're using Exics as a guest. Sign in to sync chats across devices. Uploaded PDFs
                  stay linked to each chat on this device.
                </p>
              )}
            </TabsContent>
          </Tabs>
          <div className="h-4" />
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmClear} onOpenChange={setConfirmClear}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Clear all chats?</AlertDialogTitle>
            <AlertDialogDescription>
              This will delete your entire chat history. This can't be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                clearAllChats();
                toast.success("Chat history cleared");
                setConfirmClear(false);
              }}
            >
              Clear
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function ClearHistoryRow({ onClear }: { onClear: () => void }) {
  return (
    <div className="flex items-center justify-between gap-4 py-3 border-b border-border">
      <div>
        <p className="text-sm">Clear chat history</p>
        <p className="text-xs text-muted-foreground">
          Permanently delete all saved chats from this device.
        </p>
      </div>
      <Button variant="destructive" size="sm" onClick={onClear}>
        Clear all
      </Button>
    </div>
  );
}

function ApiKeyRow({
  providerId,
  name,
  description,
  statusLabel,
  statusHint,
  hasKey,
  isServerDefault,
  canRestoreDefault,
  onRestoreDefault,
  onSave,
  onRemove,
}: {
  providerId: ProviderId;
  name: string;
  description: string;
  statusLabel: string;
  statusHint?: string;
  hasKey: boolean;
  isServerDefault?: boolean;
  canRestoreDefault?: boolean;
  onRestoreDefault?: () => void;
  onSave: (key: string) => void;
  onRemove: () => void | Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState("");

  return (
    <div className="py-3 border-b border-border last:border-b-0" data-provider={providerId}>
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm">{name}</p>
            <span
              className={
                hasKey
                  ? "text-[10px] uppercase tracking-wide text-foreground border border-border rounded px-1 py-px"
                  : "text-[10px] uppercase tracking-wide text-muted-foreground border border-border rounded px-1 py-px"
              }
            >
              {statusLabel}
            </span>
            {statusHint && (
              <span className="text-[10px] text-muted-foreground">{statusHint}</span>
            )}
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
          {!editing && (
            <>
              {canRestoreDefault && onRestoreDefault && (
                <Button size="sm" variant="secondary" onClick={onRestoreDefault}>
                  Use built-in key
                </Button>
              )}
              <Button
                size="sm"
                variant="secondary"
                onClick={() => {
                  setEditing(true);
                  setVal("");
                }}
              >
                {hasKey ? (isServerDefault ? "Use my key" : "Update") : "Add key"}
              </Button>
              {hasKey && (
                <Button size="sm" variant="ghost" onClick={() => void onRemove()}>
                  {isServerDefault ? "Remove default" : "Remove"}
                </Button>
              )}
            </>
          )}
        </div>
      </div>
      {editing && (
        <div className="mt-3 flex items-center gap-2">
          <Input
            autoFocus
            type="password"
            value={val}
            onChange={(e) => setVal(e.target.value)}
            placeholder={`Paste your ${name} API key`}
            className="bg-input/40 border-border h-9 text-sm"
          />
          <Button
            size="sm"
            onClick={() => {
              if (!val.trim()) return;
              onSave(val.trim());
              setEditing(false);
              setVal("");
            }}
          >
            Save
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              setEditing(false);
              setVal("");
            }}
          >
            Cancel
          </Button>
        </div>
      )}
    </div>
  );
}

function ToggleRow({
  title,
  description,
  checked,
  onCheckedChange,
  disabled,
}: {
  title: string;
  description: string;
  checked: boolean;
  onCheckedChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-3 border-b border-border last:border-b-0">
      <div>
        <p className="text-sm">{title}</p>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
      <Switch checked={checked} onCheckedChange={onCheckedChange} disabled={disabled} />
    </div>
  );
}
