"use client";

import { motion } from "framer-motion";
import { Activity, Database, Send, TrendingUp, Users } from "lucide-react";
import { AnimatedNumber } from "@/components/ui/AnimatedNumber";
import { useDevices } from "@/stores/devices";

function Stat({ label, icon, children, unit, big }: { label: string; icon: React.ReactNode; children: React.ReactNode; unit?: string; big?: boolean }) {
  return (
    <motion.div layout className={`glass rounded-xl p-4 border border-line ${big ? "col-span-2 sm:col-span-1" : ""}`}>
      <div className="flex items-center justify-between text-xs font-medium text-muted">
        <span>{label}</span>
        <span className="text-muted" aria-hidden>
          {icon}
        </span>
      </div>
      <p className="mt-2 flex items-baseline gap-1">
        <span className={`font-tech font-semibold tracking-tight text-fg ${big ? "text-4xl sm:text-5xl" : "text-2xl sm:text-3xl"}`}>{children}</span>
        {unit && <span className="text-xs text-muted font-tech">{unit}</span>}
      </p>
    </motion.div>
  );
}

export function StatsRow() {
  const stats = useDevices((s) => s.stats);
  const presence = useDevices((s) => s.presence);
  return (
    <section aria-label="Live statistics" className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
      <Stat label="Connected devices" icon={<Users className="h-4 w-4" />} big>
        <AnimatedNumber value={presence.connected} />
      </Stat>
      <Stat label="Peak devices" icon={<TrendingUp className="h-4 w-4" />}>
        <AnimatedNumber value={Math.max(presence.peak, stats?.peak ?? 0)} />
      </Stat>
      <Stat label="Avg latency" icon={<Activity className="h-4 w-4" />} unit="ms">
        {stats?.avgRttMs != null ? <AnimatedNumber value={stats.avgRttMs} /> : "–"}
      </Stat>
      <Stat label="Items broadcast" icon={<Send className="h-4 w-4" />}>
        <AnimatedNumber value={stats?.itemsBroadcast ?? 0} />
      </Stat>
      <Stat label="Data sent" icon={<Database className="h-4 w-4" />} unit="MB">
        <AnimatedNumber value={(stats?.bytesSent ?? 0) / 1048576} decimals={2} />
      </Stat>
    </section>
  );
}
