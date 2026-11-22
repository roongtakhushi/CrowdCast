import type { NextRequest } from "next/server";
import { clientIp, config, E, json, rateLimit, readJson, route } from "@/server/core";
import { parseCode, type CodeCtx } from "@/server/services/access";
import { findRoomByCode, organizerLogin } from "@/server/services/rooms";
import { organizerLoginSchema } from "@/shared/schemas";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** POST /api/rooms/:code/organizer-login: PIN login to get an organizer token on another device. */
export const POST = route(async (req: NextRequest, ctx: CodeCtx) => {
  const code = await parseCode(ctx);
  rateLimit(`pin:${code}:${clientIp(req)}`, config.ratePinPerMin);
  const { pin } = await readJson(req, organizerLoginSchema);
  const room = await findRoomByCode(code);
  if (!room) throw E.notFound("Room not found", "room_not_found");
  if (!room.pinHash) throw E.forbidden("no_pin", "This room has no organizer PIN set");
  const token = await organizerLogin(room, pin);
  return json({ code, token });
});
