"use client";

import { ChevronFirst, ChevronLast, ChevronLeft, ChevronRight, EyeOff, MousePointer2, Play, Square, Users } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PageThumb, SlideStage } from "@/components/pdf/SlideStage";
import { EmptyState } from "@/components/ui/Illustrations";
import { Badge, Button, Card, Field, Input, Select } from "@/components/ui/primitives";
import { cn } from "@/lib/utils";
import { useDevices } from "@/stores/devices";
import { useFeed } from "@/stores/feed";
import { usePresentationStore } from "@/stores/presentation";
import { useHost } from "./context";
import { FileUploader } from "./FileUploader";

function isTyping(t: EventTarget | null): boolean {
  const el = t as HTMLElement | null;
  return !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable);
}

export function PresentationTab({ active: tabActive }: { active: boolean }) {
  const { run, send } = useHost();
  const pres = usePresentationStore((s) => s.state);
  const items = useFeed((s) => s.items);
  const stats = useDevices((s) => s.stats);
  const reactions = useDevices((s) => s.reactions);
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!pres?.active) {
      setElapsed(0);
      return;
    }
    const timer = setInterval(() => setElapsed((prev) => prev + 1), 1000);
    return () => clearInterval(timer);
  }, [pres?.active]);

  const formatElapsed = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  };
  const pdfs = useMemo(
    () =>
      Object.values(items)
        .filter((i) => i.type === "pdf")
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
    [items],
  );
  const [selected, setSelected] = useState("");
  const [laser, setLaser] = useState(false);
  const [starting, setStarting] = useState(false);
  const [jump, setJump] = useState("");
  const target = useRef(0);
  const lastPtr = useRef(0);

  const presenting = !!pres?.active;
  const chosenId = presenting ? (pres?.contentId ?? "") : selected || pdfs[0]?.id || "";
  const chosen = items[chosenId];
  const fileUrl = presenting ? (pres?.fileUrl ?? null) : (chosen?.fileUrl ?? null);
  const pageCount = presenting ? (pres?.pageCount ?? 0) : (chosen?.pageCount ?? 0);
  const current = pres?.currentSlide ?? 0;

  useEffect(() => {
    target.current = current;
  }, [current]);

  const goto = useCallback(
    (n: number) => {
      if (!presenting || pageCount < 1) return;
      const s = Math.min(pageCount - 1, Math.max(0, n));
      target.current = s;
      void send({ type: "slide_change", slide: s }).catch(() => undefined);
    },
    [presenting, pageCount, send],
  );

  useEffect(() => {
    if (!tabActive || !presenting) return;
    const onKey = (e: KeyboardEvent) => {
      if (isTyping(e.target) || e.metaKey || e.ctrlKey || e.altKey) return;
      switch (e.key) {
        case "ArrowRight":
        case "ArrowDown":
        case "PageDown":
          e.preventDefault();
          goto(target.current + 1);
          break;
        case " ":
          e.preventDefault();
          goto(target.current + (e.shiftKey ? -1 : 1));
          break;
        case "ArrowLeft":
        case "ArrowUp":
        case "PageUp":
          e.preventDefault();
          goto(target.current - 1);
          break;
        case "Home":
          e.preventDefault();
          goto(0);
          break;
        case "End":
          e.preventDefault();
          goto(pageCount - 1);
          break;
        default:
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [tabActive, presenting, goto, pageCount]);

  const onPointer = useCallback(
    (x: number, y: number, inside: boolean) => {
      if (!laser || !presenting) return;
      const now = performance.now();
      if (inside && now - lastPtr.current < 50) return; // ~20 events / second
      lastPtr.current = now;
      void send({ type: "pointer_move", x: Math.min(1, Math.max(0, x)), y: Math.min(1, Math.max(0, y)), visible: inside }).catch(() => undefined);
    },
    [laser, presenting, send],
  );

  const toggleLaser = () => {
    if (laser) void send({ type: "pointer_move", x: 0, y: 0, visible: false }).catch(() => undefined);
    setLaser((v) => !v);
  };

  const start = async () => {
    if (!chosenId) return;
    setStarting(true);
    const resume = pres?.contentId === chosenId ? pres.currentSlide : 0;
    await run({ type: "presentation_start", contentId: chosenId, slide: resume }, "Attendees are now following your slides");
    setStarting(false);
  };

  const stop = async () => {
    setLaser(false);
    await run({ type: "presentation_stop" }, "Presentation ended");
  };

  if (!presenting) {
    return (
      <div className="grid gap-5 lg:grid-cols-2">
        <Card className="space-y-4">
          <h2 className="text-base font-semibold">Start a live presentation</h2>
          {pdfs.length === 0 ? (
            <EmptyState kind="slides" title="No PDF loaded yet">
              Upload a PDF on the right. Choose “Live presentation” to start immediately.
            </EmptyState>
          ) : (
            <>
              <Field label="Slides (PDF)" htmlFor="pdf-pick">
                <Select id="pdf-pick" value={chosenId} onChange={(e) => setSelected(e.target.value)}>
                  {pdfs.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.title} · {p.pageCount} slides
                    </option>
                  ))}
                </Select>
              </Field>
              {fileUrl && (
                <div className="flex gap-2 overflow-x-auto pb-2 scroll-thin" aria-label="Slide thumbnails">
                  {Array.from({ length: Math.min(pageCount, 12) }, (_, i) => (
                    <PageThumb key={`${chosenId}-${i}`} url={fileUrl} page={i} />
                  ))}
                </div>
              )}
              <Button variant="primary" size="lg" onClick={start} loading={starting} disabled={!chosenId}>
                <Play className="h-4 w-4" /> Start presenting
              </Button>
              <p className="text-xs text-muted">While presenting, every attendee’s screen follows your slide in real time. They can still browse on their own and tap “Back to live”.</p>
            </>
          )}
        </Card>
        <Card>
          <h2 className="mb-4 text-base font-semibold">Upload slides</h2>
          <FileUploader kind="pdf" />
        </Card>
      </div>
    );
  }

  const last = pageCount - 1;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="min-w-0 flex-1 truncate text-base font-semibold">{pres?.title}</h2>
        <span className="font-tech inline-flex items-center gap-1.5 rounded-full border border-line bg-surface-2 px-3 py-1 text-xs font-semibold text-fg">
          Timer {formatElapsed(elapsed)}
        </span>
        <Badge tone="ok">
          <Users className="h-3 w-3" aria-hidden /> {stats?.inSync ?? 0} of {stats?.connected ?? 0} in sync
        </Badge>
        <Button variant="danger" size="sm" onClick={stop}>
          <Square className="h-4 w-4" /> Stop presenting
        </Button>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1fr_20rem]">
        <Card className="space-y-4 p-4">
          <div className={cn("relative h-[48dvh] min-h-64 rounded-xl bg-black/40", laser && "cursor-crosshair")}>
            <SlideStage url={fileUrl} page={current} blank={pres?.blank} className="h-full w-full" width={1400} onPointer={laser ? onPointer : undefined} alt={`Slide ${current + 1}`} />
          </div>

          <div className="flex flex-wrap items-center justify-center gap-2">
            <Button variant="secondary" size="icon" aria-label="First slide" onClick={() => goto(0)} disabled={current <= 0}>
              <ChevronFirst className="h-5 w-5" />
            </Button>
            <Button variant="secondary" size="icon" aria-label="Previous slide" onClick={() => goto(current - 1)} disabled={current <= 0}>
              <ChevronLeft className="h-5 w-5" />
            </Button>
            <p className="font-tech min-w-28 text-center text-sm" aria-live="polite">
              Slide {current + 1} of {pageCount}
            </p>
            <Button variant="secondary" size="icon" aria-label="Next slide" onClick={() => goto(current + 1)} disabled={current >= last}>
              <ChevronRight className="h-5 w-5" />
            </Button>
            <Button variant="secondary" size="icon" aria-label="Last slide" onClick={() => goto(last)} disabled={current >= last}>
              <ChevronLast className="h-5 w-5" />
            </Button>
            <form
              className="flex items-center gap-1.5"
              onSubmit={(e) => {
                e.preventDefault();
                const n = Number(jump);
                if (Number.isInteger(n) && n >= 1) goto(n - 1);
                setJump("");
              }}
            >
              <Input aria-label="Jump to slide number" value={jump} onChange={(e) => setJump(e.target.value.replace(/\D/g, ""))} inputMode="numeric" placeholder="Go to…" className="h-10 w-24" />
            </form>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-2 border-t border-line pt-4">
            <Button variant={pres?.blank ? "primary" : "secondary"} size="sm" aria-pressed={!!pres?.blank} onClick={() => run({ type: "blank_toggle", blank: !pres?.blank })}>
              <EyeOff className="h-4 w-4" /> {pres?.blank ? "Unblank screens" : "Blank screens"}
            </Button>
            <Button variant={laser ? "primary" : "secondary"} size="sm" aria-pressed={laser} onClick={toggleLaser}>
              <MousePointer2 className="h-4 w-4" /> Laser pointer {laser ? "on" : "off"}
            </Button>
            <p className="w-full text-center text-xs text-muted">Shortcuts: ← → arrows · Space next · Home / End{laser ? " · move over the slide to point" : ""}</p>
          </div>
        </Card>

        <Card className="space-y-3 p-4">
          <h3 className="text-sm font-semibold">Speaker view</h3>
          <div>
            <p className="mb-1 text-xs text-muted">Next slide</p>
            <div className="aspect-[4/3] overflow-hidden rounded-lg bg-black/40">
              {current < last ? (
                <SlideStage url={fileUrl} page={current + 1} className="h-full w-full" width={640} alt={`Next: slide ${current + 2}`} />
              ) : (
                <div className="flex h-full items-center justify-center text-sm text-muted">End of presentation</div>
              )}
            </div>
          </div>
          <ul className="space-y-1.5 text-sm">
            <li className="flex justify-between"><span className="text-muted">Attendees</span><span className="font-tech">{stats?.connected ?? 0}</span></li>
            <li className="flex justify-between"><span className="text-muted">Following live</span><span className="font-tech">{stats?.inSync ?? 0}</span></li>
            <li className="flex justify-between"><span className="text-muted">Browsing alone</span><span className="font-tech">{Math.max(0, (stats?.connected ?? 0) - (stats?.inSync ?? 0))}</span></li>
          </ul>

          <div className="border-t border-line pt-3">
            <p className="mb-2 text-xs font-medium text-muted">Audience reactions</p>
            {Object.keys(reactions).length === 0 ? (
              <p className="text-xs text-muted">Waiting for reactions…</p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {Object.entries(reactions)
                  .sort((a, b) => b[1] - a[1])
                  .map(([emoji, count]) => (
                    <span key={emoji} className="inline-flex items-center gap-1 rounded-full border border-line bg-surface-2 px-2 py-0.5 text-xs">
                      <span>{emoji}</span>
                      <span className="font-tech font-semibold">{count}</span>
                    </span>
                  ))}
              </div>
            )}
          </div>
        </Card>
      </div>

      <div className="glass rounded-2xl p-3">
        <div className="flex gap-2 overflow-x-auto pb-2 scroll-thin" role="list" aria-label="Slide thumbnails">
          {Array.from({ length: pageCount }, (_, i) => (
            <div role="listitem" key={`${pres?.contentId}-${i}`}>
              <PageThumb url={fileUrl} page={i} active={i === current} onClick={() => goto(i)} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
