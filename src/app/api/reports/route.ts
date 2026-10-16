import { NextResponse } from "next/server";
import { and, eq, inArray, ne } from "drizzle-orm";
import { db } from "@/db";
import { incidentEvents, incidents, reports, services } from "@/db/schema";
import { cache, STATUS_CACHE_KEY } from "@/lib/cache";
import { enqueueAlerts } from "@/lib/alerts";
import { readJson, requireAdmin, requireUser } from "@/lib/guard";
import { CROWD_RED_THRESHOLD, CROWD_SUSPECT_THRESHOLD } from "@/lib/status";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const guard = await requireUser();
  if (guard.error) return guard.error;
  const body = await readJson(req);
  const serviceId = Number(body.serviceId);
  if (!Number.isFinite(serviceId))
    return NextResponse.json({ error: "serviceId required" }, { status: 400 });

  const [service] = await db
    .select()
    .from(services)
    .where(eq(services.id, serviceId))
    .limit(1);
  if (!service)
    return NextResponse.json({ error: "Unknown service" }, { status: 404 });

  const note = String(body.note ?? "").slice(0, 240);
  const city = String(body.city ?? guard.user.city ?? "—").slice(0, 40);

  const existingOpen = await db
    .select()
    .from(reports)
    .where(
      and(
        eq(reports.serviceId, serviceId),
        eq(reports.userId, guard.user.id),
        inArray(reports.state, ["open", "confirmed"]),
      ),
    )
    .limit(1);
  if (existingOpen.length) {
    return NextResponse.json(
      { error: "You already reported this service recently", report: existingOpen[0] },
      { status: 409 },
    );
  }

  const [report] = await db
    .insert(reports)
    .values({ serviceId, userId: guard.user.id, city, note, state: "open" })
    .returning();

  // escalation: 3+ recent reports open an incident, 10+ flip the row red
  const recent = await db
    .select({ id: reports.id })
    .from(reports)
    .where(
      and(
        eq(reports.serviceId, serviceId),
        inArray(reports.state, ["open", "confirmed"]),
      ),
    );
  const count = recent.length;
  let escalated = false;

  if (count >= CROWD_SUSPECT_THRESHOLD) {
    const open = await db
      .select()
      .from(incidents)
      .where(and(eq(incidents.serviceId, serviceId), ne(incidents.state, "resolved")))
      .limit(1);
    if (!open.length) {
      const [inc] = await db
        .insert(incidents)
        .values({
          serviceId,
          title: `${service.shortName}: user reports of failure`,
          severity: count >= CROWD_RED_THRESHOLD ? "down" : "degraded",
          state: "identified",
          cause: `${count} crowd reports from the field`,
          origin: "reports",
        })
        .returning();
      await db.insert(incidentEvents).values({
        incidentId: inc.id,
        kind: "report",
        body: `Opened from crowd reports (${count} in the window) including ${city}: ${note || "no detail given"}.`,
        author: guard.user.name,
      });
      escalated = true;
    }
    if (count >= CROWD_RED_THRESHOLD && !escalated) {
      await enqueueAlerts(service, "down");
    }
  }

  await cache.del(STATUS_CACHE_KEY);
  return NextResponse.json({ ok: true, report, count, escalated }, { status: 201 });
}



export async function DELETE(req: Request) {
  const guard = await requireUser();
  if (guard.error) return guard.error;
  const body = await readJson(req);
  const id = Number(body.id);
  const [row] = await db.select().from(reports).where(eq(reports.id, id)).limit(1);
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (row.userId !== guard.user.id && guard.user.role !== "admin")
    return NextResponse.json({ error: "Not yours to withdraw" }, { status: 403 });

  const [updated] = await db
    .update(reports)
    .set({ state: "withdrawn", withdrawnAt: new Date() })
    .where(eq(reports.id, id))
    .returning();
  await cache.del(STATUS_CACHE_KEY);
  return NextResponse.json({ ok: true, report: updated });
}

export async function PATCH(req: Request) {
  const guard = await requireAdmin();
  if (guard.error) return guard.error;
  const body = await readJson(req);
  const id = Number(body.id);
  const action = String(body.action ?? "");
  const allowed = ["confirmed", "dismissed", "open"];
  if (!allowed.includes(action))
    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  const [updated] = await db
    .update(reports)
    .set({ state: action as "confirmed" | "dismissed" | "open" })
    .where(eq(reports.id, id))
    .returning();
  if (!updated) return NextResponse.json({ error: "Not found" }, { status: 404 });
  await cache.del(STATUS_CACHE_KEY);
  return NextResponse.json({ ok: true, report: updated });
}
