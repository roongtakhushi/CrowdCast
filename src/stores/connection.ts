import { create } from "zustand";
import type { ConnStatus, FatalInfo } from "@/lib/socket";
import type { RoomMeta, RoomSettings } from "@/shared/types";

interface ConnectionState {
  status: ConnStatus;
  attempt: number;
  rttMs: number | null;
  lastSeq: number;
  deviceName: string | null;
  room: RoomMeta | null;
  settings: RoomSettings | null;
  fatal: FatalInfo | null;
  ended: boolean;
  setStatus: (s: ConnStatus, attempt: number) => void;
  setRtt: (rtt: number | null) => void;
  setSeq: (seq: number) => void;
  setIdentity: (name: string) => void;
  setRoom: (room: RoomMeta, settings: RoomSettings) => void;
  setSettings: (settings: RoomSettings, ended: boolean) => void;
  setFatal: (f: FatalInfo | null) => void;
  reset: () => void;
}

const initial = {
  status: "connecting" as ConnStatus,
  attempt: 0,
  rttMs: null,
  lastSeq: 0,
  deviceName: null,
  room: null,
  settings: null,
  fatal: null,
  ended: false,
};

export const useConnection = create<ConnectionState>()((set) => ({
  ...initial,
  setStatus: (status, attempt) => set({ status, attempt }),
  setRtt: (rttMs) => set({ rttMs }),
  setSeq: (lastSeq) => set({ lastSeq }),
  setIdentity: (deviceName) => set({ deviceName }),
  setRoom: (room, settings) => set({ room, settings, ended: room.status === "ended" }),
  setSettings: (settings, ended) => set((s) => ({ settings, ended, room: s.room ? { ...s.room, status: ended ? "ended" : "active" } : s.room })),
  setFatal: (fatal) => set({ fatal }),
  reset: () => set({ ...initial }),
}));
