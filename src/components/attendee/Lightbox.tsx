"use client";

import { Download, X } from "lucide-react";
import { useRef, useState, type PointerEvent as RPointerEvent } from "react";
import { DialogClose, DialogContent, DialogDescription, DialogOverlay, DialogPortal, DialogRoot, DialogTitle } from "@/components/ui/Dialog";
import type { ContentItem } from "@/shared/types";

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));

/** Full-screen image viewer: pinch / wheel / double-tap zoom, drag to pan, swipe down to close. */
export function Lightbox({ item, onClose }: { item: ContentItem | null; onClose: () => void }) {
  return (
    <DialogRoot open={!!item} onOpenChange={(o) => !o && onClose()}>
      <DialogPortal>
        <DialogOverlay className="fixed inset-0 z-50 bg-black/95" />
        {item && <LightboxBody item={item} onClose={onClose} />}
      </DialogPortal>
    </DialogRoot>
  );
}

function LightboxBody({ item, onClose }: { item: ContentItem; onClose: () => void }) {
  const [t, setT] = useState({ s: 1, x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const ptrs = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{ d: number; s: number } | null>(null);
  const lastTap = useRef(0);
  const start = useRef({ x: 0, y: 0, tx: 0, ty: 0 });

  const dist = () => {
    const [a, b] = [...ptrs.current.values()];
    return Math.hypot(a.x - b.x, a.y - b.y);
  };

  const down = (e: RPointerEvent) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    ptrs.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (ptrs.current.size === 2) pinch.current = { d: dist(), s: t.s };
    else {
      start.current = { x: e.clientX, y: e.clientY, tx: t.x, ty: t.y };
      setDragging(true);
      const now = Date.now();
      if (now - lastTap.current < 280) setT((p) => (p.s > 1 ? { s: 1, x: 0, y: 0 } : { s: 2.5, x: 0, y: 0 }));
      lastTap.current = now;
    }
  };

  const move = (e: RPointerEvent) => {
    if (!ptrs.current.has(e.pointerId)) return;
    ptrs.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (ptrs.current.size === 2 && pinch.current) {
      const s = clamp((pinch.current.s * dist()) / pinch.current.d, 1, 6);
      setT((p) => (s === 1 ? { s, x: 0, y: 0 } : { ...p, s }));
    } else if (ptrs.current.size === 1) {
      const dx = e.clientX - start.current.x;
      const dy = e.clientY - start.current.y;
      setT((p) => (p.s > 1 ? { ...p, x: start.current.tx + dx, y: start.current.ty + dy } : { s: 1, x: 0, y: Math.max(0, dy) }));
    }
  };

  const up = (e: RPointerEvent) => {
    ptrs.current.delete(e.pointerId);
    if (ptrs.current.size < 2) pinch.current = null;
    if (ptrs.current.size === 0) {
      setDragging(false);
      setT((p) => {
        if (p.s <= 1 && p.y > 110) {
          queueMicrotask(onClose);
          return p;
        }
        return p.s <= 1 ? { s: 1, x: 0, y: 0 } : p;
      });
    }
  };

  return (
    <DialogContent className="fixed inset-0 z-50 flex flex-col outline-none" aria-describedby="lb-desc">
      <DialogTitle className="sr-only">{item.title || "Image"}</DialogTitle>
      <DialogDescription id="lb-desc" className="sr-only">
        Pinch or double-tap to zoom. Swipe down to close.
      </DialogDescription>
      <div className="flex items-center justify-between gap-2 px-4 pt-safe pb-2">
        <div className="min-w-0 text-white">
          <p className="truncate text-sm font-medium">{item.title || "Image"}</p>
          {item.body && <p className="truncate text-xs text-white/60">{item.body}</p>}
        </div>
        <div className="flex gap-2">
          {item.downloadUrl && (
            <a
              href={item.downloadUrl}
              download
              aria-label="Download image"
              className="flex h-11 w-11 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20"
            >
              <Download className="h-5 w-5" />
            </a>
          )}
          <DialogClose aria-label="Close" className="flex h-11 w-11 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20">
            <X className="h-5 w-5" />
          </DialogClose>
        </div>
      </div>
      <div
        className="relative flex flex-1 touch-none items-center justify-center overflow-hidden"
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={up}
        onWheel={(e) => setT((p) => ({ ...p, s: clamp(p.s * (e.deltaY < 0 ? 1.12 : 0.89), 1, 6) }))}
        style={{ opacity: t.s <= 1 ? clamp(1 - t.y / 400, 0.4, 1) : 1 }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={item.fileUrl ?? item.thumbUrl ?? ""}
          alt={item.title || item.body || "Shared image"}
          draggable={false}
          className="max-h-full max-w-full select-none object-contain"
          style={{
            transform: `translate(${t.x}px, ${t.y}px) scale(${t.s})`,
            transition: dragging ? "none" : "transform 0.2s ease-out",
          }}
        />
      </div>
    </DialogContent>
  );
}
