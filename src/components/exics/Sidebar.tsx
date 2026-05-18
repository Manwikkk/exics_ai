import { useMemo, useState } from "react";
import {
  Plus,
  Search,
  Settings,
  LogOut,
  MessageSquare,
  Pencil,
  Trash2,
  PanelLeftClose,
  PanelLeftOpen,
  Ghost,
  LogIn,
} from "lucide-react";
import { useExics } from "@/lib/exics/store";
import { cn } from "@/lib/utils";
import { Logo } from "./Logo";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
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

interface Props {
  open: boolean;
  onToggle: () => void;
  onNewChat: () => void;
  onOpenSettings: () => void;
  onOpenAuth: () => void;
}

export function Sidebar({ open, onToggle, onNewChat, onOpenSettings, onOpenAuth }: Props) {
  const {
    chats,
    activeChatId,
    selectChat,
    newChat,
    renameChat,
    deleteChat,
    user,
    signOut,
    incognito,
    toggleIncognito,
  } = useExics();

  const [query, setQuery] = useState("");
  const [renaming, setRenaming] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = q
      ? chats.filter(
          (c) =>
            c.title.toLowerCase().includes(q) ||
            c.messages.some((m) => m.content.toLowerCase().includes(q))
        )
      : chats;
    // Show a single empty "New chat" row at most in the sidebar
    const empty = list.filter(
      (c) => c.messages.length === 0 && c.title === "New chat"
    );
    if (empty.length <= 1) return list;
    const keepId = empty[0].id;
    return list.filter(
      (c) => c.messages.length > 0 || c.title !== "New chat" || c.id === keepId
    );
  }, [chats, query]);

  return (
    <aside
      className={cn(
        "h-full w-[260px] min-w-[260px] bg-sidebar text-sidebar-foreground border-r border-sidebar-border flex flex-col overflow-hidden"
      )}
    >
      {/* Header */}
      <div className="h-14 flex items-center px-3 shrink-0 gap-2">
        <button
          type="button"
          onClick={onNewChat}
          className={cn(
            "flex items-center gap-2.5 min-w-0 flex-1 rounded-md py-1.5 px-1 -mx-1",
            "hover:bg-sidebar-accent transition-colors text-left",
            !open && "justify-center flex-none",
          )}
          title="New chat"
        >
          <Logo size={open ? 22 : 20} />
          {open && (
            <span className="font-serif text-[19px] font-medium tracking-tight truncate text-foreground">
              Exics
            </span>
          )}
        </button>
        <button
          onClick={onToggle}
          className="h-8 w-8 shrink-0 inline-flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-sidebar-accent transition-colors"
          aria-label="Toggle sidebar"
        >
          {open ? <PanelLeftClose size={16} /> : <PanelLeftOpen size={16} />}
        </button>
      </div>
      {/* New chat / Search */}
      <div className="px-2 space-y-1">
        <SidebarButton
          icon={<Plus size={16} />}
          label="New chat"
          open={open}
          onClick={() => newChat()}
        />
        {open && (
          <div className="relative">
            <Search
              size={14}
              className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground"
            />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search chats"
              className="w-full h-8 pl-8 pr-2 rounded-md bg-transparent hover:bg-sidebar-accent focus:bg-sidebar-accent text-sm placeholder:text-muted-foreground outline-none transition-colors"
            />
          </div>
        )}
      </div>

      {/* Chat list */}
      <div className="flex-1 overflow-y-auto mt-3 px-2">
        {open && (
          <div className="px-2 mb-1.5 text-[11px] uppercase tracking-wider text-muted-foreground">
            Chats
          </div>
        )}
        <ul className="space-y-0.5">
          {filtered.length === 0 && open && (
            <li className="px-2 py-3 text-xs text-muted-foreground">
              {query ? "No matches" : "No chats yet"}
            </li>
          )}
          {filtered.map((c) => {
            const active = c.id === activeChatId && !incognito;
            const isRenaming = renaming === c.id;
            return (
              <li key={c.id} className="group relative">
                {isRenaming ? (
                  <input
                    autoFocus
                    value={renameValue}
                    onChange={(e) => setRenameValue(e.target.value)}
                    onBlur={() => {
                      if (renameValue.trim()) renameChat(c.id, renameValue.trim());
                      setRenaming(null);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        if (renameValue.trim()) renameChat(c.id, renameValue.trim());
                        setRenaming(null);
                      }
                      if (e.key === "Escape") setRenaming(null);
                    }}
                    className="w-full h-8 px-2 rounded-md bg-sidebar-accent text-sm outline-none ring-1 ring-border"
                  />
                ) : (
                  <button
                    onClick={() => selectChat(c.id)}
                    className={cn(
                      "w-full text-left flex items-center gap-2 h-8 px-2 rounded-md text-sm transition-colors",
                      active
                        ? "bg-sidebar-accent text-foreground"
                        : "text-muted-foreground hover:bg-sidebar-accent hover:text-foreground"
                    )}
                  >
                    <MessageSquare size={14} className="shrink-0 opacity-70" />
                    {open && <span className="truncate flex-1">{c.title}</span>}
                  </button>
                )}
                {open && !isRenaming && (
                  <div className="absolute right-1 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button
                          className="h-6 w-6 inline-flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-background/50"
                          aria-label="Chat actions"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/></svg>
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-40">
                        <DropdownMenuItem
                          onClick={() => {
                            setRenaming(c.id);
                            setRenameValue(c.title);
                          }}
                        >
                          <Pencil size={14} className="mr-2" /> Rename
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          onClick={() => setConfirmDelete(c.id)}
                          className="text-destructive focus:text-destructive"
                        >
                          <Trash2 size={14} className="mr-2" /> Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </div>

      {/* Footer */}
      <div className="border-t border-sidebar-border p-2 space-y-0.5">
        <SidebarButton
          icon={<Ghost size={16} />}
          label={incognito ? "Exit incognito" : "Incognito mode"}
          open={open}
          onClick={toggleIncognito}
          active={incognito}
        />
        <SidebarButton
          icon={<Settings size={16} />}
          label="Settings"
          open={open}
          onClick={onOpenSettings}
        />
        {user ? (
          <SidebarButton
            icon={<LogOut size={16} />}
            label="Log out"
            open={open}
            onClick={signOut}
          />
        ) : (
          <SidebarButton
            icon={<LogIn size={16} />}
            label="Sign in"
            open={open}
            onClick={onOpenAuth}
          />
        )}
        {open && user && (
          <div className="mt-2 px-2 py-2 flex items-center gap-2 min-w-0">
            <div className="h-8 w-8 shrink-0 rounded-full bg-accent flex items-center justify-center text-[11px] text-foreground font-medium">
              {user.name.slice(0, 1).toUpperCase()}
            </div>
            <div className="min-w-0">
              <p className="text-xs text-foreground truncate leading-tight">{user.name}</p>
              <p className="text-[11px] text-muted-foreground truncate">{user.email}</p>
            </div>
          </div>
        )}
      </div>

      <AlertDialog open={!!confirmDelete} onOpenChange={(o) => !o && setConfirmDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete chat?</AlertDialogTitle>
            <AlertDialogDescription>
              This chat will be permanently removed. This can't be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (confirmDelete) deleteChat(confirmDelete);
                setConfirmDelete(null);
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </aside>
  );
}

function SidebarButton({
  icon,
  label,
  open,
  onClick,
  active,
}: {
  icon: React.ReactNode;
  label: string;
  open: boolean;
  onClick?: () => void;
  active?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      title={!open ? label : undefined}
      className={cn(
        "w-full flex items-center gap-2 h-8 px-2 rounded-md text-sm transition-colors",
        active
          ? "bg-sidebar-accent text-foreground"
          : "text-muted-foreground hover:bg-sidebar-accent hover:text-foreground"
      )}
    >
      <span className="shrink-0">{icon}</span>
      {open && <span className="truncate">{label}</span>}
    </button>
  );
}
