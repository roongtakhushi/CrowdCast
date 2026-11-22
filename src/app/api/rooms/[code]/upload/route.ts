import type { NextRequest } from "next/server";
import { clientIp, config, E, json, rateLimit, route } from "@/server/core";
import { parseCode, requireOrganizer, type CodeCtx } from "@/server/services/access";
import { publishAdded, startPresentation } from "@/server/services/actions";
import { insertItem } from "@/server/services/content";
import { getRuntime, onlineAttendeeCount, runExclusive } from "@/server/services/hub";
import { processImage, processPdf, saveFile } from "@/server/services/uploads";
import { prioritySchema } from "@/shared/schemas";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

function field(form: FormData, name: string, max: number): string {
  const v = form.get(name);
  return typeof v === "string" ? v.trim().slice(0, max) : "";
}

/** POST /api/rooms/:code/upload (multipart): image or PDF, validated by magic bytes. */
export const POST = route(async (req: NextRequest, ctx: CodeCtx) => {
  const code = await parseCode(ctx);
  rateLimit(`upload:${clientIp(req)}`, config.rateUploadPerMin);
  const rt = await getRuntime(code);
  if (!rt) throw E.notFound("Room not found", "room_not_found");
  await requireOrganizer(req, rt);
  if (rt.status === "ended") throw E.gone("room_ended", "This event has ended.");

  const declared = Number(req.headers.get("content-length") ?? 0);
  if (declared > config.maxPdfBytes + 1024 * 1024) throw E.tooLarge("Upload is too large (max 30 MB)");

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    throw E.badRequest("Expected multipart/form-data");
  }
  const file = form.get("file");
  const kind = field(form, "kind", 10);
  if (!(file instanceof File)) throw E.badRequest("Missing file field");
  if (kind !== "image" && kind !== "pdf") throw E.badRequest("kind must be 'image' or 'pdf'");
  const buf = Buffer.from(await file.arrayBuffer());
  const priority = prioritySchema.catch("normal").parse(field(form, "priority", 12) || "normal");
  const pinned = field(form, "pinned", 5) === "true";
  const mode = field(form, "mode", 12) === "presentation" ? "presentation" : "document";
  const baseTitle = file.name.replace(/\.[^.]+$/, "").slice(0, 120);

  if (kind === "image") {
    const img = await processImage(buf);
    const [filePath, thumbPath] = await Promise.all([
      saveFile(rt.roomId, img.ext, img.full),
      saveFile(rt.roomId, "webp", img.thumb, "_t"),
    ]);
    const result = await runExclusive(rt, async () => {
      const row = await insertItem({
        roomId: rt.roomId,
        seq: rt.seq + 1,
        type: "image",
        title: field(form, "title", 120),
        body: field(form, "caption", 2000),
        priority,
        pinned,
        filePath,
        thumbPath,
        mime: img.mime,
        sizeBytes: img.full.length,
        deliveredTo: onlineAttendeeCount(rt),
      });
      return publishAdded(rt, row);
    });
    return json({ ...result, ok: undefined } as Record<string, unknown>, 201);
  }

  const pdf = await processPdf(buf);
  const filePath = await saveFile(rt.roomId, "pdf", buf);
  const result = await runExclusive(rt, async () => {
    const row = await insertItem({
      roomId: rt.roomId,
      seq: rt.seq + 1,
      type: "pdf",
      title: field(form, "title", 120) || baseTitle || "Document",
      body: "",
      priority,
      pinned,
      filePath,
      mime: "application/pdf",
      sizeBytes: buf.length,
      pageCount: pdf.pageCount,
      deliveredTo: onlineAttendeeCount(rt),
    });
    const added = publishAdded(rt, row);
    if (mode === "presentation") await startPresentation(rt, row.id, 0);
    return added;
  });
  return json({ ...result, ok: undefined } as Record<string, unknown>, 201);
});
