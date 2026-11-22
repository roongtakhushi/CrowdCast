import { and, count, eq, isNull, lt, asc, desc, gt, isNotNull, or } from "drizzle-orm";
import { nanoid } from "nanoid";
import { db } from "@/db";
import { contentItems, eventLog, presentationState } from "@/db/schema";
import type { ContentItem, ContentType, PresentationState, Priority } from "@/shared/types";

export type ContentRow = typeof contentItems.$inferSelect;

/** `roomRef` is the stable room id (file URLs survive room-code regeneration). */
export function toPublicItem(row: ContentRow, roomRef: string): ContentItem {
  const fileUrl = row.filePath ? `/api/files/${roomRef}/${row.filePath}` : null;
  return {
    id: row.id,
    seq: row.seq,
    type: row.type as ContentType,
    title: row.title,
    body: row.body,
    priority: row.priority as Priority,
    pinned: row.pinned,
    expiresAt: row.expiresAt ? row.expiresAt.toISOString() : null,
    fileUrl,
    downloadUrl: fileUrl ? `${fileUrl}?download=1` : null,
    thumbUrl: row.thumbPath ? `/api/files/${roomRef}/${row.thumbPath}` : null,
    mime: row.mime,
    sizeBytes: row.sizeBytes,
    pageCount: row.pageCount,
    deliveredTo: row.deliveredTo,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function getItem(roomId: string, id: string): Promise<ContentRow | null> {
  const [row] = await db
    .select()
    .from(contentItems)
    .where(and(eq(contentItems.id, id), eq(contentItems.roomId, roomId), isNull(contentItems.deletedAt)))
    .limit(1);
  return row ?? null;
}

export async function listLiveItems(roomId: string): Promise<ContentRow[]> {
  const now = new Date();
  return db
    .select()
    .from(contentItems)
    .where(
      and(
        eq(contentItems.roomId, roomId),
        isNull(contentItems.deletedAt),
        or(isNull(contentItems.expiresAt), gt(contentItems.expiresAt, now)),
      ),
    )
    .orderBy(desc(contentItems.createdAt));
}

export async function countItems(roomId: string): Promise<number> {
  const [r] = await db.select({ n: count() }).from(contentItems).where(eq(contentItems.roomId, roomId));
  return r?.n ?? 0;
}

export interface NewItem {
  roomId: string;
  seq: number;
  type: ContentType;
  title: string;
  body: string;
  priority: Priority;
  pinned: boolean;
  expireMinutes?: number | null;
  filePath?: string | null;
  thumbPath?: string | null;
  mime?: string | null;
  sizeBytes?: number | null;
  pageCount?: number | null;
  deliveredTo?: number;
}

/** Strip control characters (keep \n and \t). Output is rendered as plain text by the UI. */
export function cleanText(s: string): string {
  return s.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "").replace(/\r\n?/g, "\n");
}

export async function insertItem(n: NewItem): Promise<ContentRow> {
  const [row] = await db
    .insert(contentItems)
    .values({
      id: nanoid(14),
      roomId: n.roomId,
      seq: n.seq,
      type: n.type,
      title: cleanText(n.title).trim(),
      body: cleanText(n.body),
      priority: n.priority,
      pinned: n.pinned,
      expiresAt: n.expireMinutes ? new Date(Date.now() + n.expireMinutes * 60_000) : null,
      filePath: n.filePath ?? null,
      thumbPath: n.thumbPath ?? null,
      mime: n.mime ?? null,
      sizeBytes: n.sizeBytes ?? null,
      pageCount: n.pageCount ?? null,
      deliveredTo: n.deliveredTo ?? 0,
    })
    .returning();
  return row;
}

export async function updateItem(
  roomId: string,
  id: string,
  patch: Partial<{
    title: string;
    body: string;
    priority: Priority;
    pinned: boolean;
    expiresAt: Date | null;
    deliveredTo: number;
    deletedAt: Date;
    seq: number;
  }>,
): Promise<ContentRow | null> {
  const [row] = await db
    .update(contentItems)
    .set({ ...patch, updatedAt: new Date() })
    .where(and(eq(contentItems.id, id), eq(contentItems.roomId, roomId)))
    .returning();
  return row ?? null;
}

export async function expireDue(roomId: string): Promise<ContentRow[]> {
  return db
    .update(contentItems)
    .set({ deletedAt: new Date(), updatedAt: new Date() })
    .where(
      and(
        eq(contentItems.roomId, roomId),
        isNull(contentItems.deletedAt),
        isNotNull(contentItems.expiresAt),
        lt(contentItems.expiresAt, new Date()),
      ),
    )
    .returning();
}

// ---------------------------------------------------------- presentation
export async function loadPresentation(roomId: string): Promise<PresentationState> {
  const [p] = await db.select().from(presentationState).where(eq(presentationState.roomId, roomId)).limit(1);
  return buildPresentation(roomId, p ?? null);
}

export async function buildPresentation(
  roomId: string,
  p: typeof presentationState.$inferSelect | null,
): Promise<PresentationState> {
  const inactive: PresentationState = {
    active: false,
    contentId: null,
    currentSlide: 0,
    blank: false,
    updatedAt: (p?.updatedAt ?? new Date()).toISOString(),
    title: null,
    pageCount: 0,
    fileUrl: null,
  };
  if (!p || !p.active || !p.contentId) return inactive;
  const item = await getItem(roomId, p.contentId);
  if (!item || item.type !== "pdf") return inactive;
  return {
    active: true,
    contentId: item.id,
    currentSlide: Math.min(p.currentSlide, Math.max(0, (item.pageCount ?? 1) - 1)),
    blank: p.blank,
    updatedAt: p.updatedAt.toISOString(),
    title: item.title,
    pageCount: item.pageCount ?? 0,
    fileUrl: item.filePath ? `/api/files/${roomId}/${item.filePath}` : null,
  };
}

export async function savePresentation(
  roomId: string,
  p: { active: boolean; contentId: string | null; currentSlide: number; blank: boolean },
) {
  const values = { roomId, ...p, updatedAt: new Date() };
  await db
    .insert(presentationState)
    .values(values)
    .onConflictDoUpdate({ target: presentationState.roomId, set: values });
}

// ------------------------------------------------------------ event log
export async function appendEvent(roomId: string, seq: number, event: string, payload: Record<string, unknown>) {
  await db.insert(eventLog).values({ roomId, seq, event, payloadJson: payload }).onConflictDoNothing();
}

export async function maxSeq(roomId: string): Promise<number> {
  const [r] = await db
    .select({ seq: eventLog.seq })
    .from(eventLog)
    .where(eq(eventLog.roomId, roomId))
    .orderBy(desc(eventLog.seq))
    .limit(1);
  const [c] = await db
    .select({ seq: contentItems.seq })
    .from(contentItems)
    .where(eq(contentItems.roomId, roomId))
    .orderBy(desc(contentItems.seq))
    .limit(1);
  return Math.max(r?.seq ?? 0, c?.seq ?? 0);
}

export async function eventsAfter(roomId: string, afterSeq: number, upToSeq: number) {
  return db
    .select()
    .from(eventLog)
    .where(and(eq(eventLog.roomId, roomId), gt(eventLog.seq, afterSeq), lt(eventLog.seq, upToSeq + 1)))
    .orderBy(asc(eventLog.seq));
}
