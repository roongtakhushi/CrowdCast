"use client";

import { ArrowDown, ArrowUp, Smartphone, UserX, Volume2, VolumeX, Search, Laptop } from "lucide-react";
import { useMemo, useState } from "react";
import { EmptyState } from "@/components/ui/Illustrations";
import { Badge, Button, Card, Input } from "@/components/ui/primitives";
import { formatClock } from "@/lib/utils";
import type { DeviceInfo, SignalQuality } from "@/shared/types";
import { useDevices } from "@/stores/devices";
import { useHost } from "./context";

type SortKey = "name" | "deviceType" | "joinedAt" | "status" | "rttMs";

const QUALITY_TONE: Record<SignalQuality, "ok" | "warn" | "bad" | "neutral"> = {
  excellent: "ok",
  good: "ok",
  weak: "warn",
  poor: "bad",
  unknown: "neutral",
};

export function QualityBadge({ quality }: { quality: SignalQuality }) {
  return <Badge tone={QUALITY_TONE[quality]}>{quality}</Badge>;
}

export function DevicesTab() {
  const { run } = useHost();
  const devices = useDevices((s) => s.devices);
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: "joinedAt", dir: -1 });
  const [confirmKick, setConfirmKick] = useState<string | null>(null);

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const list = devices.filter((d) => !needle || `${d.name} ${d.deviceType} ${d.browser} ${d.status}`.toLowerCase().includes(needle));
    const val = (d: DeviceInfo): string | number => (sort.key === "rttMs" ? (d.rttMs ?? Number.MAX_SAFE_INTEGER) : d[sort.key]);
    return [...list].sort((a, b) => {
      const x = val(a);
      const y = val(b);
      return (x < y ? -1 : x > y ? 1 : 0) * sort.dir;
    });
  }, [devices, q, sort]);

  const th = (key: SortKey, label: string) => (
    <th scope="col" aria-sort={sort.key === key ? (sort.dir === 1 ? "ascending" : "descending") : "none"} className="px-3 py-2.5 text-left font-medium">
      <button type="button" className="inline-flex items-center gap-1 hover:text-fg" onClick={() => setSort((s) => (s.key === key ? { key, dir: s.dir === 1 ? -1 : 1 } : { key, dir: 1 }))}>
        {label}
        {sort.key === key && (sort.dir === 1 ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />)}
      </button>
    </th>
  );

  return (
    <section aria-label="Connected devices" className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-base font-semibold">Devices</h2>
        <Badge tone="ok">{devices.filter((d) => d.status === "online").length} online</Badge>
        {devices.some((d) => d.status === "reconnecting") && <Badge tone="warn">{devices.filter((d) => d.status === "reconnecting").length} reconnecting</Badge>}
        <div className="relative ml-auto w-full sm:w-72">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden />
          <Input aria-label="Search devices" placeholder="Search name, type, browser…" value={q} onChange={(e) => setQ(e.target.value)} className="pl-9" />
        </div>
      </div>

      <Card className="overflow-hidden p-0">
        {devices.length === 0 ? (
          <EmptyState kind="devices" title="No devices connected yet">
            Show the QR code. Phones appear here the moment they join, with their latency and signal quality.
          </EmptyState>
        ) : rows.length === 0 ? (
          <p className="p-8 text-center text-sm text-muted">No devices match “{q}”.</p>
        ) : (
          <div className="overflow-x-auto scroll-thin">
            <table className="w-full min-w-[56rem] text-sm">
              <caption className="sr-only">Connected devices, updated in real time</caption>
              <thead className="border-b border-line text-xs uppercase tracking-wide text-muted">
                <tr>
                  {th("name", "Device")}
                  {th("deviceType", "Type")}
                  <th scope="col" className="px-3 py-2.5 text-left font-medium">Browser</th>
                  {th("joinedAt", "Joined")}
                  {th("status", "Status")}
                  {th("rttMs", "RTT")}
                  <th scope="col" className="px-3 py-2.5 text-left font-medium">Signal</th>
                  <th scope="col" className="px-3 py-2.5 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {rows.map((d) => (
                  <tr key={d.deviceId} className="hover:bg-surface-2/50">
                    <td className="px-3 py-2.5 font-medium">
                      {d.name}
                      {d.muted && <span className="ml-2 text-xs text-warn">muted</span>}
                    </td>
                    <td className="px-3 py-2.5">
                      <span className="inline-flex items-center gap-1.5 text-muted">
                        {d.deviceType === "Desktop" ? <Laptop className="h-4 w-4" aria-hidden /> : <Smartphone className="h-4 w-4" aria-hidden />}
                        {d.deviceType}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-muted">{d.browser}</td>
                    <td className="font-tech px-3 py-2.5 text-muted">{formatClock(d.joinedAt)}</td>
                    <td className="px-3 py-2.5">
                      <Badge tone={d.status === "online" ? "ok" : "warn"}>
                        <span className={`h-1.5 w-1.5 rounded-full ${d.status === "online" ? "bg-ok" : "animate-pulse bg-warn"}`} aria-hidden />
                        {d.status}
                      </Badge>
                    </td>
                    <td className="font-tech px-3 py-2.5">{d.rttMs !== null ? `${d.rttMs} ms` : "–"}</td>
                    <td className="px-3 py-2.5">
                      <QualityBadge quality={d.quality} />
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex justify-end gap-1">
                        <Button size="sm" variant="ghost" aria-label={`${d.muted ? "Unmute" : "Mute"} ${d.name}`} onClick={() => run({ type: "device_mute", deviceId: d.deviceId, muted: !d.muted }, d.muted ? `${d.name} unmuted` : `${d.name} muted`)}>
                          {d.muted ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
                        </Button>
                        {confirmKick === d.deviceId ? (
                          <Button
                            size="sm"
                            variant="danger"
                            onClick={async () => {
                              setConfirmKick(null);
                              await run({ type: "device_kick", deviceId: d.deviceId }, `${d.name} removed`);
                            }}
                            onBlur={() => setConfirmKick(null)}
                            autoFocus
                          >
                            Confirm kick
                          </Button>
                        ) : (
                          <Button
                            size="sm"
                            variant="ghost"
                            aria-label={`Kick ${d.name}`}
                            onClick={() => setConfirmKick(d.deviceId)}
                          >
                            <UserX className="h-4 w-4 text-bad" />
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </section>
  );
}
