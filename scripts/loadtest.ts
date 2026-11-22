/**
 * CrowdCast load test: spawns N fake attendees, broadcasts announcements and reports delivery times.
 *
 *   npx tsx scripts/loadtest.ts [clients=300] [rounds=5]
 *   CROWDCAST_URL=http://192.168.1.20:3000 npx tsx scripts/loadtest.ts 300 10
 */
const BASE = (process.env.CROWDCAST_URL ?? "http://localhost:3000").replace(/\/$/, "");
const N = Number(process.argv[2] ?? 300);
const ROUNDS = Number(process.argv[3] ?? 5);

interface Created {
  code: string;
  token: string;
  ok: boolean;
}

const sentAt = new Map<string, number>();
const latencies: number[] = [];
const received = new Map<string, number>(); // title -> count
let ready = 0;
let connectFailures = 0;

function percentile(sorted: number[], p: number): number {
  if (!sorted.length) return NaN;
  return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))];
}

async function openClient(code: string, i: number, signal: AbortSignal): Promise<void> {
  const deviceId = `loadtest${String(i).padStart(5, "0")}${Math.random().toString(36).slice(2, 8)}`;
  try {
    const res = await fetch(`${BASE}/api/rooms/${code}/stream?role=attendee`, {
      headers: { "X-Device-Id": deviceId, "User-Agent": "crowdcast-loadtest" },
      signal,
    });
    if (!res.ok || !res.body) {
      connectFailures++;
      return;
    }
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = "";
    for (;;) {
      const { value, done } = await reader.read();
      if (done) return;
      buf += dec.decode(value, { stream: true });
      let idx: number;
      while ((idx = buf.indexOf("\n\n")) >= 0) {
        const frame = buf.slice(0, idx);
        buf = buf.slice(idx + 2);
        const ev = /^event: (.+)$/m.exec(frame)?.[1];
        if (ev === "ready") ready++;
        if (ev === "content_added") {
          const data = JSON.parse(/^data: (.+)$/m.exec(frame)?.[1] ?? "{}") as { item?: { title: string } };
          const title = data.item?.title ?? "";
          const t0 = sentAt.get(title);
          if (t0 !== undefined) {
            latencies.push(performance.now() - t0);
            received.set(title, (received.get(title) ?? 0) + 1);
          }
        }
      }
    }
  } catch {
    /* aborted at the end */
  }
}

async function main() {
  console.log(`CrowdCast load test → ${BASE}  (${N} clients, ${ROUNDS} broadcasts)`);
  const create = await fetch(`${BASE}/api/rooms`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: `Load test ${new Date().toISOString()}` }),
  });
  const room = (await create.json()) as Created;
  if (!room.ok) throw new Error(`Could not create room (HTTP ${create.status}) - is the server running?`);
  const ctrl = new AbortController();

  const t0 = performance.now();
  for (let i = 0; i < N; i += 50) {
    await Promise.all(Array.from({ length: Math.min(50, N - i) }, (_, k) => void openClient(room.code, i + k, ctrl.signal)));
  }
  const deadline = Date.now() + 15_000;
  while (ready + connectFailures < N && Date.now() < deadline) await new Promise((r) => setTimeout(r, 50));
  console.log(`connected ${ready}/${N} in ${(performance.now() - t0).toFixed(0)} ms${connectFailures ? `  (${connectFailures} failed)` : ""}`);

  for (let r = 0; r < ROUNDS; r++) {
    const title = `load-${r}-${Date.now()}`;
    sentAt.set(title, performance.now());
    const res = await fetch(`${BASE}/api/rooms/${room.code}/action`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${room.token}` },
      body: JSON.stringify({ type: "content_send", title, body: "x".repeat(200) }),
    });
    const ack = (await res.json()) as { delivered?: number };
    const waitUntil = Date.now() + 5000;
    while ((received.get(title) ?? 0) < ready && Date.now() < waitUntil) await new Promise((r2) => setTimeout(r2, 10));
    console.log(`  broadcast ${r + 1}/${ROUNDS}: server says delivered=${ack.delivered}, clients received=${received.get(title) ?? 0}/${ready}`);
    await new Promise((r2) => setTimeout(r2, 250));
  }

  const sorted = [...latencies].sort((a, b) => a - b);
  const sum = sorted.reduce((a, b) => a + b, 0);
  const expected = ready * ROUNDS;
  console.log("\nDelivery latency (POST sent → event received by each client)");
  console.log(`  deliveries : ${sorted.length}/${expected} (${((sorted.length / Math.max(1, expected)) * 100).toFixed(2)}%)`);
  console.log(`  min / avg  : ${sorted[0]?.toFixed(1)} / ${(sum / Math.max(1, sorted.length)).toFixed(1)} ms`);
  console.log(`  p50 / p95  : ${percentile(sorted, 50).toFixed(1)} / ${percentile(sorted, 95).toFixed(1)} ms`);
  console.log(`  p99 / max  : ${percentile(sorted, 99).toFixed(1)} / ${sorted[sorted.length - 1]?.toFixed(1)} ms`);
  const target = percentile(sorted, 95) < 200;
  console.log(`  target     : p95 < 200 ms  →  ${target ? "PASS" : "FAIL"}`);

  await fetch(`${BASE}/api/rooms/${room.code}/action`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${room.token}` },
    body: JSON.stringify({ type: "room_end" }),
  });
  ctrl.abort();
  process.exit(target && sorted.length === expected ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
