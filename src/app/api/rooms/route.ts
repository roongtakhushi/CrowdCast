import type { NextRequest } from "next/server";
import { clientIp, config, json, rateLimit, readJson, route } from "@/server/core";
import { networkInfo } from "@/server/services/access";
import { createRoom } from "@/server/services/rooms";
import { createRoomSchema } from "@/shared/schemas";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** POST /api/rooms: create a room. Returns code, secret organizer token and LAN join URL. */
export const POST = route(async (req: NextRequest) => {
  rateLimit(`create:${clientIp(req)}`, config.rateCreatePerMin);
  const body = await readJson(req, createRoomSchema);
  const room = await createRoom({ name: body.name, description: body.description, pin: body.pin });
  const base = networkInfo(req).baseUrl;
  return json(
    {
      code: room.code,
      token: room.token,
      joinUrl: `${base}/join/${room.code}`,
      hostUrl: `/host/${room.code}`,
    },
    201,
  );
});
