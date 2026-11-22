import Link from "next/link";
import { EmptyState } from "@/components/ui/Illustrations";
import { Logo } from "@/components/ui/Brand";

export default function NotFound() {
  return (
    <div className="mx-auto flex min-h-dvh max-w-xl flex-col px-5 pt-safe">
      <header className="py-5">
        <Logo />
      </header>
      <main className="flex flex-1 items-center justify-center">
        <EmptyState kind="lost" title="404 · Page not found">
          <p>That page doesn’t exist. If you were given a room link, double-check the code.</p>
          <Link href="/" className="gradient-bg mt-5 inline-flex h-11 items-center rounded-xl px-5 text-sm font-medium text-white">
            Back to CrowdCast
          </Link>
        </EmptyState>
      </main>
    </div>
  );
}
