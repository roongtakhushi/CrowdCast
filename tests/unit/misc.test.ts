import { describe, expect, it } from "vitest";
import { friendlyName, sanitizeDisplayName } from "@/server/utils/names";
import { parseUserAgent } from "@/server/utils/ua";

describe("user agent parsing", () => {
  it("detects iOS Safari", () => {
    expect(parseUserAgent("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile Safari/604.1")).toEqual({ deviceType: "iOS", browser: "Safari" });
  });
  it("detects Android Chrome", () => {
    expect(parseUserAgent("Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/120.0 Mobile Safari/537.36")).toEqual({ deviceType: "Android", browser: "Chrome" });
  });
  it("detects desktop Edge and Firefox", () => {
    expect(parseUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0 Safari/537.36 Edg/120.0").browser).toBe("Edge");
    expect(parseUserAgent("Mozilla/5.0 (X11; Linux x86_64; rv:121.0) Gecko/20100101 Firefox/121.0")).toEqual({ deviceType: "Desktop", browser: "Firefox" });
  });
});

describe("friendly names", () => {
  it("never repeats a taken name", () => {
    const taken = new Set<string>();
    for (let i = 0; i < 300; i++) {
      const n = friendlyName(taken);
      expect(taken.has(n)).toBe(false);
      taken.add(n);
    }
  });
  it("sanitises display names", () => {
    expect(sanitizeDisplayName("  <b>Ada</b>\u0007  Lovelace ")).toBe("bAda/b Lovelace");
    expect(sanitizeDisplayName("   ")).toBeNull();
    expect(sanitizeDisplayName("x".repeat(100))).toHaveLength(32);
  });
});
