import { create } from "zustand";
import type { PresentationState } from "@/shared/types";

export interface Pointer {
  x: number;
  y: number;
  visible: boolean;
}

interface PresentationStore {
  state: PresentationState | null;
  pointer: Pointer;
  /** Attendee free-browse: slide index the attendee is looking at, or null when following live. */
  browseSlide: number | null;
  set: (s: PresentationState) => void;
  setSlide: (slide: number, updatedAt: string) => void;
  setPointer: (p: Pointer) => void;
  browse: (slide: number | null) => void;
  reset: () => void;
}

export const usePresentationStore = create<PresentationStore>()((set) => ({
  state: null,
  pointer: { x: 0, y: 0, visible: false },
  browseSlide: null,
  set: (state) =>
    set((s) => ({
      state,
      browseSlide: state.active && s.state?.contentId === state.contentId ? s.browseSlide : null,
      pointer: state.active ? s.pointer : { ...s.pointer, visible: false },
    })),
  setSlide: (currentSlide, updatedAt) =>
    set((s) => (s.state ? { state: { ...s.state, currentSlide, updatedAt } } : s)),
  setPointer: (pointer) => set({ pointer }),
  browse: (browseSlide) => set({ browseSlide }),
  reset: () => set({ state: null, pointer: { x: 0, y: 0, visible: false }, browseSlide: null }),
}));
