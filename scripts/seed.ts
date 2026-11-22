/**
 * Demo seed: creates a sample room with announcements, images and a PDF so the UI can be reviewed
 * immediately.   npx tsx scripts/seed.ts [--present]
 *
 * The organizer PIN is 1234: open /host/<CODE>, sign in with it.
 */
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import sharp from "sharp";

const BASE = (process.env.CROWDCAST_URL ?? "http://localhost:3000").replace(/\/$/, "");
const PRESENT = process.argv.includes("--present");

async function api<T>(path: string, init: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, init);
  const body = (await res.json()) as T & { ok?: boolean; error?: { message: string } };
  if (!res.ok || !body.ok) throw new Error(`${path}: ${body.error?.message ?? res.status}`);
  return body;
}

async function main() {
  const room = await api<{ code: string; token: string; joinUrl: string }>("/api/rooms", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: "Tech Fest 2026 · Keynote", description: "Demo room created by scripts/seed.ts", pin: "1234" }),
  });
  const auth = { Authorization: `Bearer ${room.token}` };
  const act = (body: object) =>
    api<{ delivered: number }>(`/api/rooms/${room.code}/action`, { method: "POST", headers: { ...auth, "Content-Type": "application/json" }, body: JSON.stringify(body) });

  await act({ type: "content_send", title: "Welcome to Tech Fest 🎉", body: "Doors are open. Grab a badge at the front desk.\nSchedule & maps: https://example.com/schedule", priority: "normal", pinned: true });
  await act({ type: "content_send", title: "Lunch moves to Hall B", body: "Lunch is served 12:30–13:30 in Hall B (not Hall A).", priority: "important" });
  await act({ type: "content_send", title: "Fire drill at 15:00", body: "This is a scheduled drill. Please follow volunteers to the assembly point.", priority: "urgent", expireMinutes: 120 });

  const upload = async (blob: Blob, name: string, fields: Record<string, string>) => {
    const form = new FormData();
    form.append("file", blob, name);
    for (const [k, v] of Object.entries(fields)) form.append(k, v);
    const res = await fetch(`${BASE}/api/rooms/${room.code}/upload`, { method: "POST", headers: auth, body: form });
    const body = (await res.json()) as { ok?: boolean; error?: { message: string } };
    if (!body.ok) throw new Error(`upload ${name}: ${body.error?.message}`);
  };

  const svg = (c1: string, c2: string, label: string) =>
    Buffer.from(
      `<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="1000"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${c1}"/><stop offset="1" stop-color="${c2}"/></linearGradient></defs><rect width="1600" height="1000" fill="url(#g)"/><text x="800" y="530" font-family="sans-serif" font-size="120" font-weight="700" fill="#fff" text-anchor="middle">${label}</text></svg>`,
    );
  for (const [c1, c2, label, caption] of [
    ["#4f46e5", "#0891b2", "Main Stage", "Main stage floor plan"],
    ["#be185d", "#f59e0b", "Hall B", "Lunch & networking: Hall B"],
  ]) {
    const png = await sharp(svg(c1, c2, label)).png().toBuffer();
    await upload(new Blob([new Uint8Array(png)], { type: "image/png" }), `${label}.png`, { kind: "image", title: label, caption });
  }

  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.HelveticaBold);
  const slides = ["CrowdCast", "One-to-many fan-out", "WebSockets & streams", "Latency (RTT)", "Reconnect & resync", "Thank you!"];
  slides.forEach((text, i) => {
    const page = doc.addPage([960, 540]);
    page.drawRectangle({ x: 0, y: 0, width: 960, height: 540, color: i % 2 ? rgb(0.06, 0.07, 0.13) : rgb(0.31, 0.27, 0.9) });
    page.drawText(text, { x: 60, y: 300, size: 64, font, color: rgb(1, 1, 1) });
    page.drawText(`Slide ${i + 1} of ${slides.length}`, { x: 60, y: 240, size: 24, font, color: rgb(0.8, 0.85, 1) });
  });
  const pdf = await doc.save();
  await upload(new Blob([new Uint8Array(pdf)], { type: "application/pdf" }), "Keynote.pdf", { kind: "pdf", title: "Keynote slides", mode: PRESENT ? "presentation" : "document" });

  console.log("\nSeeded demo room\n");
  console.log(`  Room code     : ${room.code}`);
  console.log(`  Attendee link : ${room.joinUrl}`);
  console.log(`  Organizer     : ${BASE}/host/${room.code}   (PIN 1234)`);
  console.log(`  Projector     : ${BASE}/present/${room.code}\n`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
