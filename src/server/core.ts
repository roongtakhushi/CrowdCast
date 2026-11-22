import { createHash, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import path from "node:path";
import { NextResponse, type NextRequest } from "next/server";
import { ZodError, type ZodType } from "zod";
import type { ApiErrorBody } from "@/shared/types";

// ---------------------------------------------------------------- config
function int(name: string, fallback: number): number {
  const v = Number(process.env[name]);
  return Number.isFinite(v) && v > 0 ? v : fallback;
}

export const config = {
  port: int("PORT", 3000),
  uploadDir: process.env.UPLOAD_DIR ?? path.join(/*turbopackIgnore: true*/ process.cwd(), "data", "uploads"),
  publicBaseUrl: process.env.PUBLIC_BASE_URL?.replace(/\/$/, "") || null,
  defaultMaxAttendees: int("MAX_ATTENDEES", 300),
  endedRetentionHours: int("ENDED_RETENTION_HOURS", 24),
  maxImageBytes: 10 * 1024 * 1024,
  maxPdfBytes: 30 * 1024 * 1024,
  rateCreatePerMin: int("RATE_CREATE_PER_MIN", 10),
  rateUploadPerMin: int("RATE_UPLOAD_PER_MIN", 40),
  rateJoinPerMin: int("RATE_JOIN_PER_MIN", 1200),
  ratePinPerMin: int("RATE_PIN_PER_MIN", 6),
} as const;

// ---------------------------------------------------------------- logger
type Level = "debug" | "info" | "warn" | "error";
const LEVELS: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };
const minLevel = LEVELS[(process.env.LOG_LEVEL as Level) in LEVELS ? (process.env.LOG_LEVEL as Level) : "info"];

function write(level: Level, msg: string, ctx?: Record<string, unknown>) {
  if (LEVELS[level] < minLevel) return;
  const line = JSON.stringify({ level, time: new Date().toISOString(), msg, ...ctx });
  (level === "error" ? process.stderr : process.stdout).write(line + "\n");
}

/** Structured JSON-lines logger (pino-compatible field names). */
export const logger = {
  debug: (msg: string, ctx?: Record<string, unknown>) => write("debug", msg, ctx),
  info: (msg: string, ctx?: Record<string, unknown>) => write("info", msg, ctx),
  warn: (msg: string, ctx?: Record<string, unknown>) => write("warn", msg, ctx),
  error: (msg: string, ctx?: Record<string, unknown>) => write("error", msg, ctx),
};

// ---------------------------------------------------------------- errors
export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

export const E = {
  badRequest: (msg: string, details?: unknown) => new ApiError(400, "bad_request", msg, details),
  unauthorized: (msg = "Organizer authentication required") => new ApiError(401, "unauthorized", msg),
  forbidden: (code = "forbidden", msg = "You are not allowed to do that") => new ApiError(403, code, msg),
  notFound: (msg = "Not found", code = "not_found") => new ApiError(404, code, msg),
  gone: (code: string, msg: string) => new ApiError(410, code, msg),
  tooLarge: (msg: string) => new ApiError(413, "payload_too_large", msg),
  unsupported: (msg: string) => new ApiError(415, "unsupported_media_type", msg),
  invalid: (msg: string, details?: unknown) => new ApiError(422, "invalid_file", msg, details),
  rateLimited: (retryAfterSec: number) =>
    new ApiError(429, "rate_limited", `Too many requests. Try again in ${retryAfterSec}s.`, { retryAfterSec }),
};

export function errorResponse(err: ApiError): NextResponse<ApiErrorBody> {
  const headers: Record<string, string> = {};
  if (err.status === 429 && typeof err.details === "object" && err.details) {
    headers["Retry-After"] = String((err.details as { retryAfterSec: number }).retryAfterSec);
  }
  return NextResponse.json(
    { ok: false, error: { code: err.code, message: err.message, details: err.details } },
    { status: err.status, headers },
  );
}

export function json<T extends Record<string, unknown>>(data: T, status = 200): NextResponse {
  return NextResponse.json({ ...data, ok: true }, { status, headers: { "Cache-Control": "no-store" } });
}

/** Reject cross-origin browser mutations (CORS is closed: same origin only). */
export function assertSameOrigin(req: NextRequest) {
  const origin = req.headers.get("origin");
  if (!origin) return;
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  try {
    if (new URL(origin).host !== host) throw E.forbidden("cross_origin", "Cross-origin requests are not allowed");
  } catch (e) {
    if (e instanceof ApiError) throw e;
    throw E.forbidden("cross_origin", "Bad Origin header");
  }
}

type Handler<C> = (req: NextRequest, ctx: C) => Promise<Response>;

/** Centralised error handling: every failure becomes the same JSON shape. */
export function route<C>(handler: Handler<C>): Handler<C> {
  return async (req, ctx) => {
    try {
      if (req.method !== "GET" && req.method !== "HEAD") assertSameOrigin(req);
      return await handler(req, ctx);
    } catch (e) {
      if (e instanceof ApiError) return errorResponse(e);
      if (e instanceof ZodError) {
        return errorResponse(
          new ApiError(400, "validation_error", e.issues[0]?.message ?? "Invalid request", e.issues),
        );
      }
      logger.error("unhandled route error", {
        path: req.nextUrl.pathname,
        err: e instanceof Error ? { message: e.message, stack: e.stack } : String(e),
      });
      return errorResponse(new ApiError(500, "internal_error", "Something went wrong"));
    }
  };
}

export async function readJson<T>(req: NextRequest, schema: ZodType<T>): Promise<T> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    throw E.badRequest("Body must be valid JSON");
  }
  return schema.parse(raw);
}

// ---------------------------------------------------------------- rate limit
interface Bucket {
  count: number;
  resetAt: number;
}
const g = globalThis as typeof globalThis & { __ccBuckets?: Map<string, Bucket> };
const buckets = (g.__ccBuckets ??= new Map<string, Bucket>());

/** Fixed-window limiter. Throws a 429 ApiError when exceeded. */
export function rateLimit(key: string, limit: number, windowMs = 60_000, now = Date.now()) {
  if (buckets.size > 5000) {
    for (const [k, b] of buckets) if (b.resetAt <= now) buckets.delete(k);
  }
  let b = buckets.get(key);
  if (!b || b.resetAt <= now) {
    b = { count: 0, resetAt: now + windowMs };
    buckets.set(key, b);
  }
  b.count++;
  if (b.count > limit) throw E.rateLimited(Math.max(1, Math.ceil((b.resetAt - now) / 1000)));
}

export function clientIp(req: NextRequest): string {
  const fwd = req.headers.get("x-forwarded-for");
  return fwd?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "local";
}

// ---------------------------------------------------------------- crypto
export function sha256(s: string): string {
  return createHash("sha256").update(s).digest("hex");
}

export function newToken(): string {
  return randomBytes(32).toString("base64url");
}

export function safeEqualHex(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}

export function hashPin(pin: string): string {
  const salt = randomBytes(16);
  return `s1:${salt.toString("hex")}:${scryptSync(pin, salt, 32).toString("hex")}`;
}

export function verifyPin(pin: string, stored: string): boolean {
  const [v, saltHex, hashHex] = stored.split(":");
  if (v !== "s1" || !saltHex || !hashHex) return false;
  const calc = scryptSync(pin, Buffer.from(saltHex, "hex"), 32).toString("hex");
  return safeEqualHex(calc, hashHex);
}

export function bearer(req: NextRequest): string | null {
  const h = req.headers.get("authorization");
  const m = h && /^Bearer\s+(.+)$/i.exec(h);
  return m ? m[1].trim() : null;
}
