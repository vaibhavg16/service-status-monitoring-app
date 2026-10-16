import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { recentAlerts } from "@/lib/alerts";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ alerts: [] });
  const rows = await recentAlerts(user.id, 12);
  return NextResponse.json({
    alerts: rows.map((r) => ({
      id: r.row.id,
      title: r.row.title,
      body: r.row.body,
      severity: r.row.severity,
      state: r.row.state,
      channel: r.row.channel,
      createdAt: r.row.createdAt.toISOString(),
    })),
  });
}
