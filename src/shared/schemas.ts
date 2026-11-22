import { z } from "zod";
import { PRIORITIES, REACTION_EMOJIS } from "./types";

/** Zod schemas for every client -> server action. Unknown actions are rejected. */
export const prioritySchema = z.enum(PRIORITIES);

const title = z.string().trim().max(120);
const body = z.string().max(5000);
const id = z.string().min(1).max(64);

export const settingsSchema = z.object({
  locked: z.boolean(),
  requireName: z.boolean(),
  reactionsEnabled: z.boolean(),
  maxAttendees: z.number().int().min(1).max(1000),
});

export const createRoomSchema = z.object({
  name: z.string().trim().min(2, "Event name must be at least 2 characters").max(80),
  description: z.string().trim().max(500).optional().default(""),
  pin: z
    .string()
    .trim()
    .regex(/^[A-Za-z0-9]{4,12}$/, "PIN must be 4-12 letters or digits")
    .optional()
    .or(z.literal("").transform(() => undefined)),
});

export const organizerLoginSchema = z.object({
  pin: z.string().min(1).max(64),
});

export const roomCodeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{6}$/, "Room codes are 6 characters");

export const actionSchema = z.discriminatedUnion("type", [
  // ----- any connected device -----
  z.object({ type: z.literal("ping_measure"), id: z.string().min(1).max(40) }),
  z.object({ type: z.literal("ack"), seqs: z.array(z.number().int().nonnegative()).max(50) }),
  z.object({ type: z.literal("view_state"), inSync: z.boolean() }),
  z.object({ type: z.literal("reaction_send"), emoji: z.enum(REACTION_EMOJIS) }),
  z.object({ type: z.literal("sync_request"), lastSeq: z.number().int().nonnegative() }),
  // ----- organizer only -----
  z.object({
    type: z.literal("content_send"),
    title,
    body,
    priority: prioritySchema.default("normal"),
    pinned: z.boolean().default(false),
    expireMinutes: z.number().int().min(1).max(1440).nullable().default(null),
  }),
  z.object({
    type: z.literal("content_edit"),
    id,
    title: title.optional(),
    body: body.optional(),
    priority: prioritySchema.optional(),
    expireMinutes: z.number().int().min(1).max(1440).nullable().optional(),
  }),
  z.object({ type: z.literal("content_delete"), id }),
  z.object({ type: z.literal("content_pin"), id, pinned: z.boolean() }),
  z.object({ type: z.literal("content_resend"), id }),
  z.object({
    type: z.literal("presentation_start"),
    contentId: id,
    slide: z.number().int().min(0).max(5000).default(0),
  }),
  z.object({ type: z.literal("presentation_stop") }),
  z.object({ type: z.literal("slide_change"), slide: z.number().int().min(0).max(5000) }),
  z.object({
    type: z.literal("pointer_move"),
    x: z.number().min(0).max(1),
    y: z.number().min(0).max(1),
    visible: z.boolean(),
  }),
  z.object({ type: z.literal("blank_toggle"), blank: z.boolean() }),
  z.object({ type: z.literal("device_kick"), deviceId: id }),
  z.object({ type: z.literal("device_mute"), deviceId: id, muted: z.boolean() }),
  z.object({
    type: z.literal("room_settings_update"),
    settings: settingsSchema.partial().optional(),
    pin: z
      .string()
      .regex(/^[A-Za-z0-9]{4,12}$/)
      .nullable()
      .optional(),
  }),
  z.object({ type: z.literal("room_end") }),
  z.object({ type: z.literal("room_regenerate") }),
]);

export type Action = z.infer<typeof actionSchema>;
export type ActionInput = z.input<typeof actionSchema>;
export type ActionType = Action["type"];

/** Actions that MUST carry a valid organizer token. Enforced server-side. */
export const ORGANIZER_ACTIONS: ReadonlySet<ActionType> = new Set<ActionType>([
  "content_send",
  "content_edit",
  "content_delete",
  "content_pin",
  "content_resend",
  "presentation_start",
  "presentation_stop",
  "slide_change",
  "pointer_move",
  "blank_toggle",
  "device_kick",
  "device_mute",
  "room_settings_update",
  "room_end",
  "room_regenerate",
]);

export interface ActionResult {
  ok: true;
  seq?: number;
  delivered?: number;
  recipients?: number;
  dropped?: boolean;
  rttMs?: number | null;
  data?: Record<string, unknown>;
}
