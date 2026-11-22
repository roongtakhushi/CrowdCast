"use client";

import { FileText, ImageIcon, Megaphone, Pencil, Pin, PinOff, Presentation, Repeat2, Trash2 } from "lucide-react";
import { useState } from "react";
import { Dialog } from "@/components/ui/Dialog";
import { Badge, Button, Field, Input, Segmented, Textarea } from "@/components/ui/primitives";
import { formatBytes, formatShortTime } from "@/lib/utils";
import { PRIORITIES, type ContentItem, type Priority } from "@/shared/types";
import { useHost } from "./context";

const ICONS = { announcement: Megaphone, image: ImageIcon, pdf: FileText } as const;

export function EditDialog({ item, onClose }: { item: ContentItem | null; onClose: () => void }) {
  const { run } = useHost();
  const [title, setTitle] = useState(item?.title ?? "");
  const [body, setBody] = useState(item?.body ?? "");
  const [priority, setPriority] = useState<Priority>(item?.priority ?? "normal");
  const [busy, setBusy] = useState(false);
  if (!item) return null;
  const save = async () => {
    setBusy(true);
    const r = await run(
      { type: "content_edit", id: item.id, title, body: item.type === "pdf" ? undefined : body, priority: item.type === "announcement" ? priority : undefined },
      "Updated on all devices",
    );
    setBusy(false);
    if (r) onClose();
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()} title={`Edit ${item.type}`} description="Changes are pushed to every attendee immediately.">
      <div className="space-y-4">
        <Field label="Title" htmlFor="e-title">
          <Input id="e-title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} />
        </Field>
        {item.type !== "pdf" && (
          <Field label={item.type === "image" ? "Caption" : "Message"} htmlFor="e-body">
            <Textarea id="e-body" value={body} onChange={(e) => setBody(e.target.value)} maxLength={5000} />
          </Field>
        )}
        {item.type === "announcement" && (
          <Field label="Priority">
            <Segmented label="Priority" value={priority} onChange={setPriority} options={PRIORITIES.map((p) => ({ value: p, label: p[0].toUpperCase() + p.slice(1) }))} />
          </Field>
        )}
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" loading={busy} onClick={save}>
            Save changes
          </Button>
        </div>
      </div>
    </Dialog>
  );
}

export function ItemRow({ item, onPresent, showDelivery }: { item: ContentItem; onPresent?: (id: string) => void; showDelivery?: boolean }) {
  const { run } = useHost();
  const [editing, setEditing] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const Icon = ICONS[item.type];
  const label = item.title || item.body.slice(0, 80) || (item.type === "image" ? "Image" : "Untitled");

  return (
    <li className="glass flex flex-wrap items-center gap-3 rounded-2xl p-3 sm:flex-nowrap">
      {item.type === "image" && item.thumbUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={item.thumbUrl} alt="" className="h-12 w-12 shrink-0 rounded-lg object-cover" loading="lazy" />
      ) : (
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-surface-2 text-accent-text">
          <Icon className="h-5 w-5" aria-hidden />
        </span>
      )}
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{label}</p>
        <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted">
          <time dateTime={item.createdAt}>{formatShortTime(item.createdAt)}</time>
          <span aria-hidden>·</span>
          <span className="capitalize">{item.type}</span>
          {item.type === "pdf" && <span>· {item.pageCount}p · {formatBytes(item.sizeBytes)}</span>}
          {item.priority !== "normal" && <Badge tone={item.priority === "urgent" ? "bad" : "warn"}>{item.priority}</Badge>}
          {item.pinned && <Badge tone="accent">pinned</Badge>}
          {item.expiresAt && <Badge>expires {formatShortTime(item.expiresAt)}</Badge>}
          {showDelivery && <Badge tone="ok">delivered to {item.deliveredTo}</Badge>}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        {item.type === "pdf" && onPresent && (
          <Button size="sm" variant="ghost" onClick={() => onPresent(item.id)} aria-label="Present as live slides" title="Present as live slides">
            <Presentation className="h-4 w-4" />
          </Button>
        )}
        <Button size="sm" variant="ghost" aria-label={item.pinned ? "Unpin" : "Pin to top"} title={item.pinned ? "Unpin" : "Pin to top"} onClick={() => run({ type: "content_pin", id: item.id, pinned: !item.pinned })}>
          {item.pinned ? <PinOff className="h-4 w-4" /> : <Pin className="h-4 w-4" />}
        </Button>
        <Button size="sm" variant="ghost" aria-label="Edit" title="Edit" onClick={() => setEditing(true)}>
          <Pencil className="h-4 w-4" />
        </Button>
        <Button size="sm" variant="ghost" aria-label="Re-send" title="Re-send to everyone" onClick={() => run({ type: "content_resend", id: item.id }, "Re-sent to all devices")}>
          <Repeat2 className="h-4 w-4" />
        </Button>
        {confirm ? (
          <Button
            size="sm"
            variant="danger"
            onClick={async () => {
              setConfirm(false);
              await run({ type: "content_delete", id: item.id }, "Removed from all devices");
            }}
            onBlur={() => setConfirm(false)}
            autoFocus
          >
            Confirm
          </Button>
        ) : (
          <Button size="sm" variant="ghost" aria-label="Delete" title="Delete" onClick={() => setConfirm(true)}>
            <Trash2 className="h-4 w-4" />
          </Button>
        )}
      </div>
      {editing && <EditDialog key={item.id} item={item} onClose={() => setEditing(false)} />}
    </li>
  );
}
