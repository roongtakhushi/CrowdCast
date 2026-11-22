import { randomId } from "./utils";

const DEVICE_KEY = "crowdcast:device";
const hostKey = (code: string) => `crowdcast:host:${code.toUpperCase()}`;

export function getDeviceId(): string {
  try {
    let id = localStorage.getItem(DEVICE_KEY);
    if (!id || !/^[A-Za-z0-9_-]{8,64}$/.test(id)) {
      id = randomId(24);
      localStorage.setItem(DEVICE_KEY, id);
    }
    return id;
  } catch {
    return randomId(24);
  }
}

export function getHostToken(code: string): string | null {
  try {
    return localStorage.getItem(hostKey(code));
  } catch {
    return null;
  }
}

export function setHostToken(code: string, token: string) {
  localStorage.setItem(hostKey(code), token);
}

export function moveHostToken(oldCode: string, newCode: string) {
  const t = getHostToken(oldCode);
  if (t) setHostToken(newCode, t);
  localStorage.removeItem(hostKey(oldCode));
}

const nameKey = (code: string) => `crowdcast:name:${code.toUpperCase()}`;
export function getSavedName(code: string): string | null {
  try {
    return localStorage.getItem(nameKey(code));
  } catch {
    return null;
  }
}
export function saveName(code: string, name: string) {
  try {
    localStorage.setItem(nameKey(code), name);
  } catch {
    /* private mode */
  }
}
