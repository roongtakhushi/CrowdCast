"use client";

import { motion } from "framer-motion";
import { ChevronLeft, ChevronRight, Maximize2, Minimize2, MousePointer2, RadioTower } from "lucide-react";
import { useEffect, useState } from "react";
import { SlideStage } from "@/components/pdf/SlideStage";
import { LiveBadge } from "@/components/ui/Brand";
import { Button } from "@/components/ui/primitives";
import { cn } from "@/lib/utils";
import type { ActionInput, ActionResult } from "@/shared/schemas";
import { usePresentationStore } from "@/stores/presentation";

/** Attendee live-slides panel: follows the organizer, with free browsing and "Back to live". */
export function LiveSlides({ send }: { send: (a: ActionInput) => Promise<ActionResult> }) {
  const state = usePresentationStore((s) => s.state);
  const pointer = usePresentationStore((s) => s.pointer);
  const browseSlide = usePresentationStore((s) => s.browseSlide);
  const browse = usePresentationStore((s) => s.browse);
  const [expanded, setExpanded] = useState(false);

  const inSync = browseSlide === null;
  useEffect(() => {
    if (!state?.active) return;
    void send({ type: "view_state", inSync }).catch(() => undefined);
  }, [inSync, state?.active, send]);

  if (!state?.active || !state.fileUrl) return null;
  const shown = browseSlide ?? state.currentSlide;
  const last = Math.max(0, state.pageCount - 1);
  const clampSlide = (n: number) => Math.min(last, Math.max(0, n));

  return (
    <motion.section
      aria-label="Live presentation"
      initial={{ opacity: 0, y: -24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: "spring", stiffness: 300, damping: 28 }}
      className="sticky top-0 z-20 -mx-4 border-b border-line bg-bg/95 px-4 pb-3 pt-3 backdrop-blur"
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <LiveBadge label={inSync ? "LIVE" : "BROWSING"} />
          <p className="truncate text-sm font-medium">{state.title}</p>
        </div>
        <div className="flex items-center gap-1">
          <span className="font-tech text-xs text-muted" aria-live="polite">
            {shown + 1} / {state.pageCount}
          </span>
          <Button variant="ghost" size="icon" className="h-9 w-9" aria-label={expanded ? "Dock slides" : "Expand slides"} onClick={() => setExpanded((v) => !v)}>
            {expanded ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
          </Button>
        </div>
      </div>

      <div className={cn("relative overflow-hidden rounded-xl bg-black/40", expanded ? "h-[62dvh]" : "aspect-[4/3] max-h-[44dvh] w-full")}>
        <SlideStage url={state.fileUrl} page={shown} pointer={inSync ? pointer : null} blank={inSync && state.blank} className="h-full w-full" width={1100} alt={`Slide ${shown + 1} of ${state.pageCount}`} />
        {inSync && pointer.visible && (
          <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-full bg-black/60 px-2 py-0.5 text-[10px] text-white">
            <MousePointer2 className="h-3 w-3" aria-hidden /> pointer
          </span>
        )}
      </div>

      <div className="mt-2 flex items-center gap-2">
        {inSync ? (
          <Button size="sm" variant="secondary" className="flex-1" onClick={() => browse(state.currentSlide)}>
            Browse slides
          </Button>
        ) : (
          <>
            <Button size="sm" variant="secondary" aria-label="Previous slide" onClick={() => browse(clampSlide(shown - 1))} disabled={shown <= 0}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button size="sm" variant="secondary" aria-label="Next slide" onClick={() => browse(clampSlide(shown + 1))} disabled={shown >= last}>
              <ChevronRight className="h-4 w-4" />
            </Button>
            <Button size="sm" variant="primary" className="flex-1" onClick={() => browse(null)}>
              <RadioTower className="h-4 w-4" /> Back to live{state.currentSlide !== shown ? ` (slide ${state.currentSlide + 1})` : ""}
            </Button>
          </>
        )}
      </div>
    </motion.section>
  );
}
