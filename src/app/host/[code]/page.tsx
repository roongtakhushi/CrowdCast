import { notFound } from "next/navigation";
import { HostApp } from "@/components/host/HostApp";
import { ROOM_CODE_RE } from "@/lib/constants";

export const metadata = { title: "Organizer console" };

export default async function HostPage({ params }: { params: Promise<{ code: string }> }) {
  const code = (await params).code.toUpperCase();
  if (!ROOM_CODE_RE.test(code)) notFound();
  return <HostApp code={code} />;
}
