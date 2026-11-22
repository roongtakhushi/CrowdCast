"use client";

import { motion, useReducedMotion } from "framer-motion";
import { Eraser, Pause, Play, Server } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { EmptyState } from "@/components/ui/Illustrations";
import { Badge, Button, Card } from "@/components/ui/primitives";
import { formatBytes, formatClock, formatUptime } from "@/lib/utils";
import type { DeviceInfo, LogEntry } from "@/shared/types";
import { useDevices } from "@/stores/devices";
import { useJoinUrl } from "./SharePanel";
import { useHost } from "./context";

function ServerPanel() {
  const { code } = useHost();
  const { joinUrl, info, selected } = useJoinUrl(code);
  const stats = useDevices((s) => s.stats);
  const devices = useDevices((s) => s.devices);
  const host = selected ? new URL(selected).hostname : "…";
  const port = selected ? new URL(selected).port || String(info?.port ?? "") : "";
  const rows: [string, string][] = [
    ["LAN IP", host],
    ["Port", port || String(info?.port ?? "…")],
    ["Join URL", joinUrl || "…"],
    ["Server uptime", stats ? formatUptime(stats.uptimeSec) : "…"],
    ["Down-link", "HTTP stream · text/event-stream (SSE)"],
    ["Up-link", "HTTP POST · JSON actions + acks"],
    ["Platform", info?.platform ?? "…"],
  ];
  return (
    <Card>
      <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold">
        <Server className="h-4 w-4 text-accent-text" aria-hidden /> Server
      </h3>
      <dl className="space-y-2 text-sm">
        {rows.map(([k, v]) => (
          <div key={k} className="flex items-baseline justify-between gap-4">
            <dt className="shrink-0 text-muted">{k}</dt>
            <dd className="font-tech break-all text-right text-xs">{v}</dd>
          </div>
        ))}
      </dl>
      <div className="mt-4 border-t border-line pt-3">
        <p className="mb-2 text-xs font-medium text-muted">Transport per client</p>
        {devices.length === 0 ? (
          <p className="text-xs text-muted">No clients connected.</p>
        ) : (
          <ul className="scroll-thin max-h-32 space-y-1 overflow-y-auto pr-1 text-xs">
            {devices.map((d) => (
              <li key={d.deviceId} className="flex items-center justify-between gap-2">
                <span className="truncate">{d.name}</span>
                <Badge tone={d.status === "online" ? "accent" : "warn"}>{d.status === "online" ? "sse · stream" : "reconnecting"}</Badge>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Card>
  );
}

function Chart({ title, dataKey, color, unit, stepped }: { title: string; dataKey: "connected" | "rtt"; color: string; unit: string; stepped?: boolean }) {
  const series = useDevices((s) => s.series);
  const data = useMemo(() => series.map((p) => ({ t: formatClock(p.t), connected: p.connected, rtt: p.rtt })), [series]);
  return (
    <Card>
      <h3 className="mb-3 text-sm font-semibold">{title}</h3>
      {data.length < 2 ? (
        <EmptyState kind="chart" title="Collecting data…">
          The chart fills in once per second.
        </EmptyState>
      ) : (
        <div className="h-48" role="img" aria-label={`${title} over time`}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 4, right: 8, left: -18, bottom: 0 }}>
              <CartesianGrid stroke="var(--line)" strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="t" tick={{ fill: "var(--muted)", fontSize: 10 }} tickLine={false} axisLine={false} minTickGap={40} />
              <YAxis allowDecimals={false} tick={{ fill: "var(--muted)", fontSize: 10 }} tickLine={false} axisLine={false} domain={[0, (max: number) => Math.max(4, Math.ceil(max * 1.2))]} />
              <Tooltip
                contentStyle={{ background: "var(--bg-2)", border: "1px solid var(--line-strong)", borderRadius: 12, fontSize: 12, color: "var(--fg)" }}
                formatter={(v) => [`${v ?? "–"} ${unit}`, title]}
              />
              <Line type={stepped ? "stepAfter" : "monotone"} dataKey={dataKey} stroke={color} strokeWidth={2} dot={false} isAnimationActive={false} connectNulls />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </Card>
  );
}

function EventLog() {
  const logs = useDevices((s) => s.logs);
  const clear = useDevices((s) => s.clearLogs);
  const [paused, setPaused] = useState(false);
  const [frozen, setFrozen] = useState<LogEntry[]>([]);
  const box = useRef<HTMLDivElement>(null);
  const shown = paused ? frozen : logs;

  useEffect(() => {
    if (!paused && box.current) box.current.scrollTop = box.current.scrollHeight;
  }, [logs, paused]);

  return (
    <Card className="p-0">
      <div className="flex items-center justify-between gap-2 border-b border-line px-4 py-3">
        <h3 className="text-sm font-semibold">
          Event log <span className="font-normal text-muted">· every broadcast, bytes, recipients, acks</span>
        </h3>
        <div className="flex gap-1.5">
          <Button
            size="sm"
            variant="secondary"
            aria-pressed={paused}
            onClick={() => {
              setFrozen(logs);
              setPaused((p) => !p);
            }}
          >
            {paused ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />} {paused ? "Resume" : "Pause"}
          </Button>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => {
              clear();
              setFrozen([]);
            }}
          >
            <Eraser className="h-4 w-4" /> Clear
          </Button>
        </div>
      </div>
      <div ref={box} role="log" aria-label="Broadcast event log" className="font-tech scroll-thin h-64 overflow-auto bg-black/60 p-3 text-xs leading-relaxed text-emerald-300">
        {shown.length === 0 ? (
          <p className="text-emerald-300/60">$ waiting for broadcasts…</p>
        ) : (
          shown.map((l) => (
            <div key={l.id} className="whitespace-nowrap">
              <span className="text-slate-500">[{formatClock(l.ts, true)}]</span>{" "}
              <span className="text-cyan-300">{l.event.padEnd(20)}</span>{" "}
              <span className="text-slate-300">{formatBytes(l.bytes).padStart(8)}</span>{" "}
              <span className="text-indigo-300">→ {String(l.recipients).padStart(3)} rcpt</span>{" "}
              <span className={l.acks >= l.recipients - 1 && l.recipients > 0 ? "text-emerald-300" : "text-amber-300"}>ack {l.acks}</span>
              {l.seq !== null && <span className="text-slate-500"> seq={l.seq}</span>}
            </div>
          ))
        )}
      </div>
    </Card>
  );
}

const MAX_NODES = 60;
const QUALITY_COLOR: Record<DeviceInfo["quality"], string> = {
  excellent: "var(--ok)",
  good: "var(--ok)",
  weak: "var(--warn)",
  poor: "var(--bad)",
  unknown: "var(--muted)",
};

function FanOut() {
  const devices = useDevices((s) => s.devices);
  const pulse = useDevices((s) => s.pulse);
  const reduce = useReducedMotion();
  const shown = devices.slice(0, MAX_NODES);
  const extra = devices.length - shown.length;
  const total = shown.length + (extra > 0 ? 1 : 0);
  const cx = 180;
  const cy = 140;
  const pos = (i: number) => {
    const a = (i / Math.max(1, total)) * Math.PI * 2 - Math.PI / 2;
    return { x: cx + Math.cos(a) * 118, y: cy + Math.sin(a) * 104 };
  };
  return (
    <Card>
      <h3 className="mb-1 text-sm font-semibold">Broadcast fan-out</h3>
      <p className="mb-2 text-xs text-muted">One send from the server is copied to every connected device. Lines pulse on each broadcast.</p>
      <svg viewBox="0 0 360 280" className="mx-auto w-full max-w-md" role="img" aria-label={`Server connected to ${devices.length} devices`}>
        <defs>
          <linearGradient id="fan-grad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#6366f1" />
            <stop offset="1" stopColor="#22d3ee" />
          </linearGradient>
        </defs>
        {Array.from({ length: total }, (_, i) => {
          const p = pos(i);
          return (
            <g key={i}>
              <line x1={cx} y1={cy} x2={p.x} y2={p.y} stroke="var(--line-strong)" strokeWidth={1} />
              {pulse > 0 && !reduce && (
                <motion.line
                  key={`${pulse}-${i}`}
                  x1={cx}
                  y1={cy}
                  x2={p.x}
                  y2={p.y}
                  stroke="url(#fan-grad)"
                  strokeWidth={2}
                  initial={{ pathLength: 0, opacity: 1 }}
                  animate={{ pathLength: 1, opacity: 0 }}
                  transition={{ duration: 0.9, ease: "easeOut" }}
                />
              )}
            </g>
          );
        })}
        {shown.map((d, i) => {
          const p = pos(i);
          return <circle key={d.deviceId} cx={p.x} cy={p.y} r={shown.length > 30 ? 4 : 6} fill={QUALITY_COLOR[d.quality]} opacity={d.status === "online" ? 1 : 0.4}><title>{`${d.name} · ${d.rttMs ?? "–"} ms`}</title></circle>;
        })}
        {extra > 0 && (
          <g>
            <circle cx={pos(shown.length).x} cy={pos(shown.length).y} r={14} fill="var(--surface-2)" stroke="var(--line-strong)" />
            <text x={pos(shown.length).x} y={pos(shown.length).y + 4} textAnchor="middle" fontSize="10" fill="var(--fg)" className="font-tech">
              +{extra}
            </text>
          </g>
        )}
        <circle cx={cx} cy={cy} r={24} fill="url(#fan-grad)" />
        <text x={cx} y={cy + 4} textAnchor="middle" fontSize="9" fontWeight="700" fill="#fff">
          SERVER
        </text>
        {devices.length === 0 && (
          <text x={cx} y={cy + 52} textAnchor="middle" fontSize="11" fill="var(--muted)">
            Waiting for devices…
          </text>
        )}
      </svg>
    </Card>
  );
}

export function NetworkTab() {
  return (
    <div className="space-y-5">
      <div className="grid gap-5 xl:grid-cols-[22rem_1fr]">
        <ServerPanel />
        <FanOut />
      </div>
      <div className="grid gap-5 lg:grid-cols-2">
        <Chart title="Connected devices" dataKey="connected" color="#818cf8" unit="devices" stepped />
        <Chart title="Average RTT" dataKey="rtt" color="#22d3ee" unit="ms" />
      </div>
      <EventLog />
    </div>
  );
}
