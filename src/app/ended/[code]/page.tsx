import Link from "next/link";
import { Logo } from "@/components/ui/Brand";
import { EmptyState } from "@/components/ui/Illustrations";

export const metadata = { title: "Event ended" };

export default async function EndedPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  return (
    <div className="mx-auto flex min-h-dvh max-w-xl flex-col px-5 pt-safe">
      <header className="py-5">
        <Logo />
      </header>
      <main className="flex flex-1 items-center justify-center">
        <EmptyState kind="ended" title="This event has ended">
          <p>
            Room <span className="font-tech font-semibold text-fg">{code.toUpperCase()}</span> is closed and read-only. Thanks for joining!
          </p>
          <Link href="/" className="gradient-bg mt-5 inline-flex h-11 items-center rounded-xl px-5 text-sm font-medium text-white">
            Back to CrowdCast
          </Link>
        </EmptyState>
      </main>
    </div>
  );
}
