"use client";

import { AnimatePresence } from "framer-motion";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { LiveBadge, Logo, ThemeToggle } from "@/components/ui/Brand";
import { EmptyState } from "@/components/ui/Illustrations";
import { ErrorBoundary } from "@/components/ui/ErrorBoundary";
import { Skeleton } from "@/components/ui/primitives";
import { useRealtime } from "@/hooks/useRealtime";
import { useRoom } from "@/hooks/useRoom";
import { getSavedName, saveName } from "@/lib/session";
import type { ContentItem } from "@/shared/types";
import { useConnection } from "@/stores/connection";
import { sortFeed, useFeed } from "@/stores/feed";
import { usePresentationStore } from "@/stores/presentation";
import { AnnouncementCard, ImageCard, PdfCard } from "./FeedCards";
import { LiveSlides } from "./LiveSlides";
import { Lightbox } from "./Lightbox";
import { PdfReader } from "./PdfReader";
import { NameGate, OfflineBanner, ReactionsBar, StatusPill, StatusScreen, UrgentBanner } from "./StatusBits";

export function AttendeeApp({ code }: { code: string }) {
  const lookup = useRoom(code);
  const [name, setName] = useState<string | null | undefined>(undefined);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setName(getSavedName(code));
  }, [code]);

  if (lookup.state === "loading" || name === undefined) {
    return (
      <div className="mx-auto max-w-lg space-y-4 p-4 pt-safe" aria-busy="true" aria-label="Loading event">
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }
  if (lookup.state === "error") return <StatusScreen code={lookup.code === "room_not_found" ? "room_not_found" : lookup.code} message={lookup.message} />;
  if (lookup.room.status === "ended") return <StatusScreen code="room_ended" />;
  if (lookup.room.requireName && name === null) {
    return (
      <NameGate
        roomName={lookup.room.name}
        onSubmit={(n) => {
          saveName(code, n ?? "");
          setName(n ?? "");
        }}
      />
    );
  }
  return <Connected code={code} name={name || null} roomName={lookup.room.name} description={lookup.room.description} />;
}

function Connected({ code, name, roomName, description }: { code: string; name: string | null; roomName: string; description: string }) {
  const router = useRouter();
  const { send } = useRealtime({ code, role: "attendee", name });
  const status = useConnection((s) => s.status);
  const attempt = useConnection((s) => s.attempt);
  const rtt = useConnection((s) => s.rttMs);
  const fatal = useConnection((s) => s.fatal);
  const ended = useConnection((s) => s.ended);
  const settings = useConnection((s) => s.settings);
  const deviceName = useConnection((s) => s.deviceName);
  const items = useFeed((s) => s.items);
  const loaded = useFeed((s) => s.loaded);
  const announcement = useFeed((s) => s.announcement);
  const presenting = usePresentationStore((s) => s.state?.active ?? false);

  const [lightbox, setLightbox] = useState<ContentItem | null>(null);
  const [reader, setReader] = useState<ContentItem | null>(null);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(t);
  }, []);
  const feed = useMemo(() => sortFeed(items, now), [items, now]);

  useEffect(() => {
    if (ended) router.replace(`/ended/${code}`);
  }, [ended, code, router]);

  if (fatal) return <StatusScreen code={fatal.code} message={fatal.message} />;

  return (
    <div className="mx-auto flex min-h-dvh max-w-lg flex-col pb-28">
      <header className="sticky top-0 z-30 border-b border-line bg-bg/90 px-4 pb-3 pt-safe backdrop-blur">
        <div className="flex items-center justify-between gap-3 pt-3">
          <div className="min-w-0">
            <h1 className="truncate text-base font-semibold leading-tight">{roomName}</h1>
            <p className="truncate text-xs text-muted">{deviceName ? `You’re ${deviceName}` : description || "Joining…"}</p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {presenting && <LiveBadge />}
            <ThemeToggle />
          </div>
        </div>
        <div className="mt-2">
          <StatusPill status={status} attempt={attempt} rttMs={rtt} />
        </div>
      </header>
      <OfflineBanner status={status} />
      <UrgentBanner />
      <div className="sr-only" aria-live="polite" aria-atomic="true">
        {announcement}
      </div>

      <main className="flex-1 space-y-3 px-4 pt-3">
        <ErrorBoundary label="Live slides">
          <LiveSlides send={send} />
        </ErrorBoundary>

        {!loaded ? (
          <div className="space-y-3" aria-busy="true" aria-label="Loading feed">
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-40 w-full" />
          </div>
        ) : feed.length === 0 ? (
          <EmptyState kind="feed" title="You’re all set">
            Announcements, images and documents from the organizer will appear here the moment they’re sent.
          </EmptyState>
        ) : (
          <ul className="space-y-3" aria-label="Event feed">
            <AnimatePresence initial={false}>
              {feed.map((item) => (
                <li key={item.id}>
                  {item.type === "announcement" ? (
                    <AnnouncementCard item={item} />
                  ) : item.type === "image" ? (
                    <ImageCard item={item} onOpen={setLightbox} />
                  ) : (
                    <PdfCard item={item} onOpen={setReader} />
                  )}
                </li>
              ))}
            </AnimatePresence>
          </ul>
        )}
      </main>

      <footer className="px-4 py-6 text-center">
        <Logo size={20} />
      </footer>

      {settings?.reactionsEnabled && status === "connected" && <ReactionsBar send={send} />}
      <Lightbox item={lightbox} onClose={() => setLightbox(null)} />
      <PdfReader item={reader} onClose={() => setReader(null)} />
    </div>
  );
}
