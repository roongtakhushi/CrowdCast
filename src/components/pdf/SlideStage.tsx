"use client";

import { AnimatePresence, motion } from "framer-motion";
import { FileWarning } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { prefetchPages, usePageImage, usePdfDocument } from "@/lib/pdf";
import { cn } from "@/lib/utils";
import type { Pointer } from "@/stores/presentation";
import { Skeleton } from "@/components/ui/primitives";

function useSize<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setSize({ w: e.contentRect.width, h: e.contentRect.height }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, size] as const;
}

export function useInView<T extends HTMLElement>(rootMargin = "300px") {
  const ref = useRef<T>(null);
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || seen) return;
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) {
          setSeen(true);
          io.disconnect();
        }
      },
      { rootMargin },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [rootMargin, seen]);
  return [ref, seen] as const;
}

interface Props {
  url: string | null;
  /** 0-based slide index */
  page: number;
  pointer?: Pointer | null;
  blank?: boolean;
  width?: number;
  className?: string;
  alt?: string;
  onPointer?: (x: number, y: number, inside: boolean) => void;
}

/** Fits one PDF page in its container, crossfading between pages, with an optional laser dot. */
export function SlideStage({ url, page, pointer, blank, width = 1280, className, alt, onPointer }: Props) {
  const { doc, error, loading } = usePdfDocument(url);
  const { image, failed } = usePageImage(doc, url, page + 1, width);
  const [ref, size] = useSize<HTMLDivElement>();

  useEffect(() => {
    prefetchPages(doc, url, [page + 2, page + 3, page], width);
  }, [doc, url, page, width]);

  let fit: { w: number; h: number } | null = null;
  if (image && size.w > 0 && size.h > 0) {
    const ar = image.width / image.height;
    fit = size.w / size.h > ar ? { w: size.h * ar, h: size.h } : { w: size.w, h: size.w / ar };
  }

  return (
    <div ref={ref} className={cn("relative flex items-center justify-center overflow-hidden", className)}>
      {(loading || (!image && !error && !failed)) && <Skeleton className="absolute inset-4" />}
      {(error || failed) && (
        <div role="alert" className="flex flex-col items-center gap-2 text-sm text-muted">
          <FileWarning className="h-8 w-8" aria-hidden />
          Couldn’t render this slide
        </div>
      )}
      {fit && image && (
        <div
          className="relative"
          style={{ width: fit.w, height: fit.h }}
          onPointerMove={
            onPointer
              ? (e) => {
                  const r = e.currentTarget.getBoundingClientRect();
                  onPointer((e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height, true);
                }
              : undefined
          }
          onPointerLeave={onPointer ? () => onPointer(0, 0, false) : undefined}
        >
          <AnimatePresence initial={false}>
            <motion.img
              key={image.src}
              src={image.src}
              alt={alt ?? `Slide ${image.page}`}
              draggable={false}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.28 }}
              className="absolute inset-0 h-full w-full select-none rounded-lg bg-white shadow-lg"
            />
          </AnimatePresence>
          {pointer?.visible && !blank && (
            <motion.div
              aria-hidden
              className="pointer-events-none absolute -ml-2 -mt-2 h-4 w-4 rounded-full bg-red-500 shadow-[0_0_0_5px_rgba(239,68,68,0.35),0_0_18px_6px_rgba(239,68,68,0.55)]"
              initial={false}
              animate={{ left: `${pointer.x * 100}%`, top: `${pointer.y * 100}%` }}
              transition={{ type: "spring", stiffness: 700, damping: 45, mass: 0.3 }}
            />
          )}
        </div>
      )}
      {blank && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-black text-sm text-white/60">
          <span>Screen paused by the presenter</span>
        </div>
      )}
    </div>
  );
}

/** Lazily rendered page thumbnail (renders only when scrolled near the viewport). */
export function PageThumb({
  url,
  page,
  active,
  onClick,
  width = 360,
  label,
}: {
  url: string | null;
  page: number;
  active?: boolean;
  onClick?: () => void;
  width?: number;
  label?: string;
}) {
  const [ref, seen] = useInView<HTMLButtonElement>();
  const { doc } = usePdfDocument(seen ? url : null);
  const { image } = usePageImage(doc, url, page + 1, width);
  return (
    <button
      ref={ref}
      type="button"
      onClick={onClick}
      aria-label={label ?? `Go to slide ${page + 1}`}
      aria-current={active ? "true" : undefined}
      className={cn(
        "relative aspect-[4/3] w-28 shrink-0 overflow-hidden rounded-lg border bg-surface-2 transition",
        active ? "border-accent ring-2 ring-accent/50" : "border-line hover:border-line-strong",
      )}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {image ? <img src={image.src} alt="" className="h-full w-full bg-white object-contain" draggable={false} /> : <Skeleton className="h-full w-full rounded-none" />}
      <span className="absolute bottom-1 right-1 rounded bg-black/70 px-1.5 text-[10px] font-medium text-white font-tech">{page + 1}</span>
    </button>
  );
}
