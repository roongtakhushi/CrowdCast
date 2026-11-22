"use client";

import { KeyRound, RefreshCw } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Dialog } from "@/components/ui/Dialog";
import { Button, Card, Field, Input, Skeleton, Switch } from "@/components/ui/primitives";
import { useConnection } from "@/stores/connection";
import { useHost } from "./context";

export function SettingsTab({ hasPin: initialHasPin, onRegenerate }: { hasPin: boolean; onRegenerate: () => Promise<void> }) {
  const { code, run } = useHost();
  const settings = useConnection((s) => s.settings);
  const [max, setMax] = useState<string>("");
  const [pin, setPin] = useState("");
  const [hasPin, setHasPin] = useState(initialHasPin);
  const [busy, setBusy] = useState(false);
  const [confirmRegen, setConfirmRegen] = useState(false);

  if (!settings) return <Skeleton className="h-64 w-full" />;
  const maxValue = max === "" ? String(settings.maxAttendees) : max;

  const toggle = (key: "locked" | "requireName" | "reactionsEnabled", value: boolean, msg: string) =>
    run({ type: "room_settings_update", settings: { [key]: value } }, msg);

  const saveMax = async () => {
    const n = Number(maxValue);
    if (!Number.isInteger(n) || n < 1 || n > 1000) {
      toast.error("Max attendees must be a whole number between 1 and 1000");
      return;
    }
    const r = await run({ type: "room_settings_update", settings: { maxAttendees: n } }, `Limit set to ${n}`);
    if (r) setMax("");
  };

  const savePin = async (value: string | null) => {
    if (value !== null && !/^[A-Za-z0-9]{4,12}$/.test(value)) {
      toast.error("PIN must be 4-12 letters or digits");
      return;
    }
    const r = await run({ type: "room_settings_update", pin: value }, value ? "Organizer PIN saved" : "PIN removed");
    if (r) {
      setHasPin(value !== null);
      setPin("");
    }
  };

  return (
    <div className="grid gap-5 xl:grid-cols-2">
      <Card>
        <h2 className="text-base font-semibold">Room access</h2>
        <div className="mt-2 divide-y divide-line">
          <Switch checked={settings.locked} onChange={(v) => toggle("locked", v, v ? "Room locked: new joins are blocked" : "Room unlocked")} label="Lock room" description="Blocks new devices from joining. Devices already inside (and reconnecting ones) stay." />
          <Switch checked={settings.requireName} onChange={(v) => toggle("requireName", v, v ? "Attendees will be asked for a name" : "Name prompt disabled")} label="Ask attendees for a display name" description="Shows an optional name prompt on first join. Leaving it blank keeps them anonymous." />
          <Switch checked={settings.reactionsEnabled} onChange={(v) => toggle("reactionsEnabled", v, v ? "Reactions enabled" : "Reactions disabled")} label="Emoji reactions" description="Attendees can tap emojis; you see aggregated counts live." />
        </div>
        <div className="mt-4 border-t border-line pt-4">
          <Field label="Max attendees" htmlFor="max" hint="Joins beyond this limit see a “room is full” screen. Default 300.">
            <div className="flex gap-2">
              <Input id="max" inputMode="numeric" value={maxValue} onChange={(e) => setMax(e.target.value.replace(/\D/g, ""))} className="w-32 font-tech" />
              <Button onClick={saveMax} disabled={maxValue === String(settings.maxAttendees)}>
                Save
              </Button>
            </div>
          </Field>
        </div>
      </Card>

      <div className="space-y-5">
        <Card>
          <h2 className="flex items-center gap-2 text-base font-semibold">
            <KeyRound className="h-4 w-4 text-accent-text" aria-hidden /> Organizer PIN
          </h2>
          <p className="mt-1 text-sm text-muted">
            {hasPin ? "A PIN is set. You can sign in to this room from another device with it." : "Set a PIN to reopen this console on another device. Only a salted hash is stored."}
          </p>
          <div className="mt-4 flex gap-2">
            <Input aria-label="New PIN" type="password" value={pin} onChange={(e) => setPin(e.target.value)} placeholder="4-12 letters or digits" maxLength={12} autoComplete="new-password" className="font-tech" />
            <Button variant="primary" onClick={() => savePin(pin)} disabled={!pin}>
              {hasPin ? "Change" : "Set PIN"}
            </Button>
            {hasPin && (
              <Button variant="danger" onClick={() => savePin(null)}>
                Remove
              </Button>
            )}
          </div>
        </Card>

        <Card>
          <h2 className="text-base font-semibold">Room code</h2>
          <p className="mt-1 text-sm text-muted">
            Current code <span className="font-tech font-semibold text-fg">{code}</span>. Regenerating invalidates the old link and QR and disconnects attendees.
          </p>
          <Button
            className="mt-4"
            onClick={() => setConfirmRegen(true)}
          >
            <RefreshCw className="h-4 w-4" /> Regenerate room code
          </Button>

          <Dialog
            open={confirmRegen}
            onOpenChange={setConfirmRegen}
            title="Regenerate room code?"
            description="Generating a new code will immediately disconnect all currently connected attendees and invalidate existing QR codes."
          >
            <div className="flex justify-end gap-2 mt-4">
              <Button variant="secondary" onClick={() => setConfirmRegen(false)} disabled={busy}>
                Cancel
              </Button>
              <Button
                variant="danger"
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
                Regenerate code
              </Button>
            </div>
          </Dialog>
        </Card>
      </div>
    </div>
  );
}
