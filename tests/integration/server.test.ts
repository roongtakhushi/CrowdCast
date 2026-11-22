import { PDFDocument } from "pdf-lib";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { connect, post } from "../helpers/sse";

/** Run against a live server:  CROWDCAST_URL=http://localhost:3000 npx vitest run tests/integration */
const BASE = process.env.CROWDCAST_URL;
const d = describe.skipIf(!BASE);
const base = BASE ?? "";

async function createRoom() {
  const r = await post(base, "/api/rooms", { name: "Integration Room", pin: "4321" });
  expect(r.status).toBe(201);
  return { code: r.body.code as string, token: r.body.token as string };
}
const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
const id = (n: number) => `testdevice${String(n).padStart(4, "0")}x`;

async function upload(code: string, token: string, file: Blob, name: string, kind: string, extra: Record<string, string> = {}) {
  const form = new FormData();
  form.append("file", file, name);
  form.append("kind", kind);
  for (const [k, v] of Object.entries(extra)) form.append(k, v);
  const res = await fetch(`${base}/api/rooms/${code}/upload`, { method: "POST", headers: auth(token), body: form });
  return { status: res.status, body: (await res.json()) as Record<string, unknown> & { error?: { code: string } } };
}

d("CrowdCast server (integration)", () => {
  it("creates a room with a LAN-style join URL and public info", async () => {
    const { code } = await createRoom();
    expect(code).toMatch(/^[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{6}$/);
    const info = await fetch(`${base}/api/rooms/${code}`).then((r) => r.json());
    expect(info.room).toMatchObject({ name: "Integration Room", status: "active", locked: false });
    const net = await fetch(`${base}/api/network-info`).then((r) => r.json());
    expect(Array.isArray(net.candidates)).toBe(true);
    expect((await fetch(`${base}/api/rooms/ZZZZZZ`)).status).toBe(404);
  });

  it("broadcasts to 20 clients exactly once each and reports delivery", async () => {
    const { code, token } = await createRoom();
    const org = await connect(base, code, { deviceId: "organizerdev01", role: "organizer", token });
    const clients = await Promise.all(Array.from({ length: 20 }, (_, i) => connect(base, code, { deviceId: id(i) })));
    await Promise.all(clients.map((c) => c.waitFor((e) => e.event === "ready")));
    await org.waitFor((e) => e.event === "presence_update" && e.payload.connected === 20);

    const t0 = Date.now();
    const res = await post(base, `/api/rooms/${code}/action`, { type: "content_send", title: "Hello", body: "World" }, auth(token));
    expect(res.status).toBe(200);
    expect(res.body.delivered).toBe(20);
    await Promise.all(clients.map((c) => c.waitFor((e) => e.event === "content_added")));
    expect(Date.now() - t0).toBeLessThan(2000);
    for (const c of clients) expect(c.count("content_added")).toBe(1);

    // acks flow back and the organizer's event log reflects them
    await Promise.all(clients.map((c, i) => post(base, `/api/rooms/${code}/action`, { type: "ack", seqs: [res.body.seq] }, { "X-Device-Id": id(i) })));
    const stats = await org.waitFor((e) => e.event === "stats_update" && Object.values(e.payload.acks as Record<string, number>).includes(20), 4000);
    expect(stats).toBeTruthy();

    clients.forEach((c) => c.close());
    org.close();
  });

  it("rejects organizer-only actions from attendees and unknown events", async () => {
    const { code, token } = await createRoom();
    const c = await connect(base, code, { deviceId: id(1) });
    await c.waitFor((e) => e.event === "ready");
    const a = await post(base, `/api/rooms/${code}/action`, { type: "content_send", title: "evil", body: "" }, { "X-Device-Id": id(1) });
    expect(a.status).toBe(403);
    expect(a.body.error?.code).toBe("organizer_only");
    const b = await post(base, `/api/rooms/${code}/action`, { type: "content_send", title: "evil", body: "" }, auth("not-the-token"));
    expect(b.status).toBe(403);
    const k = await post(base, `/api/rooms/${code}/action`, { type: "device_kick", deviceId: id(1) }, { "X-Device-Id": id(1) });
    expect(k.status).toBe(403);
    const u = await post(base, `/api/rooms/${code}/action`, { type: "format_disk" }, auth(token));
    expect(u.status).toBe(400);
    expect(c.count("content_added")).toBe(0);
    // organizer stream needs a token
    const bad = await connect(base, code, { deviceId: "organizerdev02", role: "organizer" });
    expect(bad.status).toBe(401);
    c.close();
  });

  it("resyncs a reconnecting client without duplicates (replay by lastSeq)", async () => {
    const { code, token } = await createRoom();
    const c1 = await connect(base, code, { deviceId: id(7) });
    await c1.waitFor((e) => e.event === "ready");
    const send = (t: string) => post(base, `/api/rooms/${code}/action`, { type: "content_send", title: t, body: "" }, auth(token));
    const r1 = await send("one");
    await c1.waitFor((e) => e.event === "content_added");
    c1.close(); // lose Wi-Fi
    await new Promise((r) => setTimeout(r, 200));
    const r2 = await send("two");
    const r3 = await send("three");
    expect(r3.body.seq).toBe((r1.body.seq as number) + 2);

    const c2 = await connect(base, code, { deviceId: id(7), lastSeq: r1.body.seq as number });
    const ready = await c2.waitFor((e) => e.event === "ready");
    expect(ready.payload).toMatchObject({ mode: "replay", replayed: 2 });
    await c2.waitFor((e) => e.event === "content_added" && (e.payload.item as { title: string }).title === "three");
    const titles = c2.events.filter((e) => e.event === "content_added").map((e) => (e.payload.item as { title: string }).title);
    expect(titles).toEqual(["two", "three"]);
    expect(c2.count("snapshot")).toBe(0);
    expect(r2.status).toBe(200);

    // a brand-new (late) joiner gets the whole feed in a snapshot
    const late = await connect(base, code, { deviceId: id(8) });
    const snap = await late.waitFor((e) => e.event === "snapshot");
    expect((snap.payload.items as unknown[]).length).toBe(3);
    c2.close();
    late.close();
  });

  it("validates uploads by magic bytes and accepts real images and PDFs", async () => {
    const { code, token } = await createRoom();
    const fake = await upload(code, token, new Blob(["this is not a pdf at all"], { type: "application/pdf" }), "evil.pdf", "pdf");
    expect(fake.status).toBe(422);
    expect(fake.body.error?.code).toBe("invalid_file");
    const fakeImg = await upload(code, token, new Blob(["MZ\x90\x00 definitely an exe"], { type: "image/png" }), "x.png", "image");
    expect(fakeImg.status).toBe(422);
    const noAuth = await fetch(`${base}/api/rooms/${code}/upload`, { method: "POST", body: new FormData() });
    expect(noAuth.status).toBe(401);

    const png = await sharp({ create: { width: 800, height: 600, channels: 3, background: "#6366f1" } }).png().toBuffer();
    const img = await upload(code, token, new Blob([new Uint8Array(png)], { type: "image/png" }), "pic.png", "image", { caption: "hi" });
    expect(img.status).toBe(201);
    const item = (img.body.data as { item: { fileUrl: string; thumbUrl: string; type: string } }).item;
    expect(item.type).toBe("image");
    const thumb = await fetch(`${base}${item.thumbUrl}`);
    expect(thumb.status).toBe(200);
    expect(thumb.headers.get("content-type")).toBe("image/webp");
    expect(thumb.headers.get("cache-control")).toContain("immutable");
    const meta = await sharp(Buffer.from(await thumb.arrayBuffer())).metadata();
    expect(meta.width).toBe(480);

    const doc = await PDFDocument.create();
    for (let i = 0; i < 3; i++) doc.addPage([600, 400]).drawText(`Slide ${i + 1}`, { x: 50, y: 200, size: 40 });
    const bytes = await doc.save();
    const pdf = await upload(code, token, new Blob([new Uint8Array(bytes)], { type: "application/pdf" }), "deck.pdf", "pdf", { mode: "presentation" });
    expect(pdf.status).toBe(201);
    const p = (pdf.body.data as { item: { fileUrl: string; pageCount: number } }).item;
    expect(p.pageCount).toBe(3);

    const range = await fetch(`${base}${p.fileUrl}`, { headers: { Range: "bytes=0-9" } });
    expect(range.status).toBe(206);
    expect(range.headers.get("content-range")).toMatch(/^bytes 0-9\//);
    expect(Buffer.from(await range.arrayBuffer()).toString("latin1")).toBe("%PDF-1.7\n%");
    const dl = await fetch(`${base}${p.fileUrl}?download=1`);
    expect(dl.headers.get("content-disposition")).toContain("attachment");

    // path traversal is rejected
    const roomId = p.fileUrl.split("/")[3];
    expect((await fetch(`${base}/api/files/${roomId}/..%2F..%2Fetc%2Fpasswd`)).status).toBe(404);
    expect((await fetch(`${base}/api/files/${roomId}/nothing.pdf`)).status).toBe(404);

    // starting a presentation as part of the upload
    const late = await connect(base, code, { deviceId: id(3) });
    const snap = await late.waitFor((e) => e.event === "snapshot");
    expect(snap.payload.presentation).toMatchObject({ active: true, currentSlide: 0, pageCount: 3 });
    const nav = await post(base, `/api/rooms/${code}/action`, { type: "slide_change", slide: 2 }, auth(token));
    expect(nav.status).toBe(200);
    const sc = await late.waitFor((e) => e.event === "slide_changed");
    expect(sc.payload.currentSlide).toBe(2);
    late.close();
  });

  it("enforces lock, max attendees, kick and PIN login", async () => {
    const { code, token } = await createRoom();
    const a = await connect(base, code, { deviceId: id(1) });
    await a.waitFor((e) => e.event === "ready");
    await post(base, `/api/rooms/${code}/action`, { type: "room_settings_update", settings: { maxAttendees: 1 } }, auth(token));
    const full = await connect(base, code, { deviceId: id(2) });
    expect(full.status).toBe(403);
    await post(base, `/api/rooms/${code}/action`, { type: "room_settings_update", settings: { maxAttendees: 50, locked: true } }, auth(token));
    expect((await connect(base, code, { deviceId: id(3) })).status).toBe(403);
    const again = await connect(base, code, { deviceId: id(1) }); // existing device may rejoin a locked room
    expect(again.status).toBe(200);
    await again.waitFor((e) => e.event === "ready");
    await post(base, `/api/rooms/${code}/action`, { type: "device_kick", deviceId: id(1) }, auth(token));
    await again.waitFor((e) => e.event === "kicked");
    expect((await connect(base, code, { deviceId: id(1) })).status).toBe(403);

    const bad = await post(base, `/api/rooms/${code}/organizer-login`, { pin: "0000" });
    expect(bad.status).toBe(403);
    const ok = await post(base, `/api/rooms/${code}/organizer-login`, { pin: "4321" });
    expect(ok.status).toBe(200);
    const second = await post(base, `/api/rooms/${code}/action`, { type: "content_send", title: "from other device", body: "" }, auth(ok.body.token as string));
    expect(second.status).toBe(200);
    a.close();
  });

  it("ends a room and rejects new joins", async () => {
    const { code, token } = await createRoom();
    const c = await connect(base, code, { deviceId: id(5) });
    await c.waitFor((e) => e.event === "ready");
    const end = await post(base, `/api/rooms/${code}/action`, { type: "room_end" }, auth(token));
    expect(end.status).toBe(200);
    const ev = await c.waitFor((e) => e.event === "room_state_changed");
    expect(ev.payload.status).toBe("ended");
    const late = await connect(base, code, { deviceId: id(6) });
    expect(late.status).toBe(410);
    c.close();
  });
});
