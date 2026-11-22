import { planResync } from "@/shared/seq";
import { ORGANIZER_ACTIONS, type Action, type ActionResult } from "@/shared/schemas";
import type { ContentItem, Role, RoomSettings } from "@/shared/types";
import { E } from "../core";
import {
  getItem,
  insertItem,
  loadPresentation,
  savePresentation,
  toPublicItem,
  updateItem,
  eventsAfter,
  type ContentRow,
} from "./content";
import {
  addReaction,
  broadcastSeq,
  fanout,
  findClient,
  handlePong,
  kickClient,
  onlineAttendeeCount,
  recordAcks,
  rekeyRuntime,
  runExclusive,
  scheduleDeviceList,
  sendPointer,
  type Runtime,
} from "./hub";
import { markEnded, regenerateCode, saveSettings, setPin } from "./rooms";

export interface ActionContext {
  organizer: boolean;
  role: Role;
  deviceId: string | null;
}

/** Publish a freshly inserted item to the room. Caller must hold the room lock. */
export function publishAdded(rt: Runtime, row: ContentRow): ActionResult {
  const item: ContentItem = toPublicItem(row, rt.roomId);
  const r = broadcastSeq(rt, "content_added", (seq) => ({ seq, item }));
  rt.itemsBroadcast++;
  return { ok: true, seq: r.seq, delivered: r.attendees, recipients: r.recipients, data: { item } };
}

function publishUpdated(rt: Runtime, row: ContentRow): ActionResult {
  const item = toPublicItem(row, rt.roomId);
  const r = broadcastSeq(rt, "content_updated", (seq) => ({ seq, item }));
  return { ok: true, seq: r.seq, delivered: r.attendees, recipients: r.recipients, data: { item } };
}

async function refreshPresentation(rt: Runtime) {
  rt.presentation = await loadPresentation(rt.roomId);
}

export async function startPresentation(rt: Runtime, contentId: string, slide: number): Promise<ActionResult> {
  const item = await getItem(rt.roomId, contentId);
  if (!item || item.type !== "pdf") throw E.badRequest("Only PDFs can be presented");
  await savePresentation(rt.roomId, {
    active: true,
    contentId,
    currentSlide: Math.min(slide, Math.max(0, (item.pageCount ?? 1) - 1)),
    blank: false,
    // reset for everyone
  });
  await refreshPresentation(rt);
  for (const c of rt.clients.values()) c.inSync = null;
  const r = broadcastSeq(rt, "presentation_state", (seq) => ({ seq, state: rt.presentation }));
  return { ok: true, seq: r.seq, delivered: r.attendees, recipients: r.recipients };
}

async function stopPresentation(rt: Runtime): Promise<ActionResult> {
  await savePresentation(rt.roomId, {
    active: false,
    contentId: rt.presentation.contentId,
    currentSlide: rt.presentation.currentSlide,
    blank: false,
  });
  await refreshPresentation(rt);
  const r = broadcastSeq(rt, "presentation_state", (seq) => ({ seq, state: rt.presentation }));
  return { ok: true, seq: r.seq, delivered: r.attendees, recipients: r.recipients };
}

export async function performAction(rt: Runtime, ctx: ActionContext, a: Action): Promise<ActionResult> {
  if (ORGANIZER_ACTIONS.has(a.type) && !ctx.organizer) {
    throw E.forbidden("organizer_only", "Only the organizer can do that");
  }
  const mutating = ORGANIZER_ACTIONS.has(a.type);
  if (mutating && rt.status === "ended") throw E.gone("room_ended", "This event has ended.");

  const role: Role = ctx.organizer ? "organizer" : ctx.role === "display" ? "display" : "attendee";
  const me = ctx.deviceId ? findClient(rt, role, ctx.deviceId) : undefined;
  const needsDevice = a.type === "ping_measure" || a.type === "ack" || a.type === "view_state" || a.type === "reaction_send";
  if (needsDevice && !me) throw E.notFound("Device is not connected to this room", "not_connected");

  switch (a.type) {
    case "ping_measure": {
      const r = handlePong(rt, me!, a.id);
      return { ok: true, rttMs: r.rttMs, data: { lastMs: r.lastMs } };
    }
    case "ack":
      recordAcks(rt, me!, a.seqs);
      return { ok: true };
    case "view_state":
      if (me!.inSync !== a.inSync) {
        me!.inSync = a.inSync;
        scheduleDeviceList(rt);
      }
      return { ok: true };
    case "reaction_send": {
      if (!rt.settings.reactionsEnabled) throw E.forbidden("reactions_disabled", "Reactions are turned off");
      if (me!.muted) throw E.forbidden("muted", "You have been muted by the organizer");
      const ok = addReaction(rt, me!, a.emoji);
      return { ok: true, dropped: !ok };
    }
    case "sync_request": {
      const plan = planResync(a.lastSeq, rt.seq);
      if (plan !== "replay") return { ok: true, seq: rt.seq, data: { plan } };
      await rt.logWrites;
      const rows = await eventsAfter(rt.roomId, a.lastSeq, rt.seq);
      return {
        ok: true,
        seq: rt.seq,
        data: { plan, events: rows.map((r) => ({ event: r.event, seq: r.seq, payload: r.payloadJson })) },
      };
    }

    case "content_send":
      return runExclusive(rt, async () => {
        const row = await insertItem({
          roomId: rt.roomId,
          seq: rt.seq + 1,
          type: "announcement",
          title: a.title,
          body: a.body,
          priority: a.priority,
          pinned: a.pinned,
          expireMinutes: a.expireMinutes,
          deliveredTo: onlineAttendeeCount(rt),
        });
        return publishAdded(rt, row);
      });

    case "content_resend":
      return runExclusive(rt, async () => {
        const src = await getItem(rt.roomId, a.id);
        if (!src) throw E.notFound("Item not found", "item_not_found");
        const row = await insertItem({
          roomId: rt.roomId,
          seq: rt.seq + 1,
          type: src.type as "announcement" | "image" | "pdf",
          title: src.title,
          body: src.body,
          priority: src.priority as "normal" | "important" | "urgent",
          pinned: false,
          filePath: src.filePath,
          thumbPath: src.thumbPath,
          mime: src.mime,
          sizeBytes: src.sizeBytes,
          pageCount: src.pageCount,
          deliveredTo: onlineAttendeeCount(rt),
        });
        return publishAdded(rt, row);
      });

    case "content_edit":
      return runExclusive(rt, async () => {
        const src = await getItem(rt.roomId, a.id);
        if (!src) throw E.notFound("Item not found", "item_not_found");
        const patch: Parameters<typeof updateItem>[2] = {};
        if (a.title !== undefined) patch.title = a.title;
        if (a.body !== undefined) patch.body = a.body;
        if (a.priority !== undefined) patch.priority = a.priority;
        if (a.expireMinutes !== undefined) {
          patch.expiresAt = a.expireMinutes ? new Date(Date.now() + a.expireMinutes * 60_000) : null;
        }
        const row = await updateItem(rt.roomId, a.id, patch);
        if (!row) throw E.notFound("Item not found", "item_not_found");
        return publishUpdated(rt, row);
      });

    case "content_pin":
      return runExclusive(rt, async () => {
        const row = await updateItem(rt.roomId, a.id, { pinned: a.pinned });
        if (!row || row.deletedAt) throw E.notFound("Item not found", "item_not_found");
        return publishUpdated(rt, row);
      });

    case "content_delete":
      return runExclusive(rt, async () => {
        const src = await getItem(rt.roomId, a.id);
        if (!src) throw E.notFound("Item not found", "item_not_found");
        await updateItem(rt.roomId, a.id, { deletedAt: new Date() });
        if (rt.presentation.active && rt.presentation.contentId === a.id) await stopPresentation(rt);
        const r = broadcastSeq(rt, "content_removed", (seq) => ({ seq, id: a.id }));
        return { ok: true, seq: r.seq, delivered: r.attendees, recipients: r.recipients };
      });

    case "presentation_start":
      return runExclusive(rt, () => startPresentation(rt, a.contentId, a.slide));

    case "presentation_stop":
      return runExclusive(rt, () => stopPresentation(rt));

    case "slide_change":
      return runExclusive(rt, async () => {
        if (!rt.presentation.active) throw E.badRequest("No presentation is running");
        const slide = Math.min(a.slide, Math.max(0, rt.presentation.pageCount - 1));
        if (slide === rt.presentation.currentSlide) return { ok: true, seq: rt.seq };
        await savePresentation(rt.roomId, {
          active: true,
          contentId: rt.presentation.contentId,
          currentSlide: slide,
          blank: rt.presentation.blank,
        });
        await refreshPresentation(rt);
        const r = broadcastSeq(rt, "slide_changed", (seq) => ({
          seq,
          currentSlide: slide,
          updatedAt: rt.presentation.updatedAt,
        }));
        return { ok: true, seq: r.seq, delivered: r.attendees, recipients: r.recipients };
      });

    case "blank_toggle":
      return runExclusive(rt, async () => {
        if (!rt.presentation.active) throw E.badRequest("No presentation is running");
        await savePresentation(rt.roomId, {
          active: true,
          contentId: rt.presentation.contentId,
          currentSlide: rt.presentation.currentSlide,
          blank: a.blank,
        });
        await refreshPresentation(rt);
        const r = broadcastSeq(rt, "presentation_state", (seq) => ({ seq, state: rt.presentation }));
        return { ok: true, seq: r.seq, delivered: r.attendees, recipients: r.recipients };
      });

    case "pointer_move": {
      if (!rt.presentation.active) return { ok: true, dropped: true };
      return { ok: true, dropped: !sendPointer(rt, a.x, a.y, a.visible) };
    }

    case "device_kick": {
      const c = findClient(rt, "attendee", a.deviceId);
      if (!c) throw E.notFound("Device not found", "device_not_found");
      kickClient(rt, c, "kicked");
      scheduleDeviceList(rt);
      return { ok: true };
    }

    case "device_mute": {
      const c = findClient(rt, "attendee", a.deviceId);
      if (!c) throw E.notFound("Device not found", "device_not_found");
      c.muted = a.muted;
      scheduleDeviceList(rt);
      return { ok: true };
    }

    case "room_settings_update":
      return runExclusive(rt, async () => {
        const next: RoomSettings = { ...rt.settings, ...(a.settings ?? {}) };
        rt.settings = next;
        await saveSettings(rt.roomId, next);
        if (a.pin !== undefined) await setPin(rt.roomId, a.pin);
        const r = broadcastSeq(rt, "room_state_changed", (seq) => ({ seq, status: rt.status, settings: next }));
        return { ok: true, seq: r.seq, data: { settings: next, hasPin: a.pin === undefined ? undefined : a.pin !== null } };
      });

    case "room_end":
      return runExclusive(rt, async () => {
        if (rt.presentation.active) await stopPresentation(rt);
        await markEnded(rt.roomId);
        rt.status = "ended";
        const r = broadcastSeq(rt, "room_state_changed", (seq) => ({ seq, status: "ended", settings: rt.settings }));
        return { ok: true, seq: r.seq };
      });

    case "room_regenerate":
      return runExclusive(rt, async () => {
        const oldCode = rt.code;
        const newCode = await regenerateCode(rt.roomId);
        // The old link stops working: everyone but the organizer is removed.
        for (const c of [...rt.clients.values()]) {
          if (c.role !== "organizer") kickClient(rt, c, "code_rotated");
        }
        rekeyRuntime(oldCode, rt, newCode);
        fanout(rt, "room_state_changed", { seq: rt.seq, status: rt.status, settings: rt.settings }, { roles: ["organizer"] });
        return { ok: true, data: { code: newCode } };
      });
  }
}
