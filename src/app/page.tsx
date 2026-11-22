import { ArrowRight, Radio, Smartphone, Wifi } from "lucide-react";
import Link from "next/link";
import { JoinForm } from "@/components/JoinForm";
import { Logo, ThemeToggle } from "@/components/ui/Brand";

export default function LandingPage() {
  return (
    <div className="mx-auto flex min-h-dvh max-w-5xl flex-col px-5 pb-10 pt-safe">
      <header className="flex items-center justify-between py-5">
        <Logo />
        <ThemeToggle />
      </header>

      <main className="flex flex-1 flex-col justify-center gap-10 py-10 md:py-16">
        <div className="max-w-2xl">
          <p className="mb-4 inline-flex items-center gap-2 rounded-full border border-line bg-surface-2 px-3 py-1 text-xs font-medium text-muted">
            <Wifi className="h-3.5 w-3.5 text-accent-text" aria-hidden /> Local Wi-Fi network · Zero internet required
          </p>
          <h1 className="text-4xl font-semibold leading-[1.08] tracking-tight md:text-5xl lg:text-6xl text-fg">
            Broadcast to every phone in the room.
          </h1>
          <p className="mt-4 max-w-xl text-base md:text-lg text-muted leading-relaxed">
            Create an event room, show the QR code, and push announcements, images, documents and live slides directly to attendees. No app installation, no accounts.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="glass rounded-2xl p-6 border border-line flex flex-col justify-between">
            <div>
              <span className="text-xs font-semibold uppercase tracking-wider text-accent-text">Host Stage</span>
              <h2 className="mt-1 text-lg font-semibold">Start an event room</h2>
              <p className="mt-1.5 text-sm text-muted">Launch the organizer console, manage slides, broadcast files, and inspect network health live.</p>
            </div>
            <div className="mt-6">
              <Link
                href="/create"
                className="inline-flex h-11 items-center gap-2 rounded-xl bg-accent-strong px-5 text-sm font-semibold text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.2),0_2px_8px_rgba(79,70,229,0.35)] transition-all hover:bg-accent active:scale-[0.98]"
              >
                Create event room <ArrowRight className="h-4 w-4" aria-hidden />
              </Link>
            </div>
          </div>

          <div className="glass rounded-2xl p-6 border border-line flex flex-col justify-between">
            <div>
              <span className="text-xs font-semibold uppercase tracking-wider text-muted">Audience Access</span>
              <h2 className="mt-1 text-lg font-semibold">Join with room code</h2>
              <p className="mt-1.5 text-sm text-muted">Scanned a QR? You’re already inside. Otherwise enter the 6-character room code below.</p>
            </div>
            <JoinForm />
          </div>
        </div>

        <ul className="grid gap-4 text-sm text-muted sm:grid-cols-3">
          {[
            [Radio, "One-to-many fan-out", "Every message is pushed once and delivered to all devices over a persistent connection."],
            [Smartphone, "Join in a tap", "Scan, open, done. Late joiners instantly get the whole feed and the current slide."],
            [Wifi, "Visible networking", "Watch latency, transports and delivery acks live in the Network inspector."],
          ].map(([Icon, title, body]) => {
            const I = Icon as typeof Radio;
            return (
              <li key={title as string} className="flex gap-3">
                <I className="mt-0.5 h-5 w-5 shrink-0 text-accent-text" aria-hidden />
                <div>
                  <p className="font-medium text-fg">{title as string}</p>
                  <p className="mt-0.5">{body as string}</p>
                </div>
              </li>
            );
          })}
        </ul>
      </main>
    </div>
  );
}
