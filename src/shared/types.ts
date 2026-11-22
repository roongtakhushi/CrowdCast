/**
 * Shared domain types. Imported by BOTH the server (src/server) and the
 * browser (src/components, src/stores, src/lib).
 */
export const PRIORITIES = ["normal", "important", "urgent"] as const;
export type Priority = (typeof PRIORITIES)[number];

export const CONTENT_TYPES = ["announcement", "image", "pdf"] as const;
export type ContentType = (typeof CONTENT_TYPES)[number];

export const REACTION_EMOJIS = ["👏", "❤️", "😂", "🔥", "😮", "👍"] as const;
export type ReactionEmoji = (typeof REACTION_EMOJIS)[number];

export type RoomStatus = "active" | "ended";
export type Role = "attendee" | "organizer" | "display";
export type DeviceType = "iOS" | "Android" | "Desktop" | "Other";
export type SignalQuality = "excellent" | "good" | "weak" | "poor" | "unknown";

export interface ContentItem {
  id: string;
  seq: number;
  type: ContentType;
  title: string;
  body: string;
  priority: Priority;
  pinned: boolean;
  expiresAt: string | null;
  fileUrl: string | null;
  downloadUrl: string | null;
  thumbUrl: string | null;
  mime: string | null;
  sizeBytes: number | null;
  pageCount: number | null;
  deliveredTo: number;
  createdAt: string;
  updatedAt: string;
}

export interface RoomSettings {
  locked: boolean;
  requireName: boolean;
  reactionsEnabled: boolean;
  maxAttendees: number;
}

export interface PresentationState {
  active: boolean;
  contentId: string | null;
  currentSlide: number;
  blank: boolean;
  updatedAt: string;
  title: string | null;
  pageCount: number;
  fileUrl: string | null;
}

export interface RoomMeta {
  code: string;
  name: string;
  description: string;
  status: RoomStatus;
}

export interface PublicRoom extends RoomMeta {
  locked: boolean;
  full: boolean;
  requireName: boolean;
  reactionsEnabled: boolean;
  hasPin: boolean;
}

export interface DeviceInfo {
  deviceId: string;
  name: string;
  deviceType: DeviceType;
  browser: string;
  joinedAt: string;
  status: "online" | "reconnecting";
  rttMs: number | null;
  quality: SignalQuality;
  transport: "sse";
  muted: boolean;
  inSync: boolean | null;
}

export interface StatsSnapshot {
  connected: number;
  reconnecting: number;
  peak: number;
  avgRttMs: number | null;
  itemsBroadcast: number;
  bytesSent: number;
  inSync: number;
  presenting: boolean;
  uptimeSec: number;
  ts: number;
}

export interface LogEntry {
  id: string;
  ts: number;
  event: string;
  bytes: number;
  recipients: number;
  acks: number;
  seq: number | null;
}

export interface NetworkCandidate {
  address: string;
  iface: string;
  virtual: boolean;
}

export interface NetworkInfo {
  candidates: NetworkCandidate[];
  primary: string | null;
  port: number;
  uptimeSec: number;
  baseUrl: string;
  platform: string;
  hostname: string;
}

export interface ApiErrorBody {
  ok: false;
  error: { code: string; message: string; details?: unknown };
}
