import type { NextRequest } from "next/server";
import { clientIp, E, json, rateLimit, readJson, route } from "@/server/core";
import { isOrganizer, parseCode, type CodeCtx } from "@/server/services/access";
import { performAction } from "@/server/services/actions";
import { getRuntime } from "@/server/services/hub";
import { actionSchema } from "@/shared/schemas";
import type { Role } from "@/shared/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * POST /api/rooms/:code/action: the client -> server channel. The body is a zod
 * discriminated union (one variant per socket-style event). Unknown events are
 * rejected with 400; organizer-only events are checked against the token here.
 * The JSON response is the acknowledgement (delivered-to count, seq, rtt...).
 */
export const POST = route(async (req: NextRequest, ctx: CodeCtx) => {
  const code = await parseCode(ctx);
  rateLimit(`action:${clientIp(req)}`, 12_000);
  const rt = await getRuntime(code);
  if (!rt) throw E.notFound("Room not found", "room_not_found");
  const action = await readJson(req, actionSchema);
  const organizer = await isOrganizer(req, rt);
  const hdrRole = req.headers.get("x-role");
  const role: Role = hdrRole === "display" ? "display" : hdrRole === "organizer" ? "organizer" : "attendee";
  const result = await performAction(rt, { organizer, role, deviceId: req.headers.get("x-device-id") }, action);
  return json({ ...result, ok: undefined } as Record<string, unknown>);
});
