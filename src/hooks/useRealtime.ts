"use client";

import { useCallback, useEffect, useRef } from "react";
import { toast } from "sonner";
import { RealtimeClient, type ServerEvent } from "@/lib/socket";
import { getDeviceId } from "@/lib/session";
import { classifySeq } from "@/shared/seq";
import type { ActionInput, ActionResult } from "@/shared/schemas";
import type { Role } from "@/shared/types";
import { useConnection } from "@/stores/connection";
import { useDevices } from "@/stores/devices";
import { useFeed } from "@/stores/feed";
import { usePresentationStore } from "@/stores/presentation";

interface Options {
  code: string;
  role: Role;
  token?: string | null;
  name?: string | null;
  enabled?: boolean;
}

/**
 * Connects a RealtimeClient and routes every server event into the Zustand stores.
 * Sequenced events are de-duplicated / gap-checked with classifySeq().
 */
export function useRealtime({ code, role, token, name, enabled = true }: Options) {
  const clientRef = useRef<RealtimeClient | null>(null);

  useEffect(() => {
    if (!enabled) return;
    const conn = useConnection.getState();
    conn.reset();
    useFeed.getState().reset();
    usePresentationStore.getState().reset();
    useDevices.getState().reset();

    let ackQueue: number[] = [];
    let ackTimer: ReturnType<typeof setTimeout> | null = null;
    const queueAck = (seq: number) => {
      if (role !== "attendee") return;
      ackQueue.push(seq);
      ackTimer ??= setTimeout(() => {
        const seqs = ackQueue.slice(0, 50);
        ackQueue = [];
        ackTimer = null;
        void client.send({ type: "ack", seqs }).catch(() => undefined);
      }, 80);
    };

    /** Apply a sequenced event exactly once; trigger a resync on a gap. */
    const sequenced = (seq: number, apply: () => void) => {
      const verdict = classifySeq(useConnection.getState().lastSeq, seq);
      if (verdict === "duplicate") return;
      if (verdict === "gap") {
        client.resync();
        return;
      }
      useConnection.getState().setSeq(seq);
      apply();
      queueAck(seq);
    };

    const onEvent = (ev: ServerEvent) => {
      const feed = useFeed.getState();
      const pres = usePresentationStore.getState();
      const dev = useDevices.getState();
      switch (ev.name) {
        case "hello":
          useConnection.getState().setIdentity(ev.payload.name);
          break;
        case "snapshot":
          feed.setSnapshot(ev.payload.items);
          pres.set(ev.payload.presentation);
          useConnection.getState().setRoom(ev.payload.room, ev.payload.settings);
          useConnection.getState().setSeq(ev.payload.seq);
          break;
        case "content_added":
          sequenced(ev.payload.seq, () => {
            const isNew = !useFeed.getState().items[ev.payload.item.id];
            if (isNew && role === "attendee" && ev.payload.item.priority === "urgent" && ev.payload.item.type === "announcement") {
              try {
                navigator.vibrate?.([220, 90, 220]);
              } catch {
                /* unsupported */
              }
            }
            feed.upsert(ev.payload.item, role === "attendee");
          });
          break;
        case "content_updated":
          sequenced(ev.payload.seq, () => feed.upsert(ev.payload.item, false));
          break;
        case "content_removed":
          sequenced(ev.payload.seq, () => feed.remove(ev.payload.id));
          break;
        case "presentation_state":
          sequenced(ev.payload.seq, () => pres.set(ev.payload.state));
          break;
        case "slide_changed":
          sequenced(ev.payload.seq, () => pres.setSlide(ev.payload.currentSlide, ev.payload.updatedAt));
          break;
        case "room_state_changed":
          sequenced(ev.payload.seq, () =>
            useConnection.getState().setSettings(ev.payload.settings, ev.payload.status === "ended"),
          );
          break;
        case "pointer_moved":
          pres.setPointer(ev.payload);
          break;
        case "ping":
          void client
            .send({ type: "ping_measure", id: ev.payload.id })
            .then((r) => useConnection.getState().setRtt(r.rttMs ?? null))
            .catch(() => undefined);
          break;
        case "presence_update":
          dev.setPresence(ev.payload.connected, ev.payload.peak);
          break;
        case "device_list":
          dev.setDevices(ev.payload.devices);
          break;
        case "stats_update":
          dev.pushStats(ev.payload.stats, ev.payload.acks);
          break;
        case "log_entry":
          dev.pushLog(ev.payload.entry);
          break;
        case "organizer_state":
          dev.setDevices(ev.payload.devices);
          dev.setLogs(ev.payload.logs);
          dev.pushStats(ev.payload.stats, {});
          break;
        case "reaction_batch":
          dev.addReactions(ev.payload.counts);
          break;
        case "error":
          if (ev.payload.code !== "replaced") toast.error(ev.payload.message);
          break;
        default:
          break;
      }
    };

    const client = new RealtimeClient({
      code,
      role,
      deviceId: getDeviceId(),
      token,
      name,
      getLastSeq: () => useConnection.getState().lastSeq,
      onEvent,
      onStatus: (s, attempt) => useConnection.getState().setStatus(s, attempt),
      onFatal: (info) => useConnection.getState().setFatal(info),
    });
    clientRef.current = client;
    client.start();
    return () => {
      if (ackTimer) clearTimeout(ackTimer);
      client.stop();
      clientRef.current = null;
    };
  }, [code, role, token, name, enabled]);

  const send = useCallback(async (action: ActionInput): Promise<ActionResult> => {
    const c = clientRef.current;
    if (!c) throw new Error("Not connected");
    return c.send(action);
  }, []);

  return { send };
}
