import { notFound } from "next/navigation";

import { RoomClient } from "@/components/room-client";
import type { RoomRole } from "@/lib/room";

export default async function RoomPage({
  params,
  searchParams,
}: {
  params: Promise<{ code: string }>;
  searchParams: Promise<{ role?: string }>;
}) {
  const [{ code }, query] = await Promise.all([params, searchParams]);

  if (!/^\d{6}$/.test(code)) {
    notFound();
  }

  const initialRole: RoomRole = query.role === "host" ? "host" : "viewer";

  return <RoomClient roomCode={code} initialRole={initialRole} />;
}
