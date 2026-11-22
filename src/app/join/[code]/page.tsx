import { notFound } from "next/navigation";
import { AttendeeApp } from "@/components/attendee/AttendeeApp";
import { ROOM_CODE_RE } from "@/lib/constants";

export const metadata = { title: "Event" };

export default async function JoinPage({ params }: { params: Promise<{ code: string }> }) {
  const code = (await params).code.toUpperCase();
  if (!ROOM_CODE_RE.test(code)) notFound();
  return <AttendeeApp code={code} />;
}
