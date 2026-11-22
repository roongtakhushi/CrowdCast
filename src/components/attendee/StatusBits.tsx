"use client";

import { AnimatePresence, motion } from "framer-motion";
import { AlertOctagon, Lock, Ban, Users, WifiOff, RefreshCw, Copy, Link2Off, SearchX } from "lucide-react";
import Link from "next/link";
import { useRef, useState, type FormEvent, type ReactNode } from "react";
import { toast } from "sonner";
import { Logo } from "@/components/ui/Brand";
import { EmptyState } from "@/components/ui/Illustrations";
import { Button, Input } from "@/components/ui/primitives";
import { isApiError } from "@/lib/socket";
import type { ConnStatus } from "@/lib/socket";
import { cn } from "@/lib/utils";
import { REACTION_EMOJIS } from "@/shared/types";
import type { ActionInput, ActionResult } from "@/shared/schemas";
import { useFeed } from "@/stores/feed";

export function StatusPill({ status, attempt, rttMs }: { status: ConnStatus; attempt: number; rttMs: number | null }) {
  const online = status === "connected";
  const offline = status === "offline";
  const label = online ? "Connected" : offline ? "Offline" : status === "connecting" ? "Connecting…" : "Reconnecting…";
  const tone = online ? "text-ok border-ok/30 bg-ok/10" : offline ? "text-bad border-bad/30 bg-bad/10" : "text-warn border-warn/30 bg-warn/10";
  const dot = online ? "bg-ok" : offline ? "bg-bad" : "bg-warn";
  return (
    <span role="status" className={cn("inline-flex items-center gap-2 rounded-full border px-2.5 py-1 text-xs font-medium", tone)}>
      <span aria-hidden className={cn("h-2 w-2 rounded-full", dot, !online && "animate-pulse")} />
      {label}
      {online && rttMs !== null && <span className="font-tech text-[11px] opacity-90">{rttMs} ms</span>}
      {!online && attempt > 1 && <span className="font-tech text-[11px] opacity-80">#{attempt}</span>}
    </span>
  );
}

export function OfflineBanner({ status }: { status: ConnStatus }) {
  const show = status === "offline" || status === "reconnecting";
  return (
    <AnimatePresence>
      {show && (
        <motion.div
          role="alert"
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: "auto", opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          className="overflow-hidden"
        >
          <div className="flex items-center gap-3 border-b border-warn/30 bg-warn/10 px-4 py-2.5 text-sm text-warn">
            {status === "offline" ? <WifiOff className="h-4 w-4 shrink-0" aria-hidden /> : <RefreshCw className="h-4 w-4 shrink-0 animate-spin" aria-hidden />}
            <p>
              {status === "offline" ? "You’re offline." : "Connection lost."} Your feed stays visible and we’ll reconnect and catch up automatically.
            </p>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export function UrgentBanner() {
  const alert = useFeed((s) => s.alert);
  const dismiss = useFeed((s) => s.dismissAlert);
  return (
    <AnimatePresence>
      {alert && (
        <motion.div
          role="alert"
          initial={{ y: -80, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -80, opacity: 0 }}
          transition={{ type: "spring", stiffness: 380, damping: 30 }}
          className="fixed inset-x-3 top-3 z-40 mx-auto max-w-lg pt-safe"
        >
          <div className="flex items-start gap-3 rounded-2xl border border-bad/50 bg-bg-2 p-4 shadow-2xl ring-1 ring-bad/30">
            <AlertOctagon className="mt-0.5 h-5 w-5 shrink-0 text-bad" aria-hidden />
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold uppercase tracking-wide text-bad">Urgent announcement</p>
              <p className="mt-0.5 font-semibold">{alert.title || "Announcement"}</p>
              {alert.body && <p className="mt-0.5 line-clamp-3 text-sm text-muted">{alert.body}</p>}
            </div>
            <Button size="sm" variant="secondary" onClick={dismiss}>
              Got it
            </Button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

const SCREENS: Record<string, { kind: "locked" | "ended" | "lost" | "devices"; icon: ReactNode; title: string; body: string }> = {
  room_locked: { kind: "locked", icon: <Lock />, title: "This room is locked", body: "The organizer has stopped new people from joining. Ask them to unlock it, then try again." },
  room_full: { kind: "devices", icon: <Users />, title: "This room is full", body: "The attendee limit has been reached. Ask the organizer to raise it, then retry." },
  room_ended: { kind: "ended", icon: <Ban />, title: "This event has ended", body: "The organizer closed the room. Thanks for joining!" },
  kicked: { kind: "locked", icon: <Ban />, title: "You were removed", body: "The organizer removed this device from the room." },
  code_rotated: { kind: "lost", icon: <Link2Off />, title: "This link was replaced", body: "The organizer generated a new room code. Scan the new QR code to rejoin." },
  replaced: { kind: "devices", icon: <Copy />, title: "Open in another tab", body: "CrowdCast is already open on this device. Use that tab, or reload this one to take over." },
  room_not_found: { kind: "lost", icon: <SearchX />, title: "Room not found", body: "Check the 6-character code or scan the QR code again." },
};

export function StatusScreen({ code, message }: { code: string; message?: string }) {
  const s = SCREENS[code] ?? { kind: "lost" as const, title: "Can’t join this room", body: message ?? "Something went wrong." };
  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col px-5 pt-safe pb-safe">
      <header className="py-5">
        <Logo />
      </header>
      <main className="flex flex-1 items-center justify-center" role="alert">
        <EmptyState kind={s.kind} title={s.title}>
          <p>{s.body}</p>
          <div className="mt-5 flex justify-center gap-2">
            {code === "replaced" || code === "room_locked" || code === "room_full" ? (
              <Button variant="primary" onClick={() => window.location.reload()}>
                Try again
              </Button>
            ) : null}
            <Link href="/" className="inline-flex h-11 items-center rounded-xl border border-line bg-surface-2 px-4 text-sm font-medium hover:bg-surface">
              Home
            </Link>
          </div>
        </EmptyState>
      </main>
    </div>
  );
}

export function NameGate({ roomName, onSubmit }: { roomName: string; onSubmit: (name: string | null) => void }) {
  const [name, setName] = useState("");
  const submit = (e: FormEvent) => {
    e.preventDefault();
    onSubmit(name.trim() || null);
  };
  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col px-5 pt-safe pb-safe">
      <header className="py-5">
        <Logo />
      </header>
      <main className="flex flex-1 flex-col justify-center">
        <form onSubmit={submit} className="glass space-y-4 rounded-2xl p-6">
          <div>
            <p className="text-xs uppercase tracking-widest text-muted">Joining</p>
            <h1 className="text-xl font-semibold">{roomName}</h1>
          </div>
          <div className="space-y-1.5">
            <label htmlFor="dn" className="text-sm font-medium">
              Display name <span className="text-muted">(optional)</span>
            </label>
            <Input id="dn" value={name} onChange={(e) => setName(e.target.value)} maxLength={32} autoComplete="nickname" placeholder="Leave blank to stay anonymous" autoFocus />
          </div>
          <Button type="submit" variant="primary" size="lg" className="w-full">
            Join event
          </Button>
        </form>
      </main>
    </div>
  );
}

/** Emoji reactions with local floating feedback. Server-side capped; client throttled. */
export function ReactionsBar({ send }: { send: (a: ActionInput) => Promise<ActionResult> }) {
  const [floats, setFloats] = useState<{ id: number; emoji: string; x: number; rot: number }[]>([]);
  const last = useRef(0);
  const nid = useRef(0);
  const fire = async (emoji: (typeof REACTION_EMOJIS)[number], now: number) => {
    if (now - last.current < 160) return;
    last.current = now;
    const id = ++nid.current;
    const rot = Math.floor(Math.random() * 30) - 15;
    setFloats((f) => [...f.slice(-14), { id, emoji, x: Math.random() * 80 - 40, rot }]);
    setTimeout(() => setFloats((f) => f.filter((x) => x.id !== id)), 1500);
    try {
      await send({ type: "reaction_send", emoji });
    } catch (e) {
      if (isApiError(e) && e.code === "muted") toast.error("You’ve been muted by the organizer");
    }
  };
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-30 flex justify-center px-3 pb-safe">
      <div className="pointer-events-auto relative mb-3 flex items-center gap-1.5 rounded-full border border-line bg-bg-2/85 px-2 py-1.5 shadow-[0_12px_36px_-6px_rgba(0,0,0,0.6)] backdrop-blur-xl" role="group" aria-label="Send a reaction">
        {floats.map((f) => (
          <span
            key={f.id}
            aria-hidden
            className="pointer-events-none absolute bottom-12 text-2xl select-none"
            style={{
              left: `calc(50% + ${f.x}px)`,
              animation: "float-up 1.4s cubic-bezier(0.2, 0.8, 0.2, 1) forwards",
              transform: `rotate(${f.rot}deg)`,
            }}
          >
            {f.emoji}
          </span>
        ))}
        {REACTION_EMOJIS.map((e) => (
          <button
            key={e}
            type="button"
            onClick={(ev) => fire(e, ev.timeStamp)}
            aria-label={`React ${e}`}
            className="flex h-11 w-11 items-center justify-center rounded-full text-xl transition-transform duration-100 active:scale-75 hover:scale-110 hover:bg-surface-2"
          >
            {e}
          </button>
        ))}
      </div>
    </div>
  );
}
