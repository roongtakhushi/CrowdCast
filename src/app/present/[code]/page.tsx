import { notFound } from "next/navigation";
import { ProjectorView } from "@/components/present/ProjectorView";
import { ROOM_CODE_RE } from "@/lib/constants";

export const metadata = { title: "Projector view" };

export default async function PresentPage({ params }: { params: Promise<{ code: string }> }) {
  const code = (await params).code.toUpperCase();
  if (!ROOM_CODE_RE.test(code)) notFound();
  return <ProjectorView code={code} />;
}
