import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { bearer, config, E, sha256 } from "../core";
import { listLanCandidates, pickPrimary } from "../utils/lan";
import { isValidRoomCode } from "../utils/room-code";
import { serverUptimeSec, type Runtime } from "./hub";
import { findRoomByCode, verifyOrganizerToken } from "./rooms";
import type { NetworkInfo } from "@/shared/types";

export interface CodeCtx {
  params: Promise<{ code: string }>;
}

export async function parseCode(ctx: CodeCtx): Promise<string> {
  const code = (await ctx.params).code.trim().toUpperCase();
  if (!isValidRoomCode(code)) throw E.notFound("Room not found", "room_not_found");
  return code;
}

const authCache = new WeakMap<Runtime, Map<string, number>>();

/** Validates the organizer bearer token (cached 60s per room so pointer streams stay cheap). */
export async function isOrganizer(req: NextRequest, rt: Runtime): Promise<boolean> {
  const token = bearer(req);
  if (!token) return false;
  const h = sha256(token);
  let cache = authCache.get(rt);
  if (!cache) authCache.set(rt, (cache = new Map()));
  const exp = cache.get(h);
  if (exp && exp > Date.now()) return true;
  const room = await findRoomByCode(rt.code);
  if (!room || !(await verifyOrganizerToken(room, token))) return false;
  cache.set(h, Date.now() + 60_000);
  return true;
}

export async function requireOrganizer(req: NextRequest, rt: Runtime) {
  if (!bearer(req)) throw E.unauthorized();
  if (!(await isOrganizer(req, rt))) throw E.forbidden("organizer_only", "Invalid organizer token");
}

export function requestPort(req: NextRequest): number {
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? "";
  const m = /:(\d+)$/.exec(host);
  return m ? Number(m[1]) : config.port;
}

export function networkInfo(req: NextRequest): NetworkInfo {
  const candidates = listLanCandidates();
  const primary = pickPrimary(candidates);
  const port = requestPort(req);
  return {
    candidates,
    primary,
    port,
    uptimeSec: serverUptimeSec(),
    baseUrl: config.publicBaseUrl ?? `http://${primary ?? "localhost"}:${port}`,
    platform: process.platform,
    hostname: process.env.HOSTNAME ?? "",
  };
}

export function noStore<T>(res: NextResponse<T>): NextResponse<T> {
  res.headers.set("Cache-Control", "no-store");
  return res;
}
