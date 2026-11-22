"use client";

import { Moon, Sun } from "lucide-react";
import Link from "next/link";
import { useEffect } from "react";
import { useUi } from "@/stores/ui";
import { Button } from "./primitives";

export function Logo({ href = "/", size = 28 }: { href?: string; size?: number }) {
  return (
    <Link href={href} className="inline-flex items-center gap-2.5 font-semibold tracking-tight" aria-label="CrowdCast home">
      <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden>
        <defs>
          <linearGradient id="lg" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#6366f1" />
            <stop offset="1" stopColor="#22d3ee" />
          </linearGradient>
        </defs>
        <rect width="32" height="32" rx="9" fill="url(#lg)" />
        <circle cx="16" cy="16" r="3" fill="#fff" />
        <path d="M9.5 9.5a9.2 9.2 0 0 0 0 13M22.5 9.5a9.2 9.2 0 0 1 0 13" stroke="#fff" strokeWidth="2" strokeLinecap="round" fill="none" opacity=".9" />
      </svg>
      <span className="text-[17px]">CrowdCast</span>
    </Link>
  );
}

export function LiveDot({ tone = "bad" }: { tone?: "bad" | "ok" }) {
  return <span aria-hidden className={`live-dot ${tone === "ok" ? "ok" : ""}`} />;
}

export function LiveBadge({ label = "LIVE" }: { label?: string }) {
  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-bad/30 bg-bad/15 px-2.5 py-0.5 text-xs font-semibold tracking-wide text-bad">
      <LiveDot />
      {label}
    </span>
  );
}

export function ThemeToggle() {
  const theme = useUi((s) => s.theme);
  const toggle = useUi((s) => s.toggleTheme);
  const init = useUi((s) => s.init);
  useEffect(() => init(), [init]);
  return (
    <Button variant="ghost" size="icon" onClick={toggle} aria-label={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}>
      {theme === "dark" ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
    </Button>
  );
}
