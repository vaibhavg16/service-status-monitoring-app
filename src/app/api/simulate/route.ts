import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { reports, services } from "@/db/schema";
import { cache, STATUS_CACHE_KEY } from "@/lib/cache";
import { readForced, writeForced, type ForcedMap } from "@/lib/queries";
import { readJson, requireAdmin } from "@/lib/guard";

export const dynamic = "force-dynamic";

const CITIES = ["Dhule", "Pune", "Chennai", "Lucknow", "Nagpur", "Kochi"];
const NOTES = [
  "Collect request timed out three times",
  "Payment showing pending but money debited",
  "App opens but OTP never arrives",
  "Page takes 20s to load, then 502",
  "Refund not credited since morning",
  "Ticket search returns blank results",
];

/** Force an aspect (or clear it) for demos and chaos testing. */
export async function POST(req: Request) {
  const guard = await requireAdmin();
  if (guard.error) return guard.error;
  const body = await readJson(req);

  if (body.action === "storm") {
    const serviceId = Number(body.serviceId);
    const [service] = await db.select().from(services).where(eq(services.id, serviceId)).limit(1);
    if (!service) return NextResponse.json({ error: "Unknown service" }, { status: 404 });
    const n = Math.max(1, Math.min(30, Number(body.count ?? 12)));
    const { users: userList } = await import("@/db/schema");
    const allUsers = await db.select({ id: userList.id }).from(userList);
    const values = Array.from({ length: n }, (_, i) => ({
      serviceId,
      userId: allUsers[i % Math.max(1, allUsers.length)]?.id ?? null,
      city: CITIES[i % CITIES.length],
      note: NOTES[i % NOTES.length],
      state: "open" as const,
      createdAt: new Date(Date.now() - i * 45_000),
    }));
    const inserted = await db.insert(reports).values(values).returning();
    await cache.del(STATUS_CACHE_KEY);
    return NextResponse.json({ ok: true, count: inserted.length });
  }

  const slug = String(body.slug ?? "");
  const forced: ForcedMap = await readForced();

  if (body.action === "clear") {
    delete forced[slug];
    await writeForced(forced);
    await cache.del(STATUS_CACHE_KEY);
    const { runProbeCycle } = await import("@/lib/probe");
    await runProbeCycle();
    return NextResponse.json({ ok: true, forced });
  }

  const aspect = String(body.aspect ?? "");
  if (!["up", "degraded", "down"].includes(aspect))
    return NextResponse.json({ error: "aspect must be up|degraded|down" }, { status: 400 });
  const [service] = await db.select().from(services).where(eq(services.slug, slug)).limit(1);
  if (!service) return NextResponse.json({ error: "Unknown service" }, { status: 404 });

  forced[slug] = aspect as "up" | "degraded" | "down";
  await writeForced(forced);
  const { runProbeCycle } = await import("@/lib/probe");
  const cycle = await runProbeCycle();
  return NextResponse.json({ ok: true, forced, cycle });
}
