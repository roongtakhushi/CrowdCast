import {
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
} from "drizzle-orm/sqlite-core";
import type { RoomSettings } from "@/shared/types";

export const rooms = sqliteTable("rooms", {
  id: text("id").primaryKey(),
  code: text("code").notNull().unique(),
  name: text("name").notNull(),
  description: text("description").notNull().default(""),
  organizerTokenHash: text("organizer_token_hash").notNull(),
  pinHash: text("pin_hash"),
  status: text("status").notNull().default("active"),
  settingsJson: text("settings_json", { mode: "json" }).$type<RoomSettings>().notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
  endedAt: integer("ended_at", { mode: "timestamp" }),
});

/** Extra organizer sessions issued by PIN login (other devices). Hash only. */
export const organizerSessions = sqliteTable("organizer_sessions", {
  tokenHash: text("token_hash").primaryKey(),
  roomId: text("room_id")
    .notNull()
    .references(() => rooms.id, { onDelete: "cascade" }),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
});

export const contentItems = sqliteTable(
  "content_items",
  {
    id: text("id").primaryKey(),
    roomId: text("room_id")
      .notNull()
      .references(() => rooms.id, { onDelete: "cascade" }),
    seq: integer("seq").notNull(),
    type: text("type").notNull(),
    title: text("title").notNull().default(""),
    body: text("body").notNull().default(""),
    priority: text("priority").notNull().default("normal"),
    pinned: integer("pinned", { mode: "boolean" }).notNull().default(false),
    expiresAt: integer("expires_at", { mode: "timestamp" }),
    filePath: text("file_path"),
    thumbPath: text("thumb_path"),
    mime: text("mime"),
    sizeBytes: integer("size_bytes"),
    pageCount: integer("page_count"),
    deliveredTo: integer("delivered_to").notNull().default(0),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
    updatedAt: integer("updated_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
    deletedAt: integer("deleted_at", { mode: "timestamp" }),
  },
  (t) => [index("content_items_room_idx").on(t.roomId, t.createdAt)],
);

export const presentationState = sqliteTable("presentation_state", {
  roomId: text("room_id")
    .primaryKey()
    .references(() => rooms.id, { onDelete: "cascade" }),
  active: integer("active", { mode: "boolean" }).notNull().default(false),
  contentId: text("content_id"),
  currentSlide: integer("current_slide").notNull().default(0),
  blank: integer("blank", { mode: "boolean" }).notNull().default(false),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
});

export const eventLog = sqliteTable(
  "event_log",
  {
    roomId: text("room_id")
      .notNull()
      .references(() => rooms.id, { onDelete: "cascade" }),
    seq: integer("seq").notNull(),
    event: text("event").notNull(),
    payloadJson: text("payload_json", { mode: "json" }).$type<Record<string, unknown>>().notNull(),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
  },
  (t) => [primaryKey({ columns: [t.roomId, t.seq] })],
);
