import { and, eq, lt } from "drizzle-orm";
import { nanoid } from "nanoid";
import { db } from "@/db";
import { organizerSessions, rooms } from "@/db/schema";
import type { RoomSettings } from "@/shared/types";
import { config, E, hashPin, newToken, safeEqualHex, sha256, verifyPin } from "../core";
import { generateRoomCode } from "../utils/room-code";

export type RoomRow = typeof rooms.$inferSelect;

export const DEFAULT_SETTINGS: RoomSettings = {
  locked: false,
  requireName: false,
  reactionsEnabled: true,
  maxAttendees: config.defaultMaxAttendees,
};

export async function findRoomByCode(code: string): Promise<RoomRow | null> {
  const [row] = await db.select().from(rooms).where(eq(rooms.code, code)).limit(1);
  return row ?? null;
}

export async function requireRoom(code: string): Promise<RoomRow> {
  const row = await findRoomByCode(code);
  if (!row) throw E.notFound("Room not found", "room_not_found");
  return row;
}

async function uniqueCode(): Promise<string> {
  for (let i = 0; i < 20; i++) {
    const code = generateRoomCode();
    if (!(await findRoomByCode(code))) return code;
  }
  throw new Error("Could not allocate a room code");
}

export async function createRoom(input: { name: string; description: string; pin?: string }) {
  const token = newToken();
  const id = nanoid(16);
  const code = await uniqueCode();
  await db.insert(rooms).values({
    id,
    code,
    name: input.name,
    description: input.description,
    organizerTokenHash: sha256(token),
    pinHash: input.pin ? hashPin(input.pin) : null,
    settingsJson: DEFAULT_SETTINGS,
  });
  return { id, code, token };
}

export async function regenerateCode(roomId: string): Promise<string> {
  const code = await uniqueCode();
  await db.update(rooms).set({ code }).where(eq(rooms.id, roomId));
  return code;
}

/** Organizer token check: primary token or any PIN-login session. Hash comparison only. */
export async function verifyOrganizerToken(room: RoomRow, token: string | null): Promise<boolean> {
  if (!token) return false;
  const h = sha256(token);
  if (safeEqualHex(h, room.organizerTokenHash)) return true;
  const [s] = await db
    .select({ h: organizerSessions.tokenHash })
    .from(organizerSessions)
    .where(and(eq(organizerSessions.roomId, room.id), eq(organizerSessions.tokenHash, h)))
    .limit(1);
  return !!s;
}

export async function organizerLogin(room: RoomRow, pin: string): Promise<string> {
  if (!room.pinHash || !verifyPin(pin, room.pinHash)) {
    throw E.forbidden("invalid_pin", "Incorrect PIN");
  }
  const token = newToken();
  await db.insert(organizerSessions).values({ tokenHash: sha256(token), roomId: room.id });
  return token;
}

export async function setPin(roomId: string, pin: string | null) {
  await db.update(rooms).set({ pinHash: pin ? hashPin(pin) : null }).where(eq(rooms.id, roomId));
}

export async function saveSettings(roomId: string, settings: RoomSettings) {
  await db.update(rooms).set({ settingsJson: settings }).where(eq(rooms.id, roomId));
}

export async function markEnded(roomId: string) {
  await db.update(rooms).set({ status: "ended", endedAt: new Date() }).where(eq(rooms.id, roomId));
}

export async function expiredRooms(): Promise<RoomRow[]> {
  const cutoff = new Date(Date.now() - config.endedRetentionHours * 3600_000);
  return db.select().from(rooms).where(and(eq(rooms.status, "ended"), lt(rooms.endedAt, cutoff)));
}

export async function deleteRoomRow(roomId: string) {
  await db.delete(rooms).where(eq(rooms.id, roomId));
}
