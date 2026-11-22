import type { ServerEventMap, ServerEventName } from "@/shared/events";
import type { ActionInput, ActionResult } from "@/shared/schemas";
import type { Role } from "@/shared/types";
import { api, ApiClientError } from "./api";

/**
 * The single realtime service module.
 *
 * Down-link: a persistent HTTP stream (Server-Sent Events over fetch) that the server
 * fans events out on. Up-link: acknowledged POSTs to /action. Reconnects with
 * exponential backoff + jitter and performs the sync handshake with `lastSeq`.
 */
export type ConnStatus = "connecting" | "connected" | "reconnecting" | "offline" | "closed";
export interface FatalInfo {
  code: string;
  message: string;
}

export type ServerEvent = {
  [K in ServerEventName]: { name: K; payload: ServerEventMap[K] };
}[ServerEventName];

export interface RealtimeOptions {
  code: string;
  role: Role;
  deviceId: string;
  token?: string | null;
  name?: string | null;
  getLastSeq: () => number;
  onEvent: (ev: ServerEvent) => void;
  onStatus: (status: ConnStatus, attempt: number) => void;
  onFatal: (info: FatalInfo) => void;
}

const FATAL_STATUS = new Set([400, 401, 403, 404, 410]);
const STALE_MS = 18_000;

export function parseFrames(buf: string): { events: { event: string; data: string }[]; rest: string } {
  const events: { event: string; data: string }[] = [];
  let rest = buf;
  let idx: number;
  while ((idx = rest.indexOf("\n\n")) >= 0) {
    const raw = rest.slice(0, idx);
    rest = rest.slice(idx + 2);
    let event = "message";
    const data: string[] = [];
    for (const line of raw.split("\n")) {
      if (line.startsWith("event:")) event = line.slice(6).trim();
      else if (line.startsWith("data:")) data.push(line.slice(5).trimStart());
    }
    if (data.length) events.push({ event, data: data.join("\n") });
  }
  return { events, rest };
}

export class RealtimeClient {
  private stopped = false;
  private ctrl: AbortController | null = null;
  private attempt = 0;
  private lastActivity = Date.now();
  private watchdog: ReturnType<typeof setInterval> | null = null;
  private wake: (() => void) | null = null;
  private status: ConnStatus = "connecting";

  constructor(private o: RealtimeOptions) {}

  start() {
    this.stopped = false;
    window.addEventListener("online", this.onOnline);
    window.addEventListener("offline", this.onOffline);
    document.addEventListener("visibilitychange", this.onVisible);
    this.watchdog = setInterval(() => {
      if (this.status === "connected" && Date.now() - this.lastActivity > STALE_MS) this.resync();
    }, 3000);
    void this.loop();
  }

  stop() {
    this.stopped = true;
    window.removeEventListener("online", this.onOnline);
    window.removeEventListener("offline", this.onOffline);
    document.removeEventListener("visibilitychange", this.onVisible);
    if (this.watchdog) clearInterval(this.watchdog);
    this.ctrl?.abort();
    this.wake?.();
    this.setStatus("closed");
  }

  /** Drop the current stream and reconnect immediately (gap detected / stale link). */
  resync() {
    this.ctrl?.abort();
    this.wake?.();
  }

  private onOnline = () => this.resync();
  private onOffline = () => {
    this.setStatus("offline");
  };
  private onVisible = () => {
    if (document.visibilityState === "visible" && Date.now() - this.lastActivity > STALE_MS) this.resync();
  };

  private setStatus(s: ConnStatus) {
    this.status = s;
    this.o.onStatus(s, this.attempt);
  }

  private headers(): Record<string, string> {
    const h: Record<string, string> = { "X-Device-Id": this.o.deviceId, "X-Role": this.o.role };
    if (this.o.token) h.Authorization = `Bearer ${this.o.token}`;
    return h;
  }

  private sleep(ms: number) {
    return new Promise<void>((resolve) => {
      const t = setTimeout(resolve, ms);
      this.wake = () => {
        clearTimeout(t);
        resolve();
      };
    }).finally(() => {
      this.wake = null;
    });
  }

  private async loop() {
    let everConnected = false;
    while (!this.stopped) {
      const ctrl = new AbortController();
      this.ctrl = ctrl;
      this.setStatus(everConnected || this.attempt > 0 ? (navigator.onLine ? "reconnecting" : "offline") : "connecting");
      let retryAfter = 0;
      try {
        const q = new URLSearchParams({ role: this.o.role, lastSeq: String(this.o.getLastSeq()) });
        if (this.o.name) q.set("name", this.o.name);
        const res = await fetch(`/api/rooms/${this.o.code}/stream?${q}`, {
          headers: this.headers(),
          signal: ctrl.signal,
          cache: "no-store",
        });
        if (!res.ok || !res.body) {
          const body = (await res.json().catch(() => null)) as { error?: { code: string; message: string } } | null;
          const err = { code: body?.error?.code ?? "http_error", message: body?.error?.message ?? `HTTP ${res.status}` };
          if (res.status === 429) retryAfter = Number(res.headers.get("retry-after") ?? 2) * 1000;
          else if (FATAL_STATUS.has(res.status)) return this.fatal(err);
          throw new Error(err.message);
        }
        this.lastActivity = Date.now();
        const reader = res.body.getReader();
        const dec = new TextDecoder();
        let buf = "";
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          this.lastActivity = Date.now();
          buf += dec.decode(value, { stream: true });
          const parsed = parseFrames(buf);
          buf = parsed.rest;
          for (const f of parsed.events) {
            if (this.stopped) return;
            let payload: unknown;
            try {
              payload = JSON.parse(f.data);
            } catch {
              continue;
            }
            if (f.event === "ready") {
              everConnected = true;
              this.attempt = 0;
              this.setStatus("connected");
            }
            if (f.event === "error" && (payload as { code?: string }).code === "replaced") {
              return this.fatal({ code: "replaced", message: "CrowdCast is open in another tab on this device." });
            }
            if (f.event === "kicked") {
              const reason = (payload as { reason: string }).reason;
              return this.fatal({ code: reason, message: reason });
            }
            this.o.onEvent({ name: f.event, payload } as ServerEvent);
          }
        }
      } catch {
        if (this.stopped) return;
      }
      if (this.stopped) return;
      this.attempt++;
      this.setStatus(navigator.onLine ? "reconnecting" : "offline");
      const backoff = Math.min(10_000, 400 * 2 ** Math.min(this.attempt, 5));
      await this.sleep(Math.max(retryAfter, backoff + Math.random() * 400));
    }
  }

  private fatal(info: FatalInfo) {
    this.stopped = true;
    this.ctrl?.abort();
    if (this.watchdog) clearInterval(this.watchdog);
    window.removeEventListener("online", this.onOnline);
    window.removeEventListener("offline", this.onOffline);
    document.removeEventListener("visibilitychange", this.onVisible);
    this.setStatus("closed");
    this.o.onFatal(info);
  }

  /** Send an action and await the server's acknowledgement. */
  send(action: ActionInput): Promise<ActionResult> {
    return api.action(this.o.code, action, this.headers());
  }
}

export function isApiError(e: unknown): e is ApiClientError {
  return e instanceof ApiClientError;
}
