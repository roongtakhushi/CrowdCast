import { and, eq } from "drizzle-orm";
import type { NextRequest } from "next/server";
import { db } from "@/db";
import { contentItems } from "@/db/schema";
import { route } from "@/server/core";
import { serveFile } from "@/server/services/uploads";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface Ctx {
  params: Promise<{ room: string; name: string }>;
}

/** Protected file serving: whitelisted names only, Range support (PDF.js), immutable caching. */
export const GET = route(async (req: NextRequest, ctx: Ctx) => {
  const { room, name } = await ctx.params;
  const download = req.nextUrl.searchParams.get("download") === "1";
  let downloadName = "download";
  if (download && /^[A-Za-z0-9_-]{8,32}$/.test(room)) {
    const [row] = await db
      .select({ title: contentItems.title })
      .from(contentItems)
      .where(and(eq(contentItems.roomId, room), eq(contentItems.filePath, name)))
      .limit(1);
    if (row?.title) downloadName = row.title;
  }
  return serveFile({ roomId: room, name, range: req.headers.get("range"), download, downloadName });
});
