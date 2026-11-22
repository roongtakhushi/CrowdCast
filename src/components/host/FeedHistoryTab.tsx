"use client";

import { useMemo } from "react";
import { EmptyState } from "@/components/ui/Illustrations";
import { Card } from "@/components/ui/primitives";
import { useFeed } from "@/stores/feed";
import { useHost } from "./context";
import { ItemRow } from "./ItemRow";

/** Reverse-chronological log of everything broadcast, with delivery counts. */
export function FeedHistoryTab() {
  const { run } = useHost();
  const items = useFeed((s) => s.items);
  const list = useMemo(
    () => Object.values(items).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime() || b.seq - a.seq),
    [items],
  );
  return (
    <section aria-label="Feed history" className="space-y-3">
      <div className="flex items-baseline justify-between">
        <h2 className="text-base font-semibold">Feed history</h2>
        <p className="text-sm text-muted">{list.length} item{list.length === 1 ? "" : "s"}</p>
      </div>
      {list.length === 0 ? (
        <Card>
          <EmptyState kind="feed" title="Your broadcast history will appear here">
            Every announcement, image and PDF is listed with its delivery count. Re-send or remove any of them in one click.
          </EmptyState>
        </Card>
      ) : (
        <ul className="space-y-2">
          {list.map((i) => (
            <ItemRow key={i.id} item={i} showDelivery onPresent={(id) => void run({ type: "presentation_start", contentId: id, slide: 0 }, "Presenting live")} />
          ))}
        </ul>
      )}
    </section>
  );
}
