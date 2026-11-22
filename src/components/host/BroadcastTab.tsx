"use client";

import { Image as ImageIcon, FileText, Megaphone, Send, Smile } from "lucide-react";
import { useMemo, useState, type FormEvent, type KeyboardEvent } from "react";
import { EmptyState } from "@/components/ui/Illustrations";
import { Button, Card, Field, Input, Segmented, Switch, Textarea } from "@/components/ui/primitives";
import { cn } from "@/lib/utils";
import { PRIORITIES, type Priority } from "@/shared/types";
import { useDevices } from "@/stores/devices";
import { sortFeed, useFeed } from "@/stores/feed";
import { useHost } from "./context";
import { FileUploader } from "./FileUploader";
import { ItemRow } from "./ItemRow";

function SectionTitle({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <h2 className="mb-4 flex items-center gap-2 text-base font-semibold">
      <span className="text-accent-text" aria-hidden>
        {icon}
      </span>
      {children}
    </h2>
  );
}

function AnnouncementComposer() {
  const { run } = useHost();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [priority, setPriority] = useState<Priority>("normal");
  const [pinned, setPinned] = useState(false);
  const [expire, setExpire] = useState("");
  const [sending, setSending] = useState(false);
  const [last, setLast] = useState<{ n: number; at: Date } | null>(null);
  const [error, setError] = useState("");

  const submit = async (e?: FormEvent) => {
    e?.preventDefault();
    if (!title.trim() && !body.trim()) {
      setError("Add a title or a message first.");
      return;
    }
    const mins = expire.trim() ? Number(expire) : null;
    if (mins !== null && (!Number.isInteger(mins) || mins < 1 || mins > 1440)) {
      setError("Auto-expire must be a whole number of minutes between 1 and 1440.");
      return;
    }
    setError("");
    setSending(true);
    const r = await run({ type: "content_send", title, body, priority, pinned, expireMinutes: mins });
    setSending(false);
    if (r) {
      setLast({ n: r.delivered ?? 0, at: new Date() });
      setTitle("");
      setBody("");
      setPinned(false);
      setExpire("");
      setPriority("normal");
    }
  };

  const onKey = (e: KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") void submit();
  };

  return (
    <Card>
      <SectionTitle icon={<Megaphone className="h-4 w-4" />}>Announcement</SectionTitle>
      <form onSubmit={submit} onKeyDown={onKey} className="space-y-4" noValidate>
        <Field label="Title" htmlFor="a-title">
          <Input id="a-title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} placeholder="Lunch is served in Hall B" />
        </Field>
        <Field label="Message" htmlFor="a-body" hint="Plain text. Line breaks are kept and links are made clickable automatically.">
          <Textarea id="a-body" value={body} onChange={(e) => setBody(e.target.value)} maxLength={5000} rows={4} placeholder="Details, links…" />
        </Field>
        <div className="flex flex-wrap items-end gap-x-6 gap-y-3">
          <Field label="Priority">
            <Segmented label="Priority" value={priority} onChange={setPriority} options={PRIORITIES.map((p) => ({ value: p, label: p[0].toUpperCase() + p.slice(1) }))} />
          </Field>
          <Field label="Auto-expire (min)" htmlFor="a-exp">
            <Input id="a-exp" value={expire} onChange={(e) => setExpire(e.target.value.replace(/\D/g, ""))} inputMode="numeric" placeholder="Never" className="w-28" />
          </Field>
        </div>
        <div className="-my-1 border-y border-line">
          <Switch checked={pinned} onChange={setPinned} label="Pin to top" description="Pinned items stay above newer ones on every device." />
        </div>
        {priority === "urgent" && <p className="rounded-xl border border-bad/30 bg-bad/10 p-3 text-xs text-bad">Urgent announcements vibrate phones and show a banner over everything.</p>}
        {error && (
          <p role="alert" className="text-sm text-bad">
            {error}
          </p>
        )}
        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" variant="primary" size="lg" loading={sending}>
            <Send className="h-4 w-4" /> Send to all
          </Button>
          {last && (
            <p role="status" className="text-sm text-ok">
              Delivered to {last.n} device{last.n === 1 ? "" : "s"}
            </p>
          )}
          <span className="ml-auto hidden text-xs text-muted sm:block">⌘/Ctrl + Enter</span>
        </div>
      </form>
    </Card>
  );
}

function ReactionsCard() {
  const reactions = useDevices((s) => s.reactions);
  const entries = Object.entries(reactions).sort((a, b) => b[1] - a[1]);
  return (
    <Card>
      <SectionTitle icon={<Smile className="h-4 w-4" />}>Live reactions</SectionTitle>
      {entries.length === 0 ? (
        <p className="text-sm text-muted">No reactions yet. They’ll show up here, aggregated, as attendees tap them.</p>
      ) : (
        <ul className="flex flex-wrap gap-2" aria-live="polite">
          {entries.map(([emoji, n]) => (
            <li key={emoji} className="flex items-center gap-2 rounded-full border border-line bg-surface-2 px-3 py-1.5">
              <span className="text-xl">{emoji}</span>
              <span className="font-tech text-sm font-semibold">{n}</span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

export function BroadcastTab({ onGoPresentation }: { onGoPresentation: () => void }) {
  const { run } = useHost();
  const items = useFeed((s) => s.items);
  const recent = useMemo(() => sortFeed(items).slice(0, 6), [items]);
  return (
    <div className="space-y-5">
      <div className="grid gap-5 xl:grid-cols-2">
        <AnnouncementComposer />
        <div className="space-y-5">
          <Card>
            <SectionTitle icon={<ImageIcon className="h-4 w-4" />}>Images</SectionTitle>
            <FileUploader kind="image" />
          </Card>
          <Card>
            <SectionTitle icon={<FileText className="h-4 w-4" />}>PDF</SectionTitle>
            <FileUploader kind="pdf" onPresent={onGoPresentation} />
          </Card>
        </div>
      </div>
      <div className="grid gap-5 xl:grid-cols-[1fr_20rem]">
        <section aria-label="Recently sent">
          <h2 className="mb-3 text-base font-semibold">Recently sent</h2>
          {recent.length === 0 ? (
            <Card>
              <EmptyState kind="feed" title="Nothing broadcast yet">
                Send your first announcement and it will land on every connected phone within a moment.
              </EmptyState>
            </Card>
          ) : (
            <ul className="space-y-2">
              {recent.map((i) => (
                <ItemRow
                  key={i.id}
                  item={i}
                  showDelivery
                  onPresent={async (id) => {
                    const r = await run({ type: "presentation_start", contentId: id, slide: 0 }, "Presenting live");
                    if (r) onGoPresentation();
                  }}
                />
              ))}
            </ul>
          )}
        </section>
        <div className={cn("self-start")}>
          <ReactionsCard />
        </div>
      </div>
    </div>
  );
}
