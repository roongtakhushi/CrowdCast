import type { NextRequest } from "next/server";
import { json, route } from "@/server/core";
import { parseCode, type CodeCtx } from "@/server/services/access";
import { getRuntime, onlineAttendeeCount } from "@/server/services/hub";
import { findRoomByCode } from "@/server/services/rooms";
import { E } from "@/server/core";
import type { PublicRoom } from "@/shared/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** GET /api/rooms/:code: public room info (name, status, locked). */
export const GET = route(async (_req: NextRequest, ctx: CodeCtx) => {
  const code = await parseCode(ctx);
  const room = await findRoomByCode(code);
  if (!room) throw E.notFound("Room not found", "room_not_found");
  const rt = await getRuntime(code);
  const settings = rt?.settings ?? room.settingsJson;
  const room_: PublicRoom = {
    code: room.code,
    name: room.name,
    description: room.description,
    status: room.status === "ended" ? "ended" : "active",
    locked: settings.locked,
    full: rt ? onlineAttendeeCount(rt) >= settings.maxAttendees : false,
    requireName: settings.requireName,
    reactionsEnabled: settings.reactionsEnabled,
    hasPin: !!room.pinHash,
  };
  return json({ room: room_ });
});
