import type { NextRequest } from "next/server";
import { json, route } from "@/server/core";
import { networkInfo } from "@/server/services/access";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** All candidate LAN addresses + port, so the organizer can pick the right one. */
export const GET = route(async (req: NextRequest) => {
  return json({ ...networkInfo(req) });
});
