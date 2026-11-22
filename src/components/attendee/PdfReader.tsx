"use client";

import { Download, Minus, Plus, X } from "lucide-react";
import { useState } from "react";
import { useInView } from "@/components/pdf/SlideStage";
import { DialogClose, DialogContent, DialogDescription, DialogOverlay, DialogPortal, DialogRoot, DialogTitle } from "@/components/ui/Dialog";
import { Skeleton } from "@/components/ui/primitives";
import { usePageImage, usePdfDocument } from "@/lib/pdf";
import type { ContentItem } from "@/shared/types";
import type { PDFDocumentProxy } from "pdfjs-dist";

function ReaderPage({ doc, url, page, width }: { doc: PDFDocumentProxy; url: string; page: number; width: number }) {
  const [ref, seen] = useInView<HTMLDivElement>("600px");
  const { image, failed } = usePageImage(seen ? doc : null, url, page, width);
  return (
    <div ref={ref} className="mx-auto w-full" style={{ aspectRatio: image ? `${image.width}/${image.height}` : "1/1.414" }}>
      {image ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={image.src} alt={`Page ${page}`} className="h-full w-full rounded-md bg-white shadow-md" draggable={false} />
      ) : failed ? (
        <p className="p-6 text-center text-sm text-white/60">Page {page} failed to render</p>
      ) : (
        <Skeleton className="h-full w-full" />
      )}
    </div>
  );
}

/** In-app PDF reader: lazy page rendering, native pinch-zoom + scroll, zoom buttons for desktop. */
export function PdfReader({ item, onClose }: { item: ContentItem | null; onClose: () => void }) {
  return (
    <DialogRoot open={!!item} onOpenChange={(o) => !o && onClose()}>
      <DialogPortal>
        <DialogOverlay className="fixed inset-0 z-50 bg-black/90" />
        {item && <ReaderBody item={item} />}
      </DialogPortal>
    </DialogRoot>
  );
}

function ReaderBody({ item }: { item: ContentItem }) {
  const { doc, error, loading } = usePdfDocument(item.fileUrl);
  const [zoom, setZoom] = useState(1);
  const width = typeof window === "undefined" ? 1000 : Math.min(1600, Math.round(window.innerWidth * Math.min(window.devicePixelRatio || 1, 2) * zoom));
  return (
    <DialogContent className="fixed inset-0 z-50 flex flex-col outline-none" aria-describedby="pdf-desc">
      <DialogTitle className="sr-only">{item.title}</DialogTitle>
      <DialogDescription id="pdf-desc" className="sr-only">
        Scroll to read. Pinch to zoom.
      </DialogDescription>
      <div className="flex items-center justify-between gap-2 px-4 pt-safe pb-2 text-white">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{item.title}</p>
          <p className="text-xs text-white/60">{item.pageCount} pages</p>
        </div>
        <div className="flex gap-2">
          <button type="button" aria-label="Zoom out" onClick={() => setZoom((z) => Math.max(1, +(z - 0.5).toFixed(1)))} className="hidden h-11 w-11 items-center justify-center rounded-full bg-white/10 hover:bg-white/20 sm:flex">
            <Minus className="h-5 w-5" />
          </button>
          <button type="button" aria-label="Zoom in" onClick={() => setZoom((z) => Math.min(3, +(z + 0.5).toFixed(1)))} className="hidden h-11 w-11 items-center justify-center rounded-full bg-white/10 hover:bg-white/20 sm:flex">
            <Plus className="h-5 w-5" />
          </button>
          {item.downloadUrl && (
            <a href={item.downloadUrl} download aria-label="Download PDF" className="flex h-11 w-11 items-center justify-center rounded-full bg-white/10 hover:bg-white/20">
              <Download className="h-5 w-5" />
            </a>
          )}
          <DialogClose aria-label="Close reader" className="flex h-11 w-11 items-center justify-center rounded-full bg-white/10 hover:bg-white/20">
            <X className="h-5 w-5" />
          </DialogClose>
        </div>
      </div>
      <div className="scroll-thin flex-1 overflow-auto px-2 pb-safe" style={{ touchAction: "pan-x pan-y pinch-zoom" }}>
        <div className="mx-auto space-y-3 py-2" style={{ width: `${zoom * 100}%`, maxWidth: zoom === 1 ? "56rem" : undefined }}>
          {loading && <Skeleton className="aspect-[1/1.414] w-full" />}
          {error && (
            <p role="alert" className="py-12 text-center text-white/70">
              Couldn’t open this PDF. Try downloading it instead.
            </p>
          )}
          {doc && item.fileUrl && Array.from({ length: doc.numPages }, (_, i) => <ReaderPage key={i} doc={doc} url={item.fileUrl as string} page={i + 1} width={width} />)}
        </div>
      </div>
    </DialogContent>
  );
}
