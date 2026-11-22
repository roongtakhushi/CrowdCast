import type { NextRequest } from "next/server";
import { z } from "zod";
import { clientIp, config, E, rateLimit, route } from "@/server/core";
import { isOrganizer, parseCode, type CodeCtx } from "@/server/services/access";
import { checkAdmission, getRuntime, openStream } from "@/server/services/hub";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const querySchema = z.object({
  role: z.enum(["attendee", "organizer", "display"]).default("attendee"),
  lastSeq: z.coerce.number().int().nonnegative().catch(0).default(0),
  name: z.string().max(64).optional(),
});

/**
 * GET /api/rooms/:code/stream: the persistent server -> client channel (Server-Sent Events).
 * Headers: X-Device-Id (all roles), Authorization: Bearer <token> (organizer).
 * `lastSeq` triggers the sync handshake: replay of missed events, or a fresh snapshot.
 */
export const GET = route(async (req: NextRequest, ctx: CodeCtx) => {
  const code = await parseCode(ctx);
  rateLimit(`join:${clientIp(req)}`, config.rateJoinPerMin);
  const q = querySchema.parse(Object.fromEntries(req.nextUrl.searchParams));
  const deviceId = req.headers.get("x-device-id") ?? "";
  if (!/^[A-Za-z0-9_-]{8,64}$/.test(deviceId)) throw E.badRequest("Missing or invalid X-Device-Id");

  const rt = await getRuntime(code);
  if (!rt) throw E.notFound("Room not found", "room_not_found");
  if (q.role === "organizer" && !(await isOrganizer(req, rt))) throw E.unauthorized("Invalid organizer token");
  checkAdmission(rt, q.role, deviceId);

  const stream = openStream(rt, {
    deviceId,
    role: q.role,
    requestedName: q.name ?? null,
    userAgent: req.headers.get("user-agent"),
    lastSeq: q.lastSeq,
  });
  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
});
