import { NextResponse } from "next/server";
import { requireAdmin, readJson } from "@/lib/guard";
import { runProbeCycle, probeWorkerInfo } from "@/lib/probe";
import { deliverOutbox } from "@/lib/alerts";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ ...probeWorkerInfo(), now: new Date().toISOString() });
}

export async function POST(req: Request) {
  const guard = await requireAdmin();
  if (guard.error) return guard.error;
  const body = await readJson(req);
  const cycle = await runProbeCycle();
  const delivered = await deliverOutbox(50);
  return NextResponse.json({ ok: true, cycle, delivered, ...body });
}
