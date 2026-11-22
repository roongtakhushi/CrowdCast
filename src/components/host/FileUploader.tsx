"use client";

import { CheckCircle2, FileText, ImagePlus, Upload, X, XCircle } from "lucide-react";
import { useCallback, useEffect, useRef, useState, type DragEvent } from "react";
import { toast } from "sonner";
import { Button, Input, ProgressBar, Segmented } from "@/components/ui/primitives";
import { uploadFile } from "@/lib/api";
import { cn, formatBytes, randomId } from "@/lib/utils";
import { useHost } from "./context";

interface QItem {
  id: string;
  file: File;
  preview: string | null;
  text: string;
  mode: "document" | "presentation";
  progress: number;
  status: "ready" | "uploading" | "done" | "error";
  error?: string;
  delivered?: number;
}

const IMG_RE = /\.(jpe?g|png|webp|gif)$/i;
const LIMITS = { image: 10 * 1024 * 1024, pdf: 30 * 1024 * 1024 } as const;

export function FileUploader({ kind, onPresent }: { kind: "image" | "pdf"; onPresent?: () => void }) {
  const { code, token } = useHost();
  const [queue, setQueue] = useState<QItem[]>([]);
  const [over, setOver] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const previews = useRef(new Set<string>());

  useEffect(() => {
    const set = previews.current;
    return () => set.forEach((u) => URL.revokeObjectURL(u));
  }, []);

  const patch = useCallback((id: string, p: Partial<QItem>) => setQueue((q) => q.map((i) => (i.id === id ? { ...i, ...p } : i))), []);

  const add = (files: FileList | File[]) => {
    const next: QItem[] = [];
    for (const file of Array.from(files)) {
      const okType = kind === "image" ? IMG_RE.test(file.name) || /^image\/(jpeg|png|webp|gif)$/.test(file.type) : /\.pdf$/i.test(file.name) || file.type === "application/pdf";
      let error: string | undefined;
      if (!okType) error = kind === "image" ? "Only JPEG, PNG, WebP or GIF images" : "Only PDF files";
      else if (file.size > LIMITS[kind]) error = `Too large (max ${formatBytes(LIMITS[kind])})`;
      let preview: string | null = null;
      if (kind === "image" && !error) {
        preview = URL.createObjectURL(file);
        previews.current.add(preview);
      }
      next.push({ id: randomId(8), file, preview, text: kind === "pdf" ? file.name.replace(/\.pdf$/i, "") : "", mode: "document", progress: 0, status: error ? "error" : "ready", error });
    }
    setQueue((q) => [...q, ...next]);
  };

  const send = async (item: QItem) => {
    patch(item.id, { status: "uploading", progress: 0, error: undefined });
    try {
      const fields: Record<string, string> = kind === "image" ? { caption: item.text } : { title: item.text, mode: item.mode };
      const res = await uploadFile({ code, token, file: item.file, kind, fields, onProgress: (p) => patch(item.id, { progress: p }) });
      patch(item.id, { status: "done", progress: 100, delivered: res.delivered });
      toast.success(`${kind === "image" ? "Image" : "PDF"} delivered to ${res.delivered} device${res.delivered === 1 ? "" : "s"}`);
      if (kind === "pdf" && item.mode === "presentation") onPresent?.();
    } catch (e) {
      patch(item.id, { status: "error", error: e instanceof Error ? e.message : "Upload failed" });
    }
  };

  const drop = (e: DragEvent) => {
    e.preventDefault();
    setOver(false);
    if (e.dataTransfer.files.length) add(e.dataTransfer.files);
  };

  const pending = queue.filter((i) => i.status === "ready");
  const Icon = kind === "image" ? ImagePlus : FileText;

  return (
    <div className="space-y-3">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={drop}
        className={cn("flex flex-col items-center gap-2 rounded-2xl border-2 border-dashed p-6 text-center transition", over ? "border-accent bg-accent/10" : "border-line-strong bg-surface-2/50")}
      >
        <Icon className="h-7 w-7 text-accent-text" aria-hidden />
        <p className="text-sm">
          Drag {kind === "image" ? "images" : "a PDF"} here or{" "}
          <button type="button" className="font-medium text-accent-text underline underline-offset-2" onClick={() => input.current?.click()}>
            browse files
          </button>
        </p>
        <p className="text-xs text-muted">{kind === "image" ? "JPEG, PNG, WebP, GIF · up to 10 MB each" : "PDF · up to 30 MB"}</p>
        <input
          ref={input}
          type="file"
          className="sr-only"
          tabIndex={-1}
          accept={kind === "image" ? "image/jpeg,image/png,image/webp,image/gif" : "application/pdf"}
          multiple={kind === "image"}
          aria-label={kind === "image" ? "Choose images" : "Choose a PDF"}
          onChange={(e) => {
            if (e.target.files) add(e.target.files);
            e.target.value = "";
          }}
        />
      </div>

      {queue.length > 0 && (
        <ul className="space-y-2">
          {queue.map((i) => (
            <li key={i.id} className="rounded-xl border border-line bg-surface-2/60 p-3">
              <div className="flex items-start gap-3">
                {i.preview ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={i.preview} alt="" className="h-14 w-14 shrink-0 rounded-lg object-cover" />
                ) : (
                  <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg bg-surface-2 text-bad">
                    <FileText className="h-6 w-6" aria-hidden />
                  </span>
                )}
                <div className="min-w-0 flex-1 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate text-sm font-medium">{i.file.name}</p>
                    <span className="flex items-center gap-1.5 text-xs text-muted">
                      {formatBytes(i.file.size)}
                      {i.status === "done" && <CheckCircle2 className="h-4 w-4 text-ok" aria-label="Sent" />}
                      {i.status === "error" && <XCircle className="h-4 w-4 text-bad" aria-label="Failed" />}
                      {i.status !== "uploading" && (
                        <button type="button" aria-label={`Remove ${i.file.name}`} onClick={() => setQueue((q) => q.filter((x) => x.id !== i.id))} className="rounded p-0.5 hover:bg-surface-2">
                          <X className="h-4 w-4" />
                        </button>
                      )}
                    </span>
                  </div>
                  {(i.status === "ready" || i.status === "uploading") && (
                    <Input
                      value={i.text}
                      onChange={(e) => patch(i.id, { text: e.target.value })}
                      placeholder={kind === "image" ? "Caption (optional)" : "Title (optional)"}
                      aria-label={kind === "image" ? "Caption" : "Title"}
                      maxLength={kind === "image" ? 2000 : 120}
                      disabled={i.status === "uploading"}
                      className="h-9"
                    />
                  )}
                  {kind === "pdf" && i.status === "ready" && (
                    <Segmented
                      label="Send as"
                      value={i.mode}
                      onChange={(mode) => patch(i.id, { mode })}
                      options={[
                        { value: "document", label: "Document" },
                        { value: "presentation", label: "Live presentation" },
                      ]}
                    />
                  )}
                  {i.status === "uploading" && <ProgressBar value={i.progress} />}
                  {i.status === "done" && <p className="text-xs text-ok">Delivered to {i.delivered ?? 0} devices</p>}
                  {i.error && (
                    <p role="alert" className="text-xs text-bad">
                      {i.error}
                    </p>
                  )}
                </div>
              </div>
              {i.status === "ready" && (
                <div className="mt-2 flex justify-end">
                  <Button size="sm" variant="primary" onClick={() => send(i)}>
                    <Upload className="h-4 w-4" /> Send to all
                  </Button>
                </div>
              )}
              {i.status === "error" && i.file.size <= LIMITS[kind] && (
                <div className="mt-2 flex justify-end">
                  <Button size="sm" variant="secondary" onClick={() => send(i)}>
                    Retry
                  </Button>
                </div>
              )}
            </li>
          ))}
          {pending.length > 1 && (
            <Button variant="primary" className="w-full" onClick={() => pending.forEach((p) => void send(p))}>
              Send all {pending.length} to everyone
            </Button>
          )}
        </ul>
      )}
    </div>
  );
}
