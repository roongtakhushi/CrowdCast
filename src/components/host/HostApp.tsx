"use client";

import {
  Activity,
  Cog,
  ExternalLink,
  History,
  KeyRound,
  Megaphone,
  MonitorPlay,
  Network,
  Power,
  Presentation,
  Share2,
  Users,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { StatusScreen } from "@/components/attendee/StatusBits";
import { LiveBadge, Logo, ThemeToggle } from "@/components/ui/Brand";
import { Dialog } from "@/components/ui/Dialog";
import { ErrorBoundary } from "@/components/ui/ErrorBoundary";
import { Button, Card, Field, Input, Skeleton } from "@/components/ui/primitives";
import { useRealtime } from "@/hooks/useRealtime";
import { useRoom } from "@/hooks/useRoom";
import { api, ApiClientError } from "@/lib/api";
import { getHostToken, moveHostToken, setHostToken } from "@/lib/session";
import { cn } from "@/lib/utils";
import { useConnection } from "@/stores/connection";
import { useDevices } from "@/stores/devices";
import { usePresentationStore } from "@/stores/presentation";
import { useUi } from "@/stores/ui";
import { BroadcastTab } from "./BroadcastTab";
import { HostProvider, useHost } from "./context";
import { DevicesTab } from "./DevicesTab";
import { FeedHistoryTab } from "./FeedHistoryTab";
import { NetworkTab } from "./NetworkTab";
import { PresentationTab } from "./PresentationTab";
import { SettingsTab } from "./SettingsTab";
import { SharePanel } from "./SharePanel";
import { StatsRow } from "./StatsRow";

type Tab = "broadcast" | "history" | "presentation" | "devices" | "network" | "settings";

const NAV: { id: Tab; label: string; icon: typeof Megaphone }[] = [
  { id: "broadcast", label: "Broadcast", icon: Megaphone },
  { id: "history", label: "Feed history", icon: History },
  { id: "presentation", label: "Presentation", icon: Presentation },
  { id: "devices", label: "Devices", icon: Users },
  { id: "network", label: "Network inspector", icon: Network },
  { id: "settings", label: "Settings", icon: Cog },
];

export function HostApp({ code }: { code: string }) {
  const lookup = useRoom(code);
  const [token, setToken] = useState<string | null | undefined>(undefined);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setToken(getHostToken(code));
  }, [code]);

  if (lookup.state === "loading" || token === undefined) {
    return (
      <div className="p-6">
        <Skeleton className="mb-4 h-14 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }
  if (lookup.state === "error") return <StatusScreen code={lookup.code} message={lookup.message} />;
  if (lookup.room.status === "ended") return <StatusScreen code="room_ended" />;
  if (!token) {
    return <PinLogin code={code} name={lookup.room.name} hasPin={lookup.room.hasPin} onToken={(t) => { setHostToken(code, t); setToken(t); }} />;
  }
  return <Console code={code} token={token} hasPin={lookup.room.hasPin} onAuthLost={() => setToken(null)} />;
}

function PinLogin({ code, name, hasPin, onToken }: { code: string; name: string; hasPin: boolean; onToken: (t: string) => void }) {
  const [pin, setPin] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErr("");
    try {
      const r = await api.organizerLogin(code, pin);
      onToken(r.token);
    } catch (e2) {
      setErr(e2 instanceof ApiClientError ? e2.message : "Login failed");
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col px-5 pt-safe">
      <header className="py-5">
        <Logo />
      </header>
      <main className="flex flex-1 flex-col justify-center">
        <Card>
          <KeyRound className="h-6 w-6 text-accent-text" aria-hidden />
          <h1 className="mt-3 text-xl font-semibold">Organizer sign-in</h1>
          <p className="mt-1 text-sm text-muted">
            {name} · <span className="font-tech">{code}</span>
          </p>
          {hasPin ? (
            <form onSubmit={submit} className="mt-5 space-y-4">
              <Field label="Organizer PIN" htmlFor="pin">
                <Input id="pin" value={pin} onChange={(e) => setPin(e.target.value)} type="password" autoComplete="current-password" className="font-tech" autoFocus />
              </Field>
              {err && (
                <p role="alert" className="text-sm text-bad">
                  {err}
                </p>
              )}
              <Button type="submit" variant="primary" className="w-full" loading={busy} disabled={!pin}>
                Open console
              </Button>
            </form>
          ) : (
            <p className="mt-5 rounded-xl border border-warn/30 bg-warn/10 p-3 text-sm text-warn">
              This browser doesn’t hold the organizer token for this room, and no PIN was set, so the console can’t be opened from here.
            </p>
          )}
        </Card>
      </main>
    </div>
  );
}

function Console({ code, token, hasPin, onAuthLost }: { code: string; token: string; hasPin: boolean; onAuthLost: () => void }) {
  const { send } = useRealtime({ code, role: "organizer", token });
  const fatal = useConnection((s) => s.fatal);
  const unauthorized = fatal?.code === "unauthorized" || fatal?.code === "forbidden";
  useEffect(() => {
    if (unauthorized) {
      localStorage.removeItem(`crowdcast:host:${code}`);
      onAuthLost();
    }
  }, [unauthorized, code, onAuthLost]);
  if (fatal && !unauthorized) return <StatusScreen code={fatal.code} message={fatal.message} />;
  return (
    <HostProvider code={code} token={token} send={send}>
      <Shell hasPin={hasPin} />
    </HostProvider>
  );
}

function Shell({ hasPin }: { hasPin: boolean }) {
  const { code, run } = useHost();
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("broadcast");
  const [confirmEnd, setConfirmEnd] = useState(false);
  const room = useConnection((s) => s.room);
  const status = useConnection((s) => s.status);
  const ended = useConnection((s) => s.ended);
  const presenting = usePresentationStore((s) => s.state?.active ?? false);
  const connected = useDevices((s) => s.presence.connected);
  const shareOpen = useUi((s) => s.shareOpen);
  const setShareOpen = useUi((s) => s.setShareOpen);

  useEffect(() => {
    if (ended) router.replace(`/ended/${code}`);
  }, [ended, code, router]);

  const regenerate = async () => {
    const r = await run({ type: "room_regenerate" });
    const next = r?.data?.code;
    if (typeof next === "string") {
      moveHostToken(code, next);
      toast.success(`New room code: ${next}`);
      setShareOpen(false);
      router.replace(`/host/${next}`);
    }
  };

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-30 flex flex-wrap items-center gap-3 border-b border-line bg-bg/85 px-4 py-3 backdrop-blur lg:px-6">
        <Logo size={26} />
        <span className="hidden h-5 w-px bg-line sm:block" aria-hidden />
        <h1 className="min-w-0 max-w-[40ch] truncate text-base font-semibold">{room?.name ?? "…"}</h1>
        {status === "connected" ? (
          <LiveBadge />
        ) : (
          <span role="status" className="rounded-full border border-warn/30 bg-warn/15 px-2.5 py-0.5 text-xs font-semibold text-warn">
            {status === "offline" ? "OFFLINE" : "RECONNECTING…"}
          </span>
        )}
        {presenting && (
          <span className="rounded-full border border-accent/30 bg-accent/15 px-2.5 py-0.5 text-xs font-semibold text-accent-text">PRESENTING</span>
        )}
        <div className="ml-auto flex items-center gap-1.5">
          <Button size="sm" variant="secondary" onClick={() => setShareOpen(true)}>
            <Share2 className="h-4 w-4" /> <span className="hidden sm:inline">Share</span>
          </Button>
          <Button size="sm" variant="secondary" onClick={() => window.open(`/present/${code}`, "_blank", "noopener")}>
            <MonitorPlay className="h-4 w-4" /> <span className="hidden md:inline">Projector view</span>
            <ExternalLink className="hidden h-3 w-3 opacity-60 md:block" aria-hidden />
          </Button>
          <ThemeToggle />
          <Button size="sm" variant="danger" onClick={() => setConfirmEnd(true)}>
            <Power className="h-4 w-4" /> <span className="hidden sm:inline">End event</span>
          </Button>
        </div>
      </header>

      <div className="flex flex-1 flex-col lg:flex-row">
        <aside className="shrink-0 border-b border-line lg:w-64 lg:border-b-0 lg:border-r">
          <nav aria-label="Console sections" className="scroll-thin flex gap-1 overflow-x-auto p-2 lg:flex-col lg:p-3">
            {NAV.map((n) => {
              const Icon = n.icon;
              const active = tab === n.id;
              return (
                <button
                  key={n.id}
                  type="button"
                  onClick={() => setTab(n.id)}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex shrink-0 items-center gap-2.5 rounded-xl px-3 py-2 text-sm font-medium transition-all duration-150",
                    active
                      ? "bg-surface-2 text-fg font-semibold shadow-xs border border-line"
                      : "text-muted hover:bg-surface-2/60 hover:text-fg",
                  )}
                >
                  <Icon className="h-4 w-4" aria-hidden />
                  {n.label}
                  {n.id === "devices" && <span className="font-tech ml-auto rounded-full bg-surface-2 px-2 text-xs">{connected}</span>}
                  {n.id === "presentation" && presenting && <span className="live-dot ml-auto" aria-label="live" />}
                </button>
              );
            })}
          </nav>
          <div className="hidden p-3 lg:block">
            <Card className="p-4">
              <p className="mb-3 flex items-center gap-2 text-xs font-medium text-muted">
                <Activity className="h-3.5 w-3.5" aria-hidden /> Quick join
              </p>
              <SharePanel code={code} />
            </Card>
          </div>
        </aside>

        <main className="min-w-0 flex-1 space-y-5 p-4 lg:p-6">
          <StatsRow />
          <ErrorBoundary label={NAV.find((n) => n.id === tab)?.label}>
            {tab === "broadcast" && <BroadcastTab onGoPresentation={() => setTab("presentation")} />}
            {tab === "history" && <FeedHistoryTab />}
            {tab === "presentation" && <PresentationTab active={tab === "presentation"} />}
            {tab === "devices" && <DevicesTab />}
            {tab === "network" && <NetworkTab />}
            {tab === "settings" && <SettingsTab hasPin={hasPin} onRegenerate={regenerate} />}
          </ErrorBoundary>
        </main>
      </div>

      <Dialog open={shareOpen} onOpenChange={setShareOpen} title="Share this room" description="Attendees scan the QR code or open the link on the same Wi-Fi.">
        <SharePanel code={code} large onRegenerate={regenerate} />
      </Dialog>

      <Dialog open={confirmEnd} onOpenChange={setConfirmEnd} title="End this event?" description="Attendees are told the event is over and the room becomes read-only. Content is deleted after 24 hours.">
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setConfirmEnd(false)}>
            Keep going
          </Button>
          <Button
            variant="danger"
            onClick={async () => {
              const r = await run({ type: "room_end" });
              if (r) router.replace(`/ended/${code}`);
              setConfirmEnd(false);
            }}
          >
            End event
          </Button>
        </div>
      </Dialog>
    </div>
  );
}
