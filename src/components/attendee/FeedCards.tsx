"use client";

import { motion } from "framer-motion";
import { AlertTriangle, Download, FileText, Megaphone, Pin, ZoomIn } from "lucide-react";
import { useState } from "react";
import { Badge, Button, Skeleton } from "@/components/ui/primitives";
import { RichText } from "@/lib/linkify";
import { cn, formatBytes, formatShortTime } from "@/lib/utils";
import type { ContentItem } from "@/shared/types";

const spring = { type: "spring", stiffness: 340, damping: 30 } as const;

function Shell({ item, children, icon }: { item: ContentItem; children: React.ReactNode; icon: React.ReactNode }) {
  const urgent = item.priority === "urgent";
  const important = item.priority === "important";
  return (
    <motion.article
      layout
      initial={{ opacity: 0, y: -28, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95, transition: { duration: 0.18 } }}
      transition={spring}
      aria-label={item.title || item.type}
      className={cn(
        "glass relative overflow-hidden rounded-2xl p-4",
        urgent && "border-bad/60 bg-bad/10",
        important && "border-warn/40",
      )}
    >
      {(urgent || important) && <span aria-hidden className={cn("absolute inset-y-0 left-0 w-1", urgent ? "bg-bad" : "bg-warn")} />}
      <div className="mb-2 flex flex-wrap items-center gap-2 text-xs text-muted">
        {icon}
        <time dateTime={item.createdAt}>{formatShortTime(item.createdAt)}</time>
        {item.pinned && (
          <Badge tone="accent">
            <Pin className="h-3 w-3" aria-hidden /> Pinned
          </Badge>
        )}
        {urgent && (
          <Badge tone="bad">
            <AlertTriangle className="h-3 w-3" aria-hidden /> Urgent
          </Badge>
        )}
        {important && <Badge tone="warn">Important</Badge>}
      </div>
      {children}
    </motion.article>
  );
}

export function AnnouncementCard({ item }: { item: ContentItem }) {
  return (
    <Shell item={item} icon={<Megaphone className="h-3.5 w-3.5" aria-hidden />}>
      {item.title && <h3 className="text-base font-semibold leading-snug">{item.title}</h3>}
      {item.body && <RichText text={item.body} className="mt-1 text-[15px] leading-relaxed text-fg/90" />}
    </Shell>
  );
}

export function ImageCard({ item, onOpen }: { item: ContentItem; onOpen: (i: ContentItem) => void }) {
  const [loaded, setLoaded] = useState(false);
  return (
    <Shell item={item} icon={<ZoomIn className="h-3.5 w-3.5" aria-hidden />}>
      {item.title && <h3 className="mb-2 text-base font-semibold leading-snug">{item.title}</h3>}
      <button type="button" onClick={() => onOpen(item)} className="relative block w-full overflow-hidden rounded-xl bg-surface-2" aria-label={`Open image${item.title ? `: ${item.title}` : ""}`}>
        {!loaded && <Skeleton className="aspect-[4/3] w-full" />}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={item.thumbUrl ?? item.fileUrl ?? ""}
          alt={item.body || item.title || "Shared image"}
          loading="lazy"
          decoding="async"
          onLoad={() => setLoaded(true)}
          className={cn("max-h-[60dvh] w-full object-contain transition-opacity", loaded ? "opacity-100" : "absolute inset-0 opacity-0")}
        />
      </button>
      {item.body && <RichText text={item.body} className="mt-2 text-sm text-muted" />}
    </Shell>
  );
}

export function PdfCard({ item, onOpen }: { item: ContentItem; onOpen: (i: ContentItem) => void }) {
  return (
    <Shell item={item} icon={<FileText className="h-3.5 w-3.5" aria-hidden />}>
      <div className="flex items-center gap-3">
        <div aria-hidden className="flex h-14 w-12 shrink-0 items-center justify-center rounded-lg border border-line bg-surface-2 text-[11px] font-bold text-bad">
          PDF
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-base font-semibold">{item.title}</h3>
          <p className="text-xs text-muted">
            {item.pageCount} {item.pageCount === 1 ? "page" : "pages"} · {formatBytes(item.sizeBytes)}
          </p>
        </div>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <Button variant="primary" size="md" onClick={() => onOpen(item)} className="w-full">
          Open reader
        </Button>
        <a
          href={item.downloadUrl ?? "#"}
          download
          className="inline-flex h-10 items-center justify-center gap-1.5 rounded-xl border border-line bg-surface-2 text-sm font-medium hover:bg-surface-2/80 active:scale-[0.97] transition-all"
        >
          <Download className="h-4 w-4" aria-hidden /> Download
        </a>
      </div>
    </Shell>
  );
}
