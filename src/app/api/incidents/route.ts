import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { incidentEvents, incidents } from "@/db/schema";
import { cache, STATUS_CACHE_KEY } from "@/lib/cache";
import { readJson, requireAdmin, requireUser } from "@/lib/guard";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const guard = await requireUser();
  if (guard.error) return guard.error;
  const body = await readJson(req);
  const id = Number(body.id);
  const action = String(body.action ?? "");

  const [incident] = await db.select().from(incidents).where(eq(incidents.id, id)).limit(1);
  if (!incident) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (action === "event") {
    const text = String(body.body ?? "").slice(0, 400);
    if (!text) return NextResponse.json({ error: "Note text required" }, { status: 400 });
    const [ev] = await db
      .insert(incidentEvents)
      .values({
        incidentId: id,
        body: text,
        author: guard.user.name,
        kind: guard.user.role === "admin" ? "admin" : "note",
      })
      .returning();
    if (guard.user.role !== "admin") {
      // citizens can annotate but only admins change incident state
      return NextResponse.json({ ok: true, event: ev });
    }
    return NextResponse.json({ ok: true, event: ev });
  }

  const guardAdmin = await requireAdmin();
  if (guardAdmin.error) return guardAdmin.error;

  const patch: Partial<typeof incidents.$inferInsert> = {};
  if (["investigating", "identified", "resolved"].includes(body.state)) {
    patch.state = body.state;
    if (body.state === "resolved") {
      patch.resolvedAt = new Date();
      patch.autoClosed = false;
    } else {
      patch.resolvedAt = null;
    }
  }
  if (typeof body.cause === "string" && body.cause.trim())
    patch.cause = body.cause.trim().slice(0, 300);
  if (["up", "degraded", "down"].includes(body.severity)) patch.severity = body.severity;
  if (typeof body.title === "string" && body.title.trim())
    patch.title = body.title.trim().slice(0, 120);

  const [updated] = await db
    .update(incidents)
    .set(patch)
    .where(eq(incidents.id, id))
    .returning();

  const label =
    action === "resolve"
      ? "resolved"
      : action === "reopen"
        ? "reopened"
        : "updated";
  await db.insert(incidentEvents).values({
    incidentId: id,
    kind: action,
    body:
      body.note && String(body.note).trim()
        ? String(body.note).slice(0, 400)
        : `Incident ${label} by ${guard.user.name}.`,
    author: guard.user.name,
  });

  await cache.del(STATUS_CACHE_KEY);
  return NextResponse.json({ ok: true, incident: updated });
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const serviceId = url.searchParams.get("serviceId");
  const rows = await db
    .select()
    .from(incidents)
    .where(serviceId ? eq(incidents.serviceId, Number(serviceId)) : undefined)
    .orderBy(incidents.startedAt);
  return NextResponse.json({ incidents: rows });
}

void and;
