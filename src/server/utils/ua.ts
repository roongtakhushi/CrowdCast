import type { DeviceType } from "@/shared/types";

export interface ParsedUA {
  deviceType: DeviceType;
  browser: string;
}

/** Tiny user-agent parser: enough for "iOS / Android / Desktop" and a browser name. */
export function parseUserAgent(ua: string | null | undefined): ParsedUA {
  const s = ua ?? "";
  let deviceType: DeviceType = "Other";
  if (/iPhone|iPad|iPod/i.test(s)) deviceType = "iOS";
  else if (/Android/i.test(s)) deviceType = "Android";
  else if (/Windows NT|Macintosh|X11|Linux|CrOS/i.test(s)) deviceType = "Desktop";

  let browser = "Unknown";
  if (/Edg(e|A|iOS)?\//.test(s)) browser = "Edge";
  else if (/OPR\/|Opera/.test(s)) browser = "Opera";
  else if (/SamsungBrowser/.test(s)) browser = "Samsung Internet";
  else if (/FxiOS|Firefox\//.test(s)) browser = "Firefox";
  else if (/CriOS|Chrome\//.test(s)) browser = "Chrome";
  else if (/Safari\//.test(s)) browser = "Safari";
  else if (/node|undici|crowdcast/i.test(s)) browser = "Script";
  return { deviceType, browser };
}
