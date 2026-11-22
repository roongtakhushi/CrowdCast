import type { ReactNode } from "react";

type Kind = "feed" | "devices" | "slides" | "radar" | "ended" | "lost" | "locked" | "chart";

function Art({ kind }: { kind: Kind }) {
  const stroke = "var(--line-strong)";
  return (
    <svg viewBox="0 0 160 120" width="160" height="120" role="img" aria-hidden fill="none">
      <defs>
        <linearGradient id={`g-${kind}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#6366f1" />
          <stop offset="1" stopColor="#22d3ee" />
        </linearGradient>
      </defs>
      <ellipse cx="80" cy="108" rx="52" ry="6" fill="var(--surface-2)" />
      {kind === "feed" && (
        <>
          <rect x="30" y="22" width="100" height="26" rx="8" fill="var(--surface-2)" stroke={stroke} />
          <rect x="40" y="31" width="50" height="4" rx="2" fill={`url(#g-${kind})`} />
          <rect x="40" y="39" width="70" height="3" rx="1.5" fill={stroke} />
          <rect x="22" y="56" width="100" height="26" rx="8" fill="var(--surface-2)" stroke={stroke} />
          <rect x="32" y="65" width="36" height="4" rx="2" fill={stroke} />
          <rect x="32" y="73" width="60" height="3" rx="1.5" fill={stroke} />
          <circle cx="130" cy="84" r="14" fill={`url(#g-${kind})`} />
          <path d="M124 84l4 4 8-8" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
        </>
      )}
      {kind === "devices" && (
        <>
          <rect x="62" y="16" width="36" height="68" rx="8" fill="var(--surface-2)" stroke={stroke} />
          <rect x="68" y="26" width="24" height="3" rx="1.5" fill={`url(#g-${kind})`} />
          <rect x="68" y="34" width="24" height="3" rx="1.5" fill={stroke} />
          <path d="M44 40a30 30 0 0 0 0 28M116 40a30 30 0 0 1 0 28M32 32a46 46 0 0 0 0 44M128 32a46 46 0 0 1 0 44" stroke={`url(#g-${kind})`} strokeWidth="3" strokeLinecap="round" opacity=".7" />
        </>
      )}
      {kind === "slides" && (
        <>
          <rect x="24" y="20" width="112" height="68" rx="10" fill="var(--surface-2)" stroke={stroke} />
          <rect x="38" y="34" width="52" height="6" rx="3" fill={`url(#g-${kind})`} />
          <rect x="38" y="48" width="84" height="4" rx="2" fill={stroke} />
          <rect x="38" y="58" width="68" height="4" rx="2" fill={stroke} />
          <path d="M80 88v12M62 100h36" stroke={stroke} strokeWidth="3" strokeLinecap="round" />
        </>
      )}
      {kind === "radar" && (
        <>
          <circle cx="80" cy="58" r="14" stroke={stroke} />
          <circle cx="80" cy="58" r="30" stroke={stroke} opacity=".7" />
          <circle cx="80" cy="58" r="46" stroke={stroke} opacity=".4" />
          <circle cx="80" cy="58" r="6" fill={`url(#g-${kind})`} />
        </>
      )}
      {kind === "chart" && (
        <>
          <path d="M26 90h110M26 90V24" stroke={stroke} strokeWidth="2" strokeLinecap="round" />
          <path d="M32 78l24-18 22 10 26-32 24 12" stroke={`url(#g-${kind})`} strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
        </>
      )}
      {kind === "ended" && (
        <>
          <rect x="40" y="26" width="80" height="60" rx="12" fill="var(--surface-2)" stroke={stroke} />
          <path d="M60 56l14 14 28-28" stroke={`url(#g-${kind})`} strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
        </>
      )}
      {kind === "lost" && (
        <>
          <circle cx="80" cy="54" r="34" fill="var(--surface-2)" stroke={stroke} />
          <path d="M66 46h.01M94 46h.01" stroke="var(--fg)" strokeWidth="5" strokeLinecap="round" />
          <path d="M66 70c6-8 22-8 28 0" stroke={`url(#g-${kind})`} strokeWidth="4" strokeLinecap="round" />
        </>
      )}
      {kind === "locked" && (
        <>
          <rect x="48" y="50" width="64" height="44" rx="10" fill="var(--surface-2)" stroke={stroke} />
          <path d="M60 50V38a20 20 0 0 1 40 0v12" stroke={`url(#g-${kind})`} strokeWidth="5" strokeLinecap="round" />
          <circle cx="80" cy="72" r="5" fill={`url(#g-${kind})`} />
        </>
      )}
    </svg>
  );
}

export function EmptyState({ kind, title, children }: { kind: Kind; title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-12 text-center">
      <Art kind={kind} />
      <h3 className="mt-4 text-base font-semibold">{title}</h3>
      {children ? <div className="mt-1.5 max-w-sm text-sm text-muted">{children}</div> : null}
    </div>
  );
}
