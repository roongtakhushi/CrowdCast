"use client";

import { useEffect, useState } from "react";
import { api, ApiClientError } from "@/lib/api";
import type { NetworkInfo, PublicRoom } from "@/shared/types";

export type RoomLookup =
  | { state: "loading" }
  | { state: "ready"; room: PublicRoom }
  | { state: "error"; code: string; message: string };

/** Public room info (name, status, locked) used before connecting. */
export function useRoom(code: string): RoomLookup {
  const [res, setRes] = useState<RoomLookup & { forCode?: string }>({ state: "loading" });
  useEffect(() => {
    let cancelled = false;
    api
      .getRoom(code)
      .then((r) => !cancelled && setRes({ state: "ready", room: r.room, forCode: code }))
      .catch((e: unknown) => {
        if (cancelled) return;
        const err = e instanceof ApiClientError ? e : new ApiClientError(0, "network_error", "Network error");
        setRes({ state: "error", code: err.code, message: err.message, forCode: code });
      });
    return () => {
      cancelled = true;
    };
  }, [code]);
  return res.forCode === code || res.state === "loading" ? res : { state: "loading" };
}

const NET_KEY = "crowdcast:net";

export interface ShareTarget {
  /** e.g. http://192.168.1.20:3000 */
  base: string;
  label: string;
}

/** Candidate base URLs for the QR/join link. Always an address phones can reach (never localhost). */
export function useShareTargets(): { targets: ShareTarget[]; selected: string; select: (b: string) => void; info: NetworkInfo | null } {
  const [info, setInfo] = useState<NetworkInfo | null>(null);
  const [selected, setSelected] = useState<string>("");
  useEffect(() => {
    let cancelled = false;
    api
      .networkInfo()
      .then((i) => {
        if (cancelled) return;
        setInfo(i);
        const saved = localStorage.getItem(NET_KEY);
        setSelected(saved ?? "");
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  const targets: ShareTarget[] = [];
  if (info) {
    const host = typeof window !== "undefined" ? window.location.hostname : "";
    const loopback = host === "localhost" || host === "127.0.0.1" || host === "::1" || host === "";
    for (const c of info.candidates) {
      targets.push({
        base: `http://${c.address}:${info.port}`,
        label: `${c.address}${c.virtual ? " (virtual adapter)" : ""} · ${c.iface}`,
      });
    }
    if (!loopback && typeof window !== "undefined") {
      const origin = window.location.origin;
      if (!targets.some((t) => t.base === origin)) targets.unshift({ base: origin, label: `This browser's address · ${host}` });
    }
    if (targets.length === 0) targets.push({ base: info.baseUrl, label: "Server default (no LAN IPv4 found)" });
  }
  const effective = targets.some((t) => t.base === selected) ? selected : (targets[0]?.base ?? "");
  return {
    targets,
    selected: effective,
    select: (b) => {
      localStorage.setItem(NET_KEY, b);
      setSelected(b);
    },
    info,
  };
}
