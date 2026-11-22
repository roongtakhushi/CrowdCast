import type { ActionInput, ActionResult } from "@/shared/schemas";
import type { ContentItem, NetworkInfo, PublicRoom } from "@/shared/types";

export class ApiClientError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

async function parse<T>(res: Response): Promise<T> {
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    /* non-JSON */
  }
  const b = body as { ok?: boolean; error?: { code: string; message: string } } | null;
  if (!res.ok || !b?.ok) {
    throw new ApiClientError(res.status, b?.error?.code ?? "network_error", b?.error?.message ?? `Request failed (${res.status})`);
  }
  return body as T;
}

async function req<T>(url: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, { cache: "no-store", ...init });
  } catch {
    throw new ApiClientError(0, "network_error", "Cannot reach the server. Check your connection.");
  }
  return parse<T>(res);
}

const jsonInit = (body: unknown, headers: Record<string, string> = {}): RequestInit => ({
  method: "POST",
  headers: { "Content-Type": "application/json", ...headers },
  body: JSON.stringify(body),
});

export const api = {
  createRoom: (input: { name: string; description: string; pin?: string }) =>
    req<{ code: string; token: string; joinUrl: string; hostUrl: string }>("/api/rooms", jsonInit(input)),
  getRoom: (code: string) => req<{ room: PublicRoom }>(`/api/rooms/${code}`),
  networkInfo: () => req<NetworkInfo>("/api/network-info"),
  organizerLogin: (code: string, pin: string) =>
    req<{ token: string }>(`/api/rooms/${code}/organizer-login`, jsonInit({ pin })),
  action: (code: string, action: ActionInput, headers: Record<string, string>) =>
    req<ActionResult>(`/api/rooms/${code}/action`, jsonInit(action, headers)),
};

export interface UploadOptions {
  code: string;
  token: string;
  file: File;
  kind: "image" | "pdf";
  fields?: Record<string, string>;
  onProgress?: (pct: number) => void;
  signal?: AbortSignal;
}

export interface UploadResult {
  delivered: number;
  data?: { item?: ContentItem };
}

/** XHR (not fetch) so we get real upload progress events. */
export function uploadFile(o: UploadOptions): Promise<UploadResult> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `/api/rooms/${o.code}/upload`);
    xhr.setRequestHeader("Authorization", `Bearer ${o.token}`);
    xhr.responseType = "json";
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) o.onProgress?.(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onerror = () => reject(new ApiClientError(0, "network_error", "Upload failed: network error"));
    xhr.onabort = () => reject(new ApiClientError(0, "aborted", "Upload cancelled"));
    xhr.onload = () => {
      const b = xhr.response as { ok?: boolean; delivered?: number; data?: { item?: ContentItem }; error?: { code: string; message: string } } | null;
      if (xhr.status >= 200 && xhr.status < 300 && b?.ok) {
        o.onProgress?.(100);
        resolve({ delivered: b.delivered ?? 0, data: b.data });
      } else {
        reject(new ApiClientError(xhr.status, b?.error?.code ?? "upload_failed", b?.error?.message ?? `Upload failed (${xhr.status})`));
      }
    };
    o.signal?.addEventListener("abort", () => xhr.abort());
    const form = new FormData();
    form.append("file", o.file);
    form.append("kind", o.kind);
    for (const [k, v] of Object.entries(o.fields ?? {})) form.append(k, v);
    xhr.send(form);
  });
}
