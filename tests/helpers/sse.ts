import { parseFrames } from "@/lib/socket";

export interface Received {
  event: string;
  payload: Record<string, unknown>;
}

export interface TestClient {
  deviceId: string;
  events: Received[];
  status: number;
  close: () => void;
  waitFor: (pred: (e: Received) => boolean, ms?: number) => Promise<Received>;
  count: (event: string) => number;
}

export async function connect(
  base: string,
  code: string,
  opts: { deviceId: string; role?: "attendee" | "organizer" | "display"; token?: string; lastSeq?: number },
): Promise<TestClient> {
  const ctrl = new AbortController();
  const headers: Record<string, string> = { "X-Device-Id": opts.deviceId, "User-Agent": "crowdcast-test" };
  if (opts.token) headers.Authorization = `Bearer ${opts.token}`;
  const res = await fetch(`${base}/api/rooms/${code}/stream?role=${opts.role ?? "attendee"}&lastSeq=${opts.lastSeq ?? 0}`, {
    headers,
    signal: ctrl.signal,
  });
  const events: Received[] = [];
  const waiters: { pred: (e: Received) => boolean; resolve: (e: Received) => void }[] = [];
  if (res.ok && res.body) {
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = "";
    void (async () => {
      try {
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          buf += dec.decode(value, { stream: true });
          const parsed = parseFrames(buf);
          buf = parsed.rest;
          for (const f of parsed.events) {
            const ev: Received = { event: f.event, payload: JSON.parse(f.data) as Record<string, unknown> };
            events.push(ev);
            for (let i = waiters.length - 1; i >= 0; i--) {
              if (waiters[i].pred(ev)) waiters.splice(i, 1)[0].resolve(ev);
            }
          }
        }
      } catch {
        /* aborted */
      }
    })();
  } else {
    await res.text();
  }
  return {
    deviceId: opts.deviceId,
    events,
    status: res.status,
    close: () => ctrl.abort(),
    count: (event) => events.filter((e) => e.event === event).length,
    waitFor: (pred, ms = 5000) => {
      const hit = events.find(pred);
      if (hit) return Promise.resolve(hit);
      return new Promise((resolve, reject) => {
        const t = setTimeout(() => reject(new Error("timeout waiting for event")), ms);
        waiters.push({
          pred,
          resolve: (e) => {
            clearTimeout(t);
            resolve(e);
          },
        });
      });
    },
  };
}

export async function post(base: string, path: string, body: unknown, headers: Record<string, string> = {}) {
  const res = await fetch(`${base}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: (await res.json()) as Record<string, unknown> & { error?: { code: string } } };
}
