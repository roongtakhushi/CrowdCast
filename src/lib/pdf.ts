"use client";

import type { PDFDocumentProxy } from "pdfjs-dist";
import { useEffect, useState } from "react";

/**
 * PDF rendering via react-pdf's bundled pdf.js. The worker is served from our own
 * origin (/pdf.worker.min.mjs, copied from node_modules) - never from a CDN.
 */
type PdfJs = (typeof import("react-pdf"))["pdfjs"];

let pdfjsPromise: Promise<PdfJs> | null = null;
function loadPdfjs(): Promise<PdfJs> {
  pdfjsPromise ??= import("react-pdf").then((m) => {
    m.pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
    return m.pdfjs;
  });
  return pdfjsPromise;
}

const docs = new Map<string, Promise<PDFDocumentProxy>>();

export function getPdfDocument(url: string): Promise<PDFDocumentProxy> {
  let p = docs.get(url);
  if (!p) {
    p = loadPdfjs().then((js) => js.getDocument({ url }).promise);
    docs.set(url, p);
    p.catch(() => docs.delete(url));
  }
  return p;
}

export function usePdfDocument(url: string | null) {
  const [state, setState] = useState<{ url: string | null; doc: PDFDocumentProxy | null; error: boolean }>({
    url: null,
    doc: null,
    error: false,
  });
  useEffect(() => {
    if (!url) return;
    let cancelled = false;
    getPdfDocument(url)
      .then((doc) => !cancelled && setState({ url, doc, error: false }))
      .catch(() => !cancelled && setState({ url, doc: null, error: true }));
    return () => {
      cancelled = true;
    };
  }, [url]);
  const fresh = state.url === url;
  return {
    doc: fresh ? state.doc : null,
    error: fresh && state.error,
    loading: !!url && !(fresh && (state.doc || state.error)),
  };
}

export interface PageImage {
  src: string;
  width: number;
  height: number;
  page: number;
}

const images = new Map<string, Promise<PageImage>>();

/** Render 1-based `page` of `doc` to a JPEG blob URL at roughly `width` CSS-independent pixels. */
export function renderPage(doc: PDFDocumentProxy, url: string, page: number, width: number): Promise<PageImage> {
  const key = `${url}|${page}|${width}`;
  const hit = images.get(key);
  if (hit) return hit;
  const p = (async () => {
    const pg = await doc.getPage(page);
    const base = pg.getViewport({ scale: 1 });
    const viewport = pg.getViewport({ scale: width / base.width });
    const canvas = document.createElement("canvas");
    canvas.width = Math.floor(viewport.width);
    canvas.height = Math.floor(viewport.height);
    await pg.render({ canvas, viewport }).promise;
    const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/jpeg", 0.88));
    if (!blob) throw new Error("render failed");
    const out: PageImage = { src: URL.createObjectURL(blob), width: canvas.width, height: canvas.height, page };
    canvas.width = canvas.height = 0;
    return out;
  })();
  images.set(key, p);
  p.catch(() => images.delete(key));
  if (images.size > 160) {
    const oldest = images.keys().next().value;
    if (oldest !== undefined) {
      const old = images.get(oldest);
      images.delete(oldest);
      void old?.then((i) => URL.revokeObjectURL(i.src)).catch(() => undefined);
    }
  }
  return p;
}

/** Keeps showing the previous page until the next one is rendered (enables crossfades). */
export function usePageImage(doc: PDFDocumentProxy | null, url: string | null, page: number, width: number) {
  const [image, setImage] = useState<PageImage | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (!doc || !url) return;
    let cancelled = false;
    const clamped = Math.min(Math.max(1, page), doc.numPages);
    renderPage(doc, url, clamped, width)
      .then((img) => {
        if (!cancelled) {
          setImage(img);
          setFailed(false);
        }
      })
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
    };
  }, [doc, url, page, width]);
  return { image, failed };
}

/** Pre-render neighbours so slide changes are instant. */
export function prefetchPages(doc: PDFDocumentProxy | null, url: string | null, pages: number[], width: number) {
  if (!doc || !url) return;
  for (const p of pages) {
    if (p >= 1 && p <= doc.numPages) void renderPage(doc, url, p, width).catch(() => undefined);
  }
}
