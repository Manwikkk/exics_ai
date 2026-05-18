import type { Chat } from "./types";

const CHATS_KEY = "exics-chats-v1";
const ACTIVE_KEY = "exics-active-chat-v1";
const LEGACY_STORE = "exics-store-v1";

function chatsKey(userId: string) {
  return `${CHATS_KEY}:${userId}`;
}

function activeKey(userId: string) {
  return `${ACTIVE_KEY}:${userId}`;
}

export function loadUserChats(userId: string): Chat[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(chatsKey(userId));
    if (!raw) return [];
    return JSON.parse(raw) as Chat[];
  } catch {
    return [];
  }
}

export function saveUserChats(userId: string, chats: Chat[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem(chatsKey(userId), JSON.stringify(chats));
}

export function loadActiveChatId(userId: string): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(activeKey(userId));
}

export function saveActiveChatId(userId: string, activeChatId: string | null) {
  if (typeof window === "undefined") return;
  if (activeChatId) {
    localStorage.setItem(activeKey(userId), activeChatId);
  } else {
    localStorage.removeItem(activeKey(userId));
  }
}

/** Move chats from legacy bundled store into per-user keys (one-time). */
export function migrateLegacyChatsFromStore() {
  if (typeof window === "undefined") return;
  try {
    const raw = localStorage.getItem(LEGACY_STORE);
    if (!raw) return;
    const parsed = JSON.parse(raw) as {
      state?: { chats?: Chat[]; activeChatId?: string | null; user?: { id?: string } };
    };
    const legacyUserId = parsed.state?.user?.id;
    const legacyChats = parsed.state?.chats;
    if (legacyUserId && legacyChats?.length && loadUserChats(legacyUserId).length === 0) {
      saveUserChats(legacyUserId, legacyChats);
      if (parsed.state?.activeChatId) {
        saveActiveChatId(legacyUserId, parsed.state.activeChatId);
      }
    }
    if (parsed.state) {
      delete parsed.state.chats;
      delete parsed.state.activeChatId;
      localStorage.setItem(LEGACY_STORE, JSON.stringify(parsed));
    }
  } catch {
    // ignore corrupt storage
  }
}
