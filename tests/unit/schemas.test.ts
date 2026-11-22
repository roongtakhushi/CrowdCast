import { describe, expect, it } from "vitest";
import { actionSchema, createRoomSchema, ORGANIZER_ACTIONS, roomCodeSchema } from "@/shared/schemas";

describe("action schemas", () => {
  it("accepts a valid announcement and applies defaults", () => {
    const r = actionSchema.parse({ type: "content_send", title: "Hi", body: "there" });
    expect(r).toMatchObject({ priority: "normal", pinned: false, expireMinutes: null });
  });
  it("rejects unknown events", () => {
    expect(actionSchema.safeParse({ type: "drop_tables" }).success).toBe(false);
  });
  it("validates ranges", () => {
    expect(actionSchema.safeParse({ type: "pointer_move", x: 1.5, y: 0, visible: true }).success).toBe(false);
    expect(actionSchema.safeParse({ type: "pointer_move", x: 0.5, y: 0.5, visible: true }).success).toBe(true);
    expect(actionSchema.safeParse({ type: "slide_change", slide: -1 }).success).toBe(false);
    expect(actionSchema.safeParse({ type: "content_send", title: "x", body: "", expireMinutes: 99999 }).success).toBe(false);
    expect(actionSchema.safeParse({ type: "reaction_send", emoji: "💩" }).success).toBe(false);
    expect(actionSchema.safeParse({ type: "reaction_send", emoji: "🔥" }).success).toBe(true);
  });
  it("marks every state-changing action as organizer-only", () => {
    for (const t of ["content_send", "content_delete", "slide_change", "device_kick", "room_settings_update", "room_end"] as const) {
      expect(ORGANIZER_ACTIONS.has(t)).toBe(true);
    }
    for (const t of ["ping_measure", "ack", "reaction_send", "view_state", "sync_request"] as const) {
      expect(ORGANIZER_ACTIONS.has(t)).toBe(false);
    }
  });
  it("validates room creation and codes", () => {
    expect(createRoomSchema.safeParse({ name: "x" }).success).toBe(false);
    expect(createRoomSchema.parse({ name: "Tech Fest", pin: "" }).pin).toBeUndefined();
    expect(createRoomSchema.safeParse({ name: "Tech Fest", pin: "12" }).success).toBe(false);
    expect(roomCodeSchema.parse("abc234")).toBe("ABC234");
    expect(roomCodeSchema.safeParse("ABC10O").success).toBe(false);
  });
});
