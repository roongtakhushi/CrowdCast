"use client";

import { Check, Copy, Download, RefreshCw } from "lucide-react";
import { QRCodeCanvas } from "qrcode.react";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { Button, Select } from "@/components/ui/primitives";
import { useShareTargets } from "@/hooks/useRoom";
import { copyText, cn } from "@/lib/utils";

/** QR + join URL for an arbitrary room. Always an address phones can reach, never localhost. */
export function useJoinUrl(code: string) {
  const share = useShareTargets();
  return { ...share, joinUrl: share.selected ? `${share.selected}/join/${code}` : "" };
}

export function JoinQr({ url, size = 220, className }: { url: string; size?: number; className?: string }) {
  if (!url) return <div className="skeleton" style={{ width: size, height: size }} />;
  return (
    <div className={cn("inline-block rounded-2xl bg-white p-3", className)}>
      <QRCodeCanvas value={url} size={size} level="M" marginSize={0} bgColor="#ffffff" fgColor="#0a0b10" aria-label={`QR code for ${url}`} role="img" />
    </div>
  );
}

export function SharePanel({
  code,
  onRegenerate,
  large,
}: {
  code: string;
  onRegenerate?: () => Promise<void>;
  large?: boolean;
}) {
  const { joinUrl, targets, selected, select, info } = useJoinUrl(code);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [confirmRegen, setConfirmRegen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);

  const copy = async () => {
    const ok = await copyText(joinUrl);
    if (ok) {
      setCopied(true);
      toast.success("Join link copied");
      setTimeout(() => setCopied(false), 1500);
    } else toast.error("Couldn’t copy. Select the link and copy it manually.");
  };

  const download = () => {
    const canvas = wrap.current?.querySelector("canvas");
    if (!canvas) return;
    const out = document.createElement("canvas");
    const pad = 48;
    out.width = canvas.width + pad * 2;
    out.height = canvas.height + pad * 2;
    const ctx = out.getContext("2d");
    if (!ctx) return;
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, out.width, out.height);
    ctx.drawImage(canvas, pad, pad);
    const a = document.createElement("a");
    a.href = out.toDataURL("image/png");
    a.download = `crowdcast-${code}.png`;
    a.click();
  };

  return (
    <div className="space-y-4">
      <div ref={wrap} className="flex justify-center">
        <JoinQr url={joinUrl} size={large ? 280 : 168} />
      </div>
      <div className="text-center">
        <p className="text-xs uppercase tracking-widest text-muted">Room code</p>
        <p className="font-tech text-3xl font-semibold tracking-[0.25em]">{code}</p>
      </div>
      <div className="rounded-xl border border-line bg-surface-2 px-3 py-2 text-center">
        <p className="font-tech break-all text-sm" data-testid="join-url">
          {joinUrl || "Detecting LAN address…"}
        </p>
      </div>
      {targets.length > 1 && (
        <div>
          <label htmlFor="net-pick" className="mb-1 block text-xs font-medium text-muted">
            Network address in the QR
          </label>
          <Select id="net-pick" value={selected} onChange={(e) => select(e.target.value)}>
            {targets.map((t) => (
              <option key={t.base} value={t.base}>
                {t.label}
              </option>
            ))}
          </Select>
        </div>
      )}
      {info && info.candidates.length === 0 && (
        <p className="rounded-xl border border-warn/30 bg-warn/10 p-3 text-xs text-warn">
          No private LAN address found. Connect this laptop to Wi-Fi (or start a phone hotspot) and reload.
        </p>
      )}
      <div className="grid grid-cols-2 gap-2">
        <Button className="whitespace-nowrap px-2" onClick={copy} disabled={!joinUrl}>
          {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />} Copy link
        </Button>
        <Button className="whitespace-nowrap px-2" onClick={download} disabled={!joinUrl}>
          <Download className="h-4 w-4" /> Download QR
        </Button>
      </div>
      {onRegenerate && (
        confirmRegen ? (
          <div className="flex gap-2">
            <Button
              variant="secondary"
              className="flex-1"
              disabled={busy}
              onClick={() => setConfirmRegen(false)}
            >
              Cancel
            </Button>
            <Button
              variant="danger"
              className="flex-1"
              loading={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  await onRegenerate();
                  setConfirmRegen(false);
                } finally {
                  setBusy(false);
                }
              }}
            >
              Confirm new code
            </Button>
          </div>
        ) : (
          <Button
            variant="ghost"
            className="w-full text-muted hover:text-bad"
            onClick={() => setConfirmRegen(true)}
          >
            <RefreshCw className="h-4 w-4" /> Regenerate room code
          </Button>
        )
      )}
    </div>
  );
}
