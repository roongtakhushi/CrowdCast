import type {
  ContentItem,
  DeviceInfo,
  LogEntry,
  PresentationState,
  Role,
  RoomMeta,
  RoomSettings,
  RoomStatus,
  StatsSnapshot,
} from "./types";

/** Server -> client events carried on the SSE stream. */
export interface SnapshotPayload {
  seq: number;
  room: RoomMeta;
  settings: RoomSettings;
  items: ContentItem[];
  presentation: PresentationState;
  you: { deviceId: string; name: string; role: Role };
}

export interface OrganizerState {
  devices: DeviceInfo[];
  stats: StatsSnapshot;
  logs: LogEntry[];
  reactions: Record<string, number>;
}

export interface ServerEventMap {
  hello: { deviceId: string; name: string; role: Role; serverTime: number; heartbeatMs: number };
  snapshot: SnapshotPayload;
  ready: { seq: number; mode: "snapshot" | "replay" | "none"; replayed: number };
  content_added: { seq: number; item: ContentItem };
  content_updated: { seq: number; item: ContentItem };
  content_removed: { seq: number; id: string };
  presentation_state: { seq: number; state: PresentationState };
  slide_changed: { seq: number; currentSlide: number; updatedAt: string };
  room_state_changed: { seq: number; status: RoomStatus; settings: RoomSettings };
  pointer_moved: { x: number; y: number; visible: boolean };
  presence_update: { connected: number; peak: number };
  device_list: { devices: DeviceInfo[] };
  stats_update: { stats: StatsSnapshot; acks: Record<string, number> };
  log_entry: { entry: LogEntry };
  organizer_state: OrganizerState;
  reaction_batch: { counts: Record<string, number>; total: number };
  kicked: { reason: "kicked" | "code_rotated" | "room_ended" };
  error: { code: string; message: string };
  ping: { id: string; t: number };
}

export type ServerEventName = keyof ServerEventMap;

/** Events that mutate shared state: they get a monotonic per-room `seq`
 *  and are persisted in event_log so reconnecting clients can resync. */
export const SEQUENCED_EVENTS = [
  "content_added",
  "content_updated",
  "content_removed",
  "presentation_state",
  "slide_changed",
  "room_state_changed",
] as const satisfies readonly ServerEventName[];

export type SequencedEventName = (typeof SEQUENCED_EVENTS)[number];

export function isSequenced(name: string): name is SequencedEventName {
  return (SEQUENCED_EVENTS as readonly string[]).includes(name);
}
