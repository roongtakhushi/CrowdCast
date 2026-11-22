"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Maximize, Users } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo } from "react";
import { JoinQr, useJoinUrl } from "@/components/host/SharePanel";
import { SlideStage } from "@/components/pdf/SlideStage";
import { LiveBadge, Logo } from "@/components/ui/Brand";
import { AnimatedNumber } from "@/components/ui/AnimatedNumber";
import { Button, Skeleton } from "@/components/ui/primitives";
import { StatusScreen } from "@/components/attendee/StatusBits";
import { useRealtime } from "@/hooks/useRealtime";
import { useRoom } from "@/hooks/useRoom";
import { RichText } from "@/lib/linkify";
import { cn } from "@/lib/utils";
import { useConnection } from "@/stores/connection";
import { useDevices } from "@/stores/devices";
import { sortFeed, useFeed } from "@/stores/feed";
import { usePresentationStore } from "@/stores/presentation";

/** Read-only big-screen display: current slide or latest announcement + QR + live attendee count. */
export function ProjectorView({ code }: { code: string }) {
  const lookup = useRoom(code);
  if (lookup.state === "loading") return <div className="p-10"><Skeleton className="h-[80dvh] w-full" /></div>;
  if (lookup.state === "error") return <StatusScreen code={lookup.code} message={lookup.message} />;
  return <Display code={code} name={lookup.room.name} />;
}

function Display({ code, name }: { code: string; name: string }) {
  const router = useRouter();
  useRealtime({ code, role: "display" });
  const fatal = useConnection((s) => s.fatal);
  const ended = useConnection((s) => s.ended);
  const status = useConnection((s) => s.status);
  const presence = useDevices((s) => s.presence);
  const reactions = useDevices((s) => s.reactions);
  const items = useFeed((s) => s.items);
  const pres = usePresentationStore((s) => s.state);
  const pointer = usePresentationStore((s) => s.pointer);
  const { joinUrl } = useJoinUrl(code);

  useEffect(() => {
    if (ended) router.replace(`/ended/${code}`);
  }, [ended, code, router]);

  const latest = useMemo(() => {
    const list = sortFeed(items).filter((i) => i.type === "announcement");
    return [...list].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];
  }, [items]);

  if (fatal) return <StatusScreen code={fatal.code} message={fatal.message} />;
  const presenting = !!pres?.active && !!pres.fileUrl;
  const fullscreen = () => void document.documentElement.requestFullscreen?.().catch(() => undefined);

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-bg">
      <header className="flex items-center justify-between gap-6 px-8 py-4">
        <div className="flex min-w-0 items-center gap-5">
          <Logo size={34} />
          <span className="h-6 w-px bg-line" aria-hidden />
          <h1 className="truncate text-2xl font-semibold">{name}</h1>
        </div>
        <div className="flex items-center gap-4">
          {presenting && <LiveBadge />}
          {status !== "connected" && <span className="text-sm text-warn">Reconnecting…</span>}
          <Button variant="ghost" size="icon" onClick={fullscreen} aria-label="Enter fullscreen">
            <Maximize className="h-5 w-5" />
          </Button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1 gap-8 px-8 pb-8">
        <main className="relative min-w-0 flex-1 overflow-hidden rounded-3xl border border-line bg-black/60 shadow-2xl">
          {presenting && pres ? (
            <SlideStage url={pres.fileUrl} page={pres.currentSlide} pointer={pointer} blank={pres.blank} width={1800} className="h-full w-full p-4" alt={`Slide ${pres.currentSlide + 1}`} />
          ) : (
            <AnimatePresence mode="wait">
              <motion.div
                key={latest?.id ?? "empty"}
                initial={{ opacity: 0, y: 24 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -24 }}
                transition={{ type: "spring", stiffness: 220, damping: 26 }}
                className="flex h-full flex-col justify-center p-14"
              >
                {latest ? (
                  <>
                    <p className={cn("mb-4 text-sm font-semibold uppercase tracking-[0.3em]", latest.priority === "urgent" ? "text-bad" : latest.priority === "important" ? "text-warn" : "text-accent-text")}>
                      {latest.priority === "normal" ? "Announcement" : latest.priority}
                    </p>
                    {latest.title && <h2 className="text-6xl font-semibold leading-tight tracking-tight text-fg">{latest.title}</h2>}
                    {latest.body && <RichText text={latest.body} className="mt-6 text-3xl leading-snug text-fg/90" />}
                  </>
                ) : (
                  <div className="text-center">
                    <p className="text-6xl font-bold tracking-tight text-fg">Welcome</p>
                    <p className="mt-4 text-2xl text-muted">Scan the QR code to join. Announcements and slides appear here automatically.</p>
                  </div>
                )}
              </motion.div>
            </AnimatePresence>
          )}
          {presenting && pres && (
            <span className="font-tech absolute bottom-4 right-6 rounded-full border border-white/20 bg-black/80 px-3.5 py-1 text-sm font-medium text-white shadow-lg">
              Slide {pres.currentSlide + 1} of {pres.pageCount}
            </span>
          )}
        </main>

        <aside className="glass flex w-80 shrink-0 flex-col items-center justify-between rounded-3xl p-7 text-center">
          <div>
            <p className="text-sm uppercase tracking-[0.25em] text-muted">Scan to join</p>
            <div className="mt-4">
              <JoinQr url={joinUrl} size={232} />
            </div>
            <p className="font-tech mt-5 text-4xl font-semibold tracking-[0.2em]">{code}</p>
            <p className="font-tech mt-2 break-all text-xs text-muted">{joinUrl.replace(/^https?:\/\//, "")}</p>
          </div>
          <div>
            <div className="flex items-center justify-center gap-3">
              <Users className="h-8 w-8 text-accent-text" aria-hidden />
              <AnimatedNumber value={presence.connected} className="font-tech text-6xl font-semibold" />
            </div>
            <p className="mt-1 text-sm text-muted">devices connected</p>
            <div className="mt-4 flex flex-wrap justify-center gap-2 text-2xl" aria-label="Reactions">
              {Object.entries(reactions).map(([e, n]) => (
                <span key={e} className="font-tech rounded-full bg-surface-2 px-2.5 py-0.5 text-base">
                  {e} {n}
                </span>
              ))}
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
