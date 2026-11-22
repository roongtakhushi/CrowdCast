import { create } from "zustand";
import type { DeviceInfo, LogEntry, StatsSnapshot } from "@/shared/types";

export interface SeriesPoint {
  t: number;
  connected: number;
  rtt: number | null;
}

interface DevicesState {
  devices: DeviceInfo[];
  stats: StatsSnapshot | null;
  presence: { connected: number; peak: number };
  series: SeriesPoint[];
  logs: LogEntry[];
  reactions: Record<string, number>;
  pulse: number;
  setDevices: (d: DeviceInfo[]) => void;
  setPresence: (connected: number, peak: number) => void;
  pushStats: (s: StatsSnapshot, acks: Record<string, number>) => void;
  pushLog: (e: LogEntry) => void;
  setLogs: (l: LogEntry[]) => void;
  addReactions: (counts: Record<string, number>) => void;
  clearLogs: () => void;
  reset: () => void;
}

const MAX_POINTS = 120;
const MAX_LOGS = 300;

export const useDevices = create<DevicesState>()((set) => ({
  devices: [],
  stats: null,
  presence: { connected: 0, peak: 0 },
  series: [],
  logs: [],
  reactions: {},
  pulse: 0,
  setDevices: (devices) => set({ devices }),
  setPresence: (connected, peak) => set({ presence: { connected, peak } }),
  pushStats: (stats, acks) =>
    set((s) => {
      const series = [...s.series, { t: stats.ts, connected: stats.connected, rtt: stats.avgRttMs }].slice(-MAX_POINTS);
      const hasAcks = Object.keys(acks).length > 0;
      return {
        stats,
        series,
        presence: { connected: stats.connected, peak: stats.peak },
        logs: hasAcks ? s.logs.map((l) => (acks[l.id] !== undefined ? { ...l, acks: acks[l.id] } : l)) : s.logs,
      };
    }),
  pushLog: (e) => set((s) => ({ logs: [...s.logs, e].slice(-MAX_LOGS), pulse: s.pulse + 1 })),
  setLogs: (logs) => set({ logs }),
  addReactions: (counts) =>
    set((s) => {
      const next = { ...s.reactions };
      for (const [k, v] of Object.entries(counts)) next[k] = (next[k] ?? 0) + v;
      return { reactions: next };
    }),
  clearLogs: () => set({ logs: [] }),
  reset: () =>
    set({ devices: [], stats: null, presence: { connected: 0, peak: 0 }, series: [], logs: [], reactions: {}, pulse: 0 }),
}));
