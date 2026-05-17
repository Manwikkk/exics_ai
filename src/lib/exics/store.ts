import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { ApiKeys, Chat, ChatMessage, ProviderId, ProviderKeyStatus, User } from "./types";
import { getProviderStatus, setAuthToken } from "./api";

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
              // Fallback to demo user
              set({
                user: { id: "demo-user", name: "Guest User", email: "you@example.com" },
              });
            }
          } else {
            // No Supabase configured — use demo user
            set({
              user: { id: "demo-user", name: "Guest User", email: "you@example.com" },
            });
          }
        } catch {
          set({
            user: { id: "demo-user", name: "Guest User", email: "you@example.com" },
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
        set({ user: null, authToken: null, activeChatId: null, incognitoChat: null });
      },

      restoreSession: async () => {
        try {
          const sb = await getSupabase();
          if (!sb) return;
          const { data } = await sb.auth.getSession();
          const session = data?.session;
          if (session?.user) {
            const u = session.user;
            const meta = u.user_metadata ?? {};
            setAuthToken(session.access_token);
            set({
              user: {
                id: u.id,
                name: meta.full_name || meta.name || u.email || "",
                email: u.email || "",
                avatarUrl: meta.avatar_url,
              },
              authToken: session.access_token,
            });
          }
          // Listen for auth changes
          sb.auth.onAuthStateChange((_event: string, session: any) => {
            if (session?.user) {
              const u = session.user;
              const meta = u.user_metadata ?? {};
              setAuthToken(session.access_token);
              set({
                user: {
                  id: u.id,
                  name: meta.full_name || meta.name || u.email || "",
                  email: u.email || "",
                  avatarUrl: meta.avatar_url,
                },
                authToken: session.access_token,
              });
            } else {
              setAuthToken(null);
              set({ user: null, authToken: null });
            }
          });
        } catch {
          // ignore
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
        set((s) => ({
          incognito: !s.incognito,
          incognitoChat: !s.incognito ? null : s.incognitoChat,
          activeChatId: !s.incognito ? null : s.activeChatId,
        })),

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
        webSearchEnabled: s.webSearchEnabled,
        chats: pruneEmptyChats(s.chats),
        activeChatId: s.activeChatId,
      }),
      onRehydrateStorage: () => (state) => {
        if (state?.chats) {
          state.chats = pruneEmptyChats(state.chats);
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
