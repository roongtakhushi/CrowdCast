import QRCode from "qrcode";
import { config, logger } from "./core";
import { closeAllStreams } from "./services/hub";
import { deleteRoomRow, expiredRooms } from "./services/rooms";
import { deleteRoomFiles } from "./services/uploads";
import { listLanCandidates, pickPrimary } from "./utils/lan";

const g = globalThis as typeof globalThis & { __ccStarted?: boolean };

/** Ended rooms are read-only for 24h, then removed together with their files. */
export async function cleanupExpiredRooms(): Promise<number> {
  const rows = await expiredRooms();
  for (const r of rows) {
    await deleteRoomFiles(r.id);
    await deleteRoomRow(r.id);
    logger.info("expired room deleted", { code: r.code });
  }
  return rows.length;
}

/** Runs once per server process: banner + terminal QR, cleanup job, graceful shutdown. */
export async function startup() {
  if (g.__ccStarted) return;
  g.__ccStarted = true;

  const primary = pickPrimary(listLanCandidates());
  const base = config.publicBaseUrl ?? `http://${primary ?? "localhost"}:${config.port}`;
  const lines = [
    "",
    "  CrowdCast is running",
    `  Organizer console : ${base}/create`,
    `  Attendees join at : ${base}/join/<ROOM CODE>`,
    primary ? "" : "  (no LAN IPv4 detected - connect to Wi-Fi or a phone hotspot)",
  ];
  try {
    const qr = await QRCode.toString(`${base}/create`, { type: "terminal", small: true });
    lines.push("  Scan to open the organizer console:", "", qr);
  } catch {
    /* terminal QR is a nicety */
  }
  process.stdout.write(lines.join("\n") + "\n");

  const timer = setInterval(() => {
    cleanupExpiredRooms().catch((e) => logger.error("cleanup failed", { err: String(e) }));
  }, 10 * 60_000);
  timer.unref?.();
  cleanupExpiredRooms().catch(() => undefined);

  process.once("SIGTERM", () => {
    const n = closeAllStreams();
    logger.info("SIGTERM: closed realtime streams", { streams: n });
  });
}
