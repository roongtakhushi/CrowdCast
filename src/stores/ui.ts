import { create } from "zustand";

export type Theme = "dark" | "light";
const KEY = "crowdcast:theme";

interface UiState {
  theme: Theme;
  shareOpen: boolean;
  init: () => void;
  toggleTheme: () => void;
  setShareOpen: (v: boolean) => void;
}

function apply(theme: Theme) {
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;
  const meta = document.querySelector('meta[name="theme-color"]');
  meta?.setAttribute("content", theme === "dark" ? "#0a0b10" : "#f6f7fb");
}

export const useUi = create<UiState>()((set, get) => ({
  theme: "dark",
  shareOpen: false,
  init: () => {
    let stored: string | null = null;
    try {
      stored = localStorage.getItem(KEY);
    } catch {
      /* ignore */
    }
    const theme: Theme =
      stored === "light" || stored === "dark"
        ? stored
        : window.matchMedia("(prefers-color-scheme: light)").matches
          ? "light"
          : "dark";
    apply(theme);
    set({ theme });
  },
  toggleTheme: () => {
    const theme: Theme = get().theme === "dark" ? "light" : "dark";
    apply(theme);
    try {
      localStorage.setItem(KEY, theme);
    } catch {
      /* ignore */
    }
    set({ theme });
  },
  setShareOpen: (shareOpen) => set({ shareOpen }),
}));
