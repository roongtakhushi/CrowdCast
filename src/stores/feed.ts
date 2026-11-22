import { create } from "zustand";
import type { ContentItem } from "@/shared/types";

export interface Alert {
  id: string;
  title: string;
  body: string;
  priority: ContentItem["priority"];
}

interface FeedState {
  items: Record<string, ContentItem>;
  loaded: boolean;
  alert: Alert | null;
  announcement: string;
  setSnapshot: (items: ContentItem[]) => void;
  upsert: (item: ContentItem, live: boolean) => void;
  remove: (id: string) => void;
  dismissAlert: () => void;
  reset: () => void;
}

export const useFeed = create<FeedState>()((set) => ({
  items: {},
  loaded: false,
  alert: null,
  announcement: "",
  setSnapshot: (list) =>
    set({ items: Object.fromEntries(list.map((i) => [i.id, i])), loaded: true }),
  upsert: (item, live) =>
    set((s) => {
      const isNew = !s.items[item.id];
      const next: Partial<FeedState> = { items: { ...s.items, [item.id]: item } };
      if (live && isNew) {
        next.announcement = `New ${item.type === "announcement" ? "announcement" : item.type}: ${item.title || "untitled"}`;
        if (item.type === "announcement" && item.priority === "urgent") {
          next.alert = { id: item.id, title: item.title, body: item.body, priority: item.priority };
        }
      }
      return next;
    }),
  remove: (id) =>
    set((s) => {
      if (!s.items[id]) return s;
      const items = { ...s.items };
      delete items[id];
      return { items, alert: s.alert?.id === id ? null : s.alert };
    }),
  dismissAlert: () => set({ alert: null }),
  reset: () => set({ items: {}, loaded: false, alert: null, announcement: "" }),
}));

/** Pinned first, then newest first. Expired items are hidden client-side too. */
export function sortFeed(items: Record<string, ContentItem>, now = Date.now()): ContentItem[] {
  return Object.values(items)
    .filter((i) => !i.expiresAt || new Date(i.expiresAt).getTime() > now)
    .sort((a, b) => {
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime() || b.seq - a.seq;
    });
}
