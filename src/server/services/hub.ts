import { nanoid } from "nanoid";
import {
  isSequenced,
  type ServerEventMap,
  type ServerEventName,
  type SequencedEventName,
  type SnapshotPayload,
} from "@/shared/events";
import { planResync } from "@/shared/seq";
import type {
  DeviceInfo,
  DeviceType,
  LogEntry,
  PresentationState,
  Role,
  RoomSettings,
  RoomStatus,
  SignalQuality,
  StatsSnapshot,
} from "@/shared/types";
import { E, logger } from "../core";
import { friendlyName, sanitizeDisplayName } from "../utils/names";
import { parseUserAgent } from "../utils/ua";
import {
  appendEvent,
  countItems,
  eventsAfter,
  expireDue,
  listLiveItems,
  loadPresentation,
  maxSeq,
  toPublicItem,
} from "./content";
import { findRoomByCode } from "./rooms";

const HEARTBEAT_MS = 5000;
const GRACE_MS = 20_000;
const MAX_LOGS = 200;

export interface Client {
  key: string;
  id: string;
  role: Role;
  name: string;
  deviceType: DeviceType;
  browser: string;
  joinedAt: number;
  status: "online" | "reconnecting";
  controller: ReadableStreamDefaultController<Uint8Array> | null;
  connId: string;
  muted: boolean;
  rtts: number[];
  pending: Map<string, number>;
  inSync: boolean | null;
  buffer: Uint8Array[] | null;
  graceTimer: ReturnType<typeof setTimeout> | null;
  reactionTimes: number[];
  acked: Set<number>;
}

export interface Runtime {
  roomId: string;
  code: string;
  name: string;
  description: string;
  status: RoomStatus;
  settings: RoomSettings;
  seq: number;
  presentation: PresentationState;
  clients: Map<string, Client>;
  banned: Set<string>;
  peak: number;
  itemsBroadcast: number;
  bytesSent: number;
  logs: LogEntry[];
  logIndex: Map<string, LogEntry>;
  ackBySeq: Map<number, string>;
  dirtyAcks: Set<string>;
  reactions: Record<string, number>;
  reactionTotal: number;
  lastPointerAt: number;
  lastConnected: number;
  deviceListTimer: ReturnType<typeof setTimeout> | null;
  emptySince: number | null;
  startedAt: number;
  lock: Promise<unknown>;
  logWrites: Promise<unknown>;
}

interface HubState {
  live: Map<string, Runtime>;
  loading: Map<string, Promise<Runtime | null>>;
  ticking: boolean;
  startedAt: number;
  tick: number;
}

const g = globalThis as typeof globalThis & { __crowdcastHub?: HubState };
function hub(): HubState {
  return (g.__crowdcastHub ??= {
    live: new Map(),
    loading: new Map(),
    ticking: false,
    startedAt: Date.now(),
    tick: 0,
  });
}

export function serverUptimeSec(): number {
  return Math.round((Date.now() - hub().startedAt) / 1000);
}

// ------------------------------------------------------------------ loading
export async function getRuntime(code: string): Promise<Runtime | null> {
  const h = hub();
  const live = h.live.get(code);
  if (live) return live;
  let p = h.loading.get(code);
  if (!p) {
    p = loadRuntime(code).finally(() => h.loading.delete(code));
    h.loading.set(code, p);
  }
  return p;
}

async function loadRuntime(code: string): Promise<Runtime | null> {
  const h = hub();
  const room = await findRoomByCode(code);
  if (!room) return null;
  const [seq, presentation, itemsBroadcast] = await Promise.all([
    maxSeq(room.id),
    loadPresentation(room.id),
    countItems(room.id),
  ]);
  const rt: Runtime = {
    roomId: room.id,
    code: room.code,
    name: room.name,
    description: room.description,
    status: room.status === "ended" ? "ended" : "active",
    settings: room.settingsJson,
    seq,
    presentation,
    clients: new Map(),
    banned: new Set(),
    peak: 0,
    itemsBroadcast,
    bytesSent: 0,
    logs: [],
    logIndex: new Map(),
    ackBySeq: new Map(),
    dirtyAcks: new Set(),
    reactions: {},
    reactionTotal: 0,
    lastPointerAt: 0,
    lastConnected: -1,
    deviceListTimer: null,
    emptySince: null,
    startedAt: Date.now(),
    lock: Promise.resolve(),
    logWrites: Promise.resolve(),
  };
  h.live.set(room.code, rt);
  ensureTicks();
  logger.info("room runtime loaded", { code: room.code, seq });
  return rt;
}

export function rekeyRuntime(oldCode: string, rt: Runtime, newCode: string) {
  const h = hub();
  h.live.delete(oldCode);
  rt.code = newCode;
  h.live.set(newCode, rt);
}

/** Serialise state-changing work per room so seq allocation is race-free. */
export function runExclusive<T>(rt: Runtime, fn: () => Promise<T>): Promise<T> {
  const next = rt.lock.then(fn, fn);
  rt.lock = next.catch(() => undefined);
  return next;
}

// ------------------------------------------------------------------ wire
const enc = new TextEncoder();

function frame(event: string, payload: unknown, id?: number): Uint8Array {
  return enc.encode(`${id !== undefined ? `id: ${id}\n` : ""}event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`);
}

function write(c: Client, bytes: Uint8Array, droppable = false): boolean {
  if (c.buffer) {
    c.buffer.push(bytes);
    return true;
  }
  const ctl = c.controller;
  if (!ctl) return false;
  try {
    if (droppable && (ctl.desiredSize ?? 1) <= 0) return false;
    ctl.enqueue(bytes);
    return true;
  } catch {
    c.controller = null;
    return false;
  }
}

export interface FanoutResult {
  recipients: number;
  attendees: number;
  bytes: number;
  payloadBytes: number;
}

export function fanout<K extends ServerEventName>(
  rt: Runtime,
  event: K,
  payload: ServerEventMap[K],
  opts: { roles?: Role[]; seq?: number; droppable?: boolean } = {},
): FanoutResult {
  const bytes = frame(event, payload, opts.seq);
  let recipients = 0;
  let attendees = 0;
  for (const c of rt.clients.values()) {
    if (c.status !== "online") continue;
    if (opts.roles && !opts.roles.includes(c.role)) continue;
    if (write(c, bytes, opts.droppable)) {
      recipients++;
      if (c.role === "attendee") attendees++;
    }
  }
  rt.bytesSent += bytes.length * recipients;
  return { recipients, attendees, bytes: bytes.length * recipients, payloadBytes: bytes.length };
}

export function sendTo<K extends ServerEventName>(c: Client, event: K, payload: ServerEventMap[K]) {
  write(c, frame(event, payload));
}

const ORG: Role[] = ["organizer"];
const ORG_DISPLAY: Role[] = ["organizer", "display"];

function pushLog(rt: Runtime, event: string, payloadBytes: number, recipients: number, seq: number | null): LogEntry {
  const entry: LogEntry = { id: nanoid(8), ts: Date.now(), event, bytes: payloadBytes, recipients, acks: 0, seq };
  rt.logs.push(entry);
  rt.logIndex.set(entry.id, entry);
  while (rt.logs.length > MAX_LOGS) {
    const old = rt.logs.shift();
    if (old) rt.logIndex.delete(old.id);
  }
  fanout(rt, "log_entry", { entry }, { roles: ORG });
  return entry;
}

/** Broadcast a state-changing event: allocates the next seq, persists it, fans it out. */
export function broadcastSeq<K extends SequencedEventName>(
  rt: Runtime,
  event: K,
  build: (seq: number) => ServerEventMap[K],
) {
  const seq = ++rt.seq;
  const payload = build(seq);
  rt.logWrites = rt.logWrites
    .then(() => appendEvent(rt.roomId, seq, event, payload as unknown as Record<string, unknown>))
    .catch((e) => logger.error("event_log append failed", { seq, err: String(e) }));
  const res = fanout(rt, event, payload, { seq });
  const entry = pushLog(rt, event, res.payloadBytes, res.recipients, seq);
  rt.ackBySeq.set(seq, entry.id);
  if (rt.ackBySeq.size > MAX_LOGS * 2) {
    const first = rt.ackBySeq.keys().next().value;
    if (first !== undefined) rt.ackBySeq.delete(first);
  }
  return { seq, ...res };
}

// ------------------------------------------------------------------ presence
export function qualityOf(rtt: number | null, status: Client["status"]): SignalQuality {
  if (status === "reconnecting") return "poor";
  if (rtt === null) return "unknown";
  if (rtt < 80) return "excellent";
  if (rtt < 200) return "good";
  if (rtt < 500) return "weak";
  return "poor";
}

export function avgRtt(c: Client): number | null {
  if (!c.rtts.length) return null;
  return Math.round(c.rtts.reduce((a, b) => a + b, 0) / c.rtts.length);
}

export function toDeviceInfo(c: Client): DeviceInfo {
  const rtt = avgRtt(c);
  return {
    deviceId: c.id,
    name: c.name,
    deviceType: c.deviceType,
    browser: c.browser,
    joinedAt: new Date(c.joinedAt).toISOString(),
    status: c.status,
    rttMs: rtt,
    quality: qualityOf(rtt, c.status),
    transport: "sse",
    muted: c.muted,
    inSync: c.inSync,
  };
}

function attendees(rt: Runtime): Client[] {
  return [...rt.clients.values()].filter((c) => c.role === "attendee");
}

export function onlineAttendeeCount(rt: Runtime): number {
  return attendees(rt).filter((c) => c.status === "online").length;
}

export function computeStats(rt: Runtime): StatsSnapshot {
  const list = attendees(rt);
  const online = list.filter((c) => c.status === "online");
  const rtts = online.map(avgRtt).filter((v): v is number => v !== null);
  return {
    connected: online.length,
    reconnecting: list.length - online.length,
    peak: rt.peak,
    avgRttMs: rtts.length ? Math.round(rtts.reduce((a, b) => a + b, 0) / rtts.length) : null,
    itemsBroadcast: rt.itemsBroadcast,
    bytesSent: rt.bytesSent,
    inSync: rt.presentation.active ? online.filter((c) => c.inSync === true).length : 0,
    presenting: rt.presentation.active,
    uptimeSec: serverUptimeSec(),
    ts: Date.now(),
  };
}

function sendPresence(rt: Runtime) {
  const connected = onlineAttendeeCount(rt);
  rt.peak = Math.max(rt.peak, connected);
  if (connected !== rt.lastConnected) {
    rt.lastConnected = connected;
    fanout(rt, "presence_update", { connected, peak: rt.peak }, { roles: ORG_DISPLAY });
  }
  scheduleDeviceList(rt);
}

export function scheduleDeviceList(rt: Runtime) {
  if (rt.deviceListTimer) return;
  rt.deviceListTimer = setTimeout(() => {
    rt.deviceListTimer = null;
    fanout(rt, "device_list", { devices: attendees(rt).map(toDeviceInfo) }, { roles: ORG });
  }, 150);
}

// ------------------------------------------------------------------ admission
export function checkAdmission(rt: Runtime, role: Role, deviceId: string) {
  if (role === "attendee") {
    if (rt.status === "ended") throw E.gone("room_ended", "This event has ended.");
    if (rt.banned.has(deviceId)) throw E.forbidden("kicked", "You were removed from this room by the organizer.");
    const existing = rt.clients.get(`attendee:${deviceId}`);
    if (!existing) {
      if (rt.settings.locked) throw E.forbidden("room_locked", "The organizer has locked this room to new joins.");
      if (attendees(rt).length >= rt.settings.maxAttendees) {
        throw E.forbidden("room_full", "This room has reached its attendee limit.");
      }
    }
  } else if (role === "display" && rt.status === "ended") {
    throw E.gone("room_ended", "This event has ended.");
  }
}

export interface OpenParams {
  deviceId: string;
  role: Role;
  requestedName: string | null;
  userAgent: string | null;
  lastSeq: number;
}

export function findClient(rt: Runtime, role: Role, deviceId: string): Client | undefined {
  return rt.clients.get(`${role}:${deviceId}`);
}

export function openStream(rt: Runtime, p: OpenParams): ReadableStream<Uint8Array> {
  const key = `${p.role}:${p.deviceId}`;
  const connId = nanoid(8);
  let client: Client | undefined;

  return new ReadableStream<Uint8Array>(
    {
      start(controller) {
        const existing = rt.clients.get(key);
        if (existing) {
          if (existing.graceTimer) clearTimeout(existing.graceTimer);
          existing.graceTimer = null;
          // Duplicate tab / stale connection: tell the old stream it was replaced.
          if (existing.controller) {
            try {
              existing.controller.enqueue(frame("error", { code: "replaced", message: "Opened in another tab" }));
              existing.controller.close();
            } catch {
              /* already closed */
            }
          }
          existing.controller = controller;
          existing.connId = connId;
          existing.status = "online";
          existing.buffer = [];
          client = existing;
        } else {
          const taken = new Set(attendees(rt).map((c) => c.name));
          const ua = parseUserAgent(p.userAgent);
          client = {
            key,
            id: p.deviceId,
            role: p.role,
            name: sanitizeDisplayName(p.requestedName) ?? friendlyName(taken),
            deviceType: ua.deviceType,
            browser: ua.browser,
            joinedAt: Date.now(),
            status: "online",
            controller,
            connId,
            muted: false,
            rtts: [],
            pending: new Map(),
            inSync: null,
            buffer: [],
            graceTimer: null,
            reactionTimes: [],
            acked: new Set(),
          };
          rt.clients.set(key, client);
        }
        const c = client;
        rt.emptySince = null;
        controller.enqueue(
          frame("hello", {
            deviceId: c.id,
            name: c.name,
            role: c.role,
            serverTime: Date.now(),
            heartbeatMs: HEARTBEAT_MS,
          }),
        );
        if (c.role === "attendee") sendPresence(rt);
        void bootstrap(rt, c, p.lastSeq, connId).catch((e) => {
          logger.error("bootstrap failed", { code: rt.code, err: String(e) });
          c.buffer = null;
          sendTo(c, "error", { code: "bootstrap_failed", message: "Could not load room state" });
        });
      },
      cancel() {
        if (client) detach(rt, client, connId);
      },
    },
    new CountQueuingStrategy({ highWaterMark: 64 }),
  );
}

async function bootstrap(rt: Runtime, c: Client, lastSeq: number, connId: string) {
  const upTo = rt.seq;
  const plan = planResync(lastSeq, upTo);
  let replayed = 0;
  if (plan === "snapshot") {
    const rows = await listLiveItems(rt.roomId);
    const snap: SnapshotPayload = {
      seq: upTo,
      room: { code: rt.code, name: rt.name, description: rt.description, status: rt.status },
      settings: rt.settings,
      items: rows.map((r) => toPublicItem(r, rt.roomId)),
      presentation: rt.presentation,
      you: { deviceId: c.id, name: c.name, role: c.role },
    };
    write(c, frame("snapshot", snap));
  } else if (plan === "replay") {
    await rt.logWrites;
    const rows = await eventsAfter(rt.roomId, lastSeq, upTo);
    for (const r of rows) {
      write(c, frame(r.event, r.payloadJson, r.seq));
      replayed++;
    }
  }
  write(c, frame("ready", { seq: upTo, mode: plan, replayed }));
  if (c.role === "organizer") {
    write(
      c,
      frame("organizer_state", {
        devices: attendees(rt).map(toDeviceInfo),
        stats: computeStats(rt),
        logs: rt.logs.slice(-100),
        reactions: {},
      }),
    );
  }
  if (c.connId !== connId) return;
  const buffered = c.buffer ?? [];
  c.buffer = null;
  for (const b of buffered) write(c, b);
}

function detach(rt: Runtime, c: Client, connId: string) {
  if (c.connId !== connId) return; // replaced by a newer connection
  c.controller = null;
  c.buffer = null;
  if (c.role !== "attendee") {
    rt.clients.delete(c.key);
    return;
  }
  c.status = "reconnecting";
  sendPresence(rt);
  c.graceTimer = setTimeout(() => {
    if (c.status === "reconnecting") {
      rt.clients.delete(c.key);
      sendPresence(rt);
    }
  }, GRACE_MS);
}

export function kickClient(rt: Runtime, c: Client, reason: ServerEventMap["kicked"]["reason"]) {
  if (c.graceTimer) clearTimeout(c.graceTimer);
  try {
    // Bypass the bootstrap buffer: the client must learn about the kick even mid-handshake.
    c.controller?.enqueue(frame("kicked", { reason }));
    c.controller?.close();
  } catch {
    /* closed */
  }
  c.controller = null;
  rt.clients.delete(c.key);
  if (reason === "kicked") rt.banned.add(c.id);
}

// ------------------------------------------------------------------ measurements
export function handlePong(rt: Runtime, c: Client, id: string): { rttMs: number | null; lastMs: number | null } {
  const sent = c.pending.get(id);
  let last: number | null = null;
  if (sent !== undefined) {
    c.pending.delete(id);
    last = Math.min(Date.now() - sent, 10_000);
    c.rtts.push(last);
    if (c.rtts.length > 10) c.rtts.shift();
    scheduleDeviceList(rt);
  }
  return { rttMs: avgRtt(c), lastMs: last };
}

export function recordAcks(rt: Runtime, c: Client, seqs: number[]) {
  for (const s of seqs) {
    if (c.acked.has(s)) continue;
    c.acked.add(s);
    if (c.acked.size > 300) {
      const first = c.acked.values().next().value;
      if (first !== undefined) c.acked.delete(first);
    }
    const logId = rt.ackBySeq.get(s);
    const entry = logId ? rt.logIndex.get(logId) : undefined;
    if (entry && logId) {
      entry.acks++;
      rt.dirtyAcks.add(logId);
    }
  }
}

export function addReaction(rt: Runtime, c: Client, emoji: string): boolean {
  const now = Date.now();
  c.reactionTimes = c.reactionTimes.filter((t) => now - t < 2000);
  if (c.reactionTimes.length >= 5) return false;
  c.reactionTimes.push(now);
  rt.reactions[emoji] = (rt.reactions[emoji] ?? 0) + 1;
  rt.reactionTotal++;
  return true;
}

export function sendPointer(rt: Runtime, x: number, y: number, visible: boolean): boolean {
  const now = Date.now();
  if (visible && now - rt.lastPointerAt < 40) return false; // flood protection ≈ 25/s max
  rt.lastPointerAt = now;
  fanout(rt, "pointer_moved", { x, y, visible }, { roles: ["attendee", "display"], droppable: true });
  return true;
}

// ------------------------------------------------------------------ ticks
function ensureTicks() {
  const h = hub();
  if (h.ticking) return;
  h.ticking = true;
  const timer = setInterval(() => {
    h.tick++;
    for (const rt of h.live.values()) {
      try {
        tickRoom(rt, h.tick);
      } catch (e) {
        logger.error("tick failed", { code: rt.code, err: String(e) });
      }
    }
    // evict idle runtimes (state reloads lazily from the DB)
    if (h.tick % 60 === 0) {
      for (const [code, rt] of h.live) {
        if (rt.clients.size === 0 && rt.emptySince && Date.now() - rt.emptySince > 10 * 60_000) {
          h.live.delete(code);
        }
      }
    }
  }, 1000);
  timer.unref?.();
}

function tickRoom(rt: Runtime, tick: number) {
  const now = Date.now();
  if (rt.clients.size === 0) {
    rt.emptySince ??= now;
    return;
  }
  rt.emptySince = null;

  if (tick % 5 === 0) {
    for (const c of rt.clients.values()) {
      if (c.status !== "online") continue;
      for (const [id, t] of c.pending) if (now - t > 30_000) c.pending.delete(id);
      const id = nanoid(6);
      c.pending.set(id, now);
      sendTo(c, "ping", { id, t: now });
    }
  }

  const acks: Record<string, number> = {};
  for (const id of rt.dirtyAcks) {
    const e = rt.logIndex.get(id);
    if (e) acks[id] = e.acks;
  }
  rt.dirtyAcks.clear();
  fanout(rt, "stats_update", { stats: computeStats(rt), acks }, { roles: ORG });

  if (rt.reactionTotal > 0) {
    fanout(rt, "reaction_batch", { counts: rt.reactions, total: rt.reactionTotal }, { roles: ORG_DISPLAY });
    rt.reactions = {};
    rt.reactionTotal = 0;
  }

  if (tick % 10 === 0 && rt.status === "active") {
    void runExclusive(rt, async () => {
      const gone = await expireDue(rt.roomId);
      for (const row of gone) {
        broadcastSeq(rt, "content_removed", (seq) => ({ seq, id: row.id }));
      }
    }).catch((e) => logger.error("expiry failed", { err: String(e) }));
  }
}

/** Graceful shutdown (SIGTERM): end every stream so the HTTP server can close. */
export function closeAllStreams() {
  let n = 0;
  for (const rt of hub().live.values()) {
    for (const c of rt.clients.values()) {
      if (c.graceTimer) clearTimeout(c.graceTimer);
      try {
        c.controller?.close();
        n++;
      } catch {
        /* closed */
      }
    }
    rt.clients.clear();
  }
  return n;
}

export function liveRuntimeCount(): number {
  return hub().live.size;
}

export function isSequencedEvent(name: string) {
  return isSequenced(name);
}
