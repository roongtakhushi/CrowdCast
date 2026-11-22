"use client";

import { ArrowLeft, KeyRound } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { Logo, ThemeToggle } from "@/components/ui/Brand";
import { Button, Card, Field, Input, Textarea } from "@/components/ui/primitives";
import { api, ApiClientError } from "@/lib/api";
import { setHostToken } from "@/lib/session";

export default function CreateRoomPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [pin, setPin] = useState("");
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<{ name?: string; pin?: string; form?: string }>({});

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const next: typeof errors = {};
    if (name.trim().length < 2) next.name = "Give your event a name (2+ characters).";
    if (pin && !/^[A-Za-z0-9]{4,12}$/.test(pin)) next.pin = "PIN must be 4-12 letters or digits.";
    setErrors(next);
    if (Object.keys(next).length) return;
    setLoading(true);
    try {
      const res = await api.createRoom({ name: name.trim(), description: description.trim(), pin: pin || undefined });
      setHostToken(res.code, res.token);
      toast.success("Room created");
      router.push(`/host/${res.code}`);
    } catch (err) {
      const msg = err instanceof ApiClientError ? err.message : "Could not create the room";
      setErrors({ form: msg });
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto min-h-dvh max-w-xl px-5 pt-safe">
      <header className="flex items-center justify-between py-5">
        <Logo />
        <ThemeToggle />
      </header>
      <main className="py-6">
        <Link href="/" className="mb-6 inline-flex items-center gap-1.5 text-sm text-muted hover:text-fg">
          <ArrowLeft className="h-4 w-4" aria-hidden /> Back
        </Link>
        <h1 className="text-3xl font-semibold tracking-tight">Create an event room</h1>
        <p className="mt-2 text-muted">You’ll get a QR code attendees can scan right away.</p>

        <Card className="mt-8">
          <form onSubmit={submit} className="space-y-5" noValidate>
            <Field label="Event name" htmlFor="name">
              <Input id="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Tech Fest 2026 · Keynote" maxLength={80} autoFocus aria-invalid={!!errors.name} aria-describedby={errors.name ? "name-err" : undefined} />
              {errors.name && (
                <p id="name-err" role="alert" className="text-xs text-bad">
                  {errors.name}
                </p>
              )}
            </Field>
            <Field label="Description (optional)" htmlFor="desc">
              <Textarea id="desc" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={500} placeholder="Shown to attendees under the title" />
            </Field>
            <Field label="Organizer PIN (optional)" htmlFor="pin" hint="Lets you open the console on another device. Store it safely; it can’t be recovered.">
              <div className="relative">
                <KeyRound className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden />
                <Input id="pin" className="pl-9 font-tech" value={pin} onChange={(e) => setPin(e.target.value)} inputMode="text" autoComplete="off" maxLength={12} placeholder="4-12 characters" aria-invalid={!!errors.pin} />
              </div>
              {errors.pin && (
                <p role="alert" className="text-xs text-bad">
                  {errors.pin}
                </p>
              )}
            </Field>
            {errors.form && (
              <p role="alert" className="rounded-xl border border-bad/30 bg-bad/10 p-3 text-sm text-bad">
                {errors.form}
              </p>
            )}
            <Button type="submit" variant="primary" size="lg" className="w-full" loading={loading}>
              Create room
            </Button>
          </form>
        </Card>
      </main>
    </div>
  );
}
