import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type {
  ApiKeys,
  Chat,
  ChatMessage,
  ProviderId,
  ProviderKeyStatus,
  ProviderModels,
  ThemeMode,
  User,
} from "./types";
import { DEFAULT_PROVIDER_MODELS } from "./constants";
import { getProviderStatus, setAuthToken } from "./api";
import {
  loadActiveChatId,
  loadUserChats,
  migrateLegacyChatsFromStore,
  saveActiveChatId,
  saveUserChats,
} from "./chat-storage";

function uid() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function isEmptyChat(chat: Chat): boolean {
  return (
    chat.messages.length === 0 &&
    (!chat.docIds || chat.docIds.length === 0) &&
    chat.title === "New chat"
  );
}

/** Keep at most one blank "New chat" in the sidebar list. */
function pruneEmptyChats(chats: Chat[]): Chat[] {
  const empty = chats.filter(isEmptyChat);
  if (empty.length <= 1) return chats;
  const keepId = empty[0].id;
  return chats.filter((c) => !isEmptyChat(c) || c.id === keepId);
}

function resolveActiveChatId(chats: Chat[], preferred: string | null): string | null {
  if (preferred && chats.some((c) => c.id === preferred)) return preferred;
  return chats[0]?.id ?? null;
}

function chatStateForUser(user: User | null): Pick<ExicsState, "chats" | "activeChatId"> {
  if (!user) {
    return { chats: [], activeChatId: null };
  }
  const chats = pruneEmptyChats(loadUserChats(user.id));
  const activeChatId = resolveActiveChatId(chats, loadActiveChatId(user.id));
  return { chats, activeChatId };
}

function clearAuthSession(
  set: (partial: Partial<ExicsState> | ((s: ExicsState) => Partial<ExicsState>)) => void,
) {
  set({
    user: null,
    authToken: null,
    chats: [],
    activeChatId: null,
    incognitoChat: null,
    incognito: false,
  });
}

function findChatById(state: ExicsState, chatId: string): Chat | null {
  if (state.incognito && state.incognitoChat?.id === chatId) {
    return state.incognitoChat;
  }
  return state.chats.find((c) => c.id === chatId) ?? null;
}

// ── Supabase client (lazy-loaded) ────────────────────────────
let _supabase: any = null;

async function getSupabase() {
  if (_supabase) return _supabase;
  const { createClient } = await import("@supabase/supabase-js");
  const url = (import.meta as any).env?.VITE_SUPABASE_URL ?? "";
  const key = (import.meta as any).env?.VITE_SUPABASE_ANON_KEY ?? "";
  if (!url || !key) {
    console.warn("Supabase credentials not configured — auth will be mocked");
    return null;
  }
  _supabase = createClient(url, key);
  return _supabase;
}

interface ExicsState {
  // Auth
  user: User | null;
  authToken: string | null;
  signInWithGoogle: () => void;
  signOut: () => void;
  restoreSession: () => Promise<void>;

  // Settings
  apiKeys: ApiKeys;
  setApiKey: (provider: ProviderId, key: string) => void;
  removeApiKey: (provider: ProviderId) => void;

  selectedModel: ProviderId;
  setSelectedModel: (m: ProviderId) => void;

  providerModels: ProviderModels;
  setProviderModel: (provider: ProviderId, model: string) => void;
  getProviderModel: (provider: ProviderId) => string;

  theme: ThemeMode;
  setTheme: (t: ThemeMode) => void;
  toggleTheme: () => void;

  webSearchEnabled: boolean;
  toggleWebSearch: () => void;

  /** When true, user opted out of the built-in Groq server key */
  groqDefaultDisabled: boolean;
  disableGroqDefault: () => void;
  enableGroqDefault: () => void;

  /** Server/DB key status (Groq default, signed-in synced keys) */
  providerStatus: Record<ProviderId, ProviderKeyStatus> | null;
  refreshProviderStatus: () => Promise<void>;

  incognito: boolean;
  toggleIncognito: () => void;

  // Chats (persisted) + transient incognito chat
  chats: Chat[];
  incognitoChat: Chat | null;
  activeChatId: string | null;

  newChat: () => string;
  selectChat: (id: string | null) => void;
  renameChat: (id: string, title: string) => void;
  deleteChat: (id: string) => void;
  clearAllChats: () => void;
  appendMessage: (chatId: string, msg: ChatMessage) => void;
  updateMessage: (chatId: string, msgId: string, patch: Partial<ChatMessage>) => void;
  removeMessage: (chatId: string, msgId: string) => void;
  clearLoadingStatusMessages: (
    chatId: string,
    statusKind?: "indexing" | "indexed" | "web_search",
  ) => void;
  addDocIds: (chatId: string, docIds: string[], docNames: string[]) => void;
  migrateChatId: (oldId: string, newId: string) => void;
}

export const useExics = create<ExicsState>()(
  persist(
    (set, get) => ({
      user: null,
      authToken: null,

      signInWithGoogle: async () => {
        try {
          const sb = await getSupabase();
          if (sb) {
            const { error } = await sb.auth.signInWithOAuth({
              provider: "google",
              options: {
                redirectTo: window.location.origin,
              },
            });
            if (error) {
              console.error("Google sign-in error:", error);
              const user = { id: "demo-user", name: "Guest User", email: "you@example.com" };
              set({
                user,
                incognito: false,
                incognitoChat: null,
                ...chatStateForUser(user),
              });
            }
          } else {
            const user = { id: "demo-user", name: "Guest User", email: "you@example.com" };
            set({
              user,
              incognito: false,
              incognitoChat: null,
              ...chatStateForUser(user),
            });
          }
        } catch {
          const user = { id: "demo-user", name: "Guest User", email: "you@example.com" };
          set({
            user,
            incognito: false,
            incognitoChat: null,
            ...chatStateForUser(user),
          });
        }
      },

      signOut: async () => {
        try {
          const sb = await getSupabase();
          if (sb) await sb.auth.signOut();
        } catch {
          // ignore
        }
        setAuthToken(null);
        clearAuthSession(set);
      },

      restoreSession: async () => {
        migrateLegacyChatsFromStore();
        try {
          const sb = await getSupabase();
          if (!sb) {
            clearAuthSession(set);
            return;
          }
          const { data } = await sb.auth.getSession();
          const session = data?.session;
          if (session?.user) {
            const u = session.user;
            const meta = u.user_metadata ?? {};
            const user: User = {
              id: u.id,
              name: meta.full_name || meta.name || u.email || "",
              email: u.email || "",
              avatarUrl: meta.avatar_url,
            };
            setAuthToken(session.access_token);
            set({
              user,
              authToken: session.access_token,
              incognito: false,
              incognitoChat: null,
              ...chatStateForUser(user),
            });
          } else {
            setAuthToken(null);
            clearAuthSession(set);
          }
          sb.auth.onAuthStateChange((_event: string, session: any) => {
            if (session?.user) {
              const u = session.user;
              const meta = u.user_metadata ?? {};
              const user: User = {
                id: u.id,
                name: meta.full_name || meta.name || u.email || "",
                email: u.email || "",
                avatarUrl: meta.avatar_url,
              };
              const prevId = get().user?.id;
              setAuthToken(session.access_token);
              set({
                user,
                authToken: session.access_token,
                incognito: false,
                incognitoChat: null,
                ...(prevId === user.id ? {} : chatStateForUser(user)),
              });
            } else {
              setAuthToken(null);
              clearAuthSession(set);
            }
          });
        } catch {
          clearAuthSession(set);
        }
      },

      apiKeys: {},
      setApiKey: (provider, key) =>
        set((s) => ({ apiKeys: { ...s.apiKeys, [provider]: key } })),
      removeApiKey: (provider) =>
        set((s) => {
          const next = { ...s.apiKeys };
          delete next[provider];
          return { apiKeys: next };
        }),

      selectedModel: "groq",
      setSelectedModel: (m) => set({ selectedModel: m }),

      providerModels: { ...DEFAULT_PROVIDER_MODELS },
      setProviderModel: (provider, model) =>
        set((s) => ({
          providerModels: { ...s.providerModels, [provider]: model.trim() },
        })),
      getProviderModel: (provider) => {
        const s = get();
        return (
          s.providerModels[provider]?.trim() ||
          DEFAULT_PROVIDER_MODELS[provider]
        );
      },

      theme: "dark",
      setTheme: (t) => set({ theme: t }),
      toggleTheme: () =>
        set((s) => ({ theme: s.theme === "dark" ? "light" : "dark" })),

      webSearchEnabled: false,
      toggleWebSearch: () => set((s) => ({ webSearchEnabled: !s.webSearchEnabled })),

      groqDefaultDisabled: false,
      disableGroqDefault: () => set({ groqDefaultDisabled: true }),
      enableGroqDefault: () =>
        set((s) => {
          const next = { ...s.apiKeys };
          delete next.groq;
          return { groqDefaultDisabled: false, apiKeys: next };
        }),

      providerStatus: null,
      refreshProviderStatus: async () => {
        try {
          const status = await getProviderStatus();
          set({ providerStatus: status });
        } catch {
          set({ providerStatus: null });
        }
      },

      incognito: false,
      toggleIncognito: () =>
        set((s) => {
          if (s.incognito) {
            return {
              incognito: false,
              incognitoChat: null,
              activeChatId: s.chats[0]?.id ?? null,
            };
          }
          const id = uid();
          const chat: Chat = {
            id,
            title: "Incognito chat",
            createdAt: Date.now(),
            updatedAt: Date.now(),
            messages: [],
            model: s.selectedModel,
            docIds: [],
            docNames: [],
          };
          return {
            incognito: true,
            incognitoChat: chat,
            activeChatId: id,
          };
        }),

      chats: [],
      incognitoChat: null,
      activeChatId: null,

      newChat: () => {
        const s = get();
        if (!s.incognito) {
          const existingEmpty = s.chats.find(isEmptyChat);
          if (existingEmpty) {
            set({ activeChatId: existingEmpty.id });
            return existingEmpty.id;
          }
        }
        const id = uid();
        const chat: Chat = {
          id,
          title: "New chat",
          createdAt: Date.now(),
          updatedAt: Date.now(),
          messages: [],
          model: s.selectedModel,
          docIds: [],
          docNames: [],
        };
        if (s.incognito) {
          set({ incognitoChat: chat, activeChatId: id });
        } else {
          set((st) => ({
            chats: pruneEmptyChats([chat, ...st.chats]),
            activeChatId: id,
          }));
        }
        return id;
      },
      selectChat: (id) => set({ activeChatId: id, incognito: false, incognitoChat: null }),
      renameChat: (id, title) =>
        set((s) => {
          if (s.incognito && s.incognitoChat?.id === id) {
            return { incognitoChat: { ...s.incognitoChat, title } };
          }
          return {
            chats: s.chats.map((c) => (c.id === id ? { ...c, title } : c)),
          };
        }),
      deleteChat: (id) =>
        set((s) => ({
          chats: s.chats.filter((c) => c.id !== id),
          activeChatId: s.activeChatId === id ? null : s.activeChatId,
        })),
      clearAllChats: () => set({ chats: [], activeChatId: null }),

      appendMessage: (chatId, msg) =>
        set((s) => {
          if (s.incognito && s.incognitoChat?.id === chatId) {
            const next = {
              ...s.incognitoChat,
              messages: [...s.incognitoChat.messages, msg],
              updatedAt: Date.now(),
            };
            return { incognitoChat: next };
          }
          return {
            chats: s.chats.map((c) =>
              c.id === chatId
                ? {
                    ...c,
                    messages: [...c.messages, msg],
                    updatedAt: Date.now(),
                  }
                : c
            ),
          };
        }),

      updateMessage: (chatId, msgId, patch) =>
        set((s) => {
          if (s.incognito && s.incognitoChat?.id === chatId) {
            return {
              incognitoChat: {
                ...s.incognitoChat,
                messages: s.incognitoChat.messages.map((m) =>
                  m.id === msgId ? { ...m, ...patch } : m
                ),
              },
            };
          }
          return {
            chats: s.chats.map((c) =>
              c.id === chatId
                ? {
                    ...c,
                    messages: c.messages.map((m) =>
                      m.id === msgId ? { ...m, ...patch } : m
                    ),
                  }
                : c
            ),
          };
        }),

      removeMessage: (chatId, msgId) =>
        set((s) => {
          const drop = (messages: ChatMessage[]) =>
            messages.filter((m) => m.id !== msgId);
          if (s.incognito && s.incognitoChat?.id === chatId) {
            return {
              incognitoChat: {
                ...s.incognitoChat,
                messages: drop(s.incognitoChat.messages),
              },
            };
          }
          return {
            chats: s.chats.map((c) =>
              c.id === chatId ? { ...c, messages: drop(c.messages) } : c,
            ),
          };
        }),

      clearLoadingStatusMessages: (chatId, statusKind) =>
        set((s) => {
          const prune = (messages: ChatMessage[]) =>
            messages.filter(
              (m) =>
                !(
                  m.meta?.type === "status" &&
                  m.meta.loading &&
                  (!statusKind || m.meta.statusKind === statusKind)
                ),
            );
          if (s.incognito && s.incognitoChat?.id === chatId) {
            return {
              incognitoChat: {
                ...s.incognitoChat,
                messages: prune(s.incognitoChat.messages),
              },
            };
          }
          return {
            chats: s.chats.map((c) =>
              c.id === chatId ? { ...c, messages: prune(c.messages) } : c,
            ),
          };
        }),

      addDocIds: (chatId, docIds, docNames) =>
        set((s) => {
          if (s.incognito && s.incognitoChat?.id === chatId) {
            const existing = s.incognitoChat.docIds || [];
            const existingNames = s.incognitoChat.docNames || [];
            return {
              incognitoChat: {
                ...s.incognitoChat,
                docIds: [...existing, ...docIds.filter((d) => !existing.includes(d))],
                docNames: [...existingNames, ...docNames.filter((n) => !existingNames.includes(n))],
              },
            };
          }
          return {
            chats: s.chats.map((c) =>
              c.id === chatId
                ? {
                    ...c,
                    docIds: [...(c.docIds || []), ...docIds.filter((d) => !(c.docIds || []).includes(d))],
                    docNames: [...(c.docNames || []), ...docNames.filter((n) => !(c.docNames || []).includes(n))],
                  }
                : c
            ),
          };
        }),

      migrateChatId: (oldId, newId) =>
        set((s) => {
          if (oldId === newId) return s;
          if (s.incognito && s.incognitoChat?.id === oldId) {
            return {
              incognitoChat: { ...s.incognitoChat, id: newId },
              activeChatId: newId,
            };
          }
          return {
            chats: s.chats.map((c) => (c.id === oldId ? { ...c, id: newId } : c)),
            activeChatId: s.activeChatId === oldId ? newId : s.activeChatId,
          };
        }),
    }),
    {
      name: "exics-store-v1",
      storage: createJSONStorage(() =>
        typeof window === "undefined"
          ? ({
              getItem: () => null,
              setItem: () => {},
              removeItem: () => {},
            } as unknown as Storage)
          : window.localStorage
      ),
      partialize: (s) => ({
        user: s.user,
        apiKeys: s.apiKeys,
        groqDefaultDisabled: s.groqDefaultDisabled,
        selectedModel: s.selectedModel,
        providerModels: s.providerModels,
        theme: s.theme,
        webSearchEnabled: s.webSearchEnabled,
      }),
      onRehydrateStorage: () => (state) => {
        migrateLegacyChatsFromStore();
        if (state?.user?.id) {
          const scoped = chatStateForUser(state.user);
          state.chats = scoped.chats;
          state.activeChatId = scoped.activeChatId;
        } else {
          state.chats = [];
          state.activeChatId = null;
        }
        if (state?.providerModels) {
          const deprecatedGroq = new Set([
            "llama-3.1-70b-versatile",
            "llama3-70b-8192",
            "llama3-8b-8192",
          ]);
          const groqModel = state.providerModels.groq?.trim();
          if (!groqModel || deprecatedGroq.has(groqModel)) {
            state.providerModels.groq = DEFAULT_PROVIDER_MODELS.groq;
          }
        }
      },
    }
  )
);

export { findChatById };

export function getActiveChat(state: ExicsState): Chat | null {
  if (state.incognito) return state.incognitoChat;
  return state.chats.find((c) => c.id === state.activeChatId) ?? null;
}

export function newId() {
  return uid();
}

// Persist chat history only for signed-in users (per account).
useExics.subscribe((state, prev) => {
  const userId = state.user?.id;
  if (!userId) return;
  if (state.chats === prev.chats && state.activeChatId === prev.activeChatId) return;
  saveUserChats(userId, pruneEmptyChats(state.chats));
  saveActiveChatId(userId, state.activeChatId);
});
