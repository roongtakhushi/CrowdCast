import { describe, expect, it } from "vitest";
import { generateRoomCode, isValidRoomCode, ROOM_CODE_ALPHABET } from "@/server/utils/room-code";

describe("room code generation", () => {
  it("is 6 characters from the unambiguous alphabet", () => {
    for (let i = 0; i < 500; i++) {
      const c = generateRoomCode();
      expect(c).toHaveLength(6);
      expect(isValidRoomCode(c)).toBe(true);
      expect(c).not.toMatch(/[01OIL]/);
    }
  });
  it("alphabet excludes look-alike characters", () => {
    for (const bad of "0O1IL") expect(ROOM_CODE_ALPHABET).not.toContain(bad);
  });
  it("uses the injected rng deterministically", () => {
    expect(generateRoomCode(() => 0)).toBe("222222");
    expect(generateRoomCode((max) => max - 1)).toBe("ZZZZZZ");
  });
  it("rejects malformed codes", () => {
    expect(isValidRoomCode("ABC12")).toBe(false);
    expect(isValidRoomCode("ABCDE0")).toBe(false);
    expect(isValidRoomCode("abcdef")).toBe(false);
  });
});
