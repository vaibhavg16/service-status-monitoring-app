import { NextResponse } from "next/server";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { probeResults, services } from "@/db/schema";
import { cache, STATUS_CACHE_KEY } from "@/lib/cache";
import { readJson, requireAdmin } from "@/lib/guard";

export const dynamic = "force-dynamic";

const numericFields = [
  "checkIntervalSec",
  "timeoutMs",
  "degradedThresholdMs",
  "downThresholdMs",
  "baseLatencyMs",
  "sortOrder",
] as const;

export async function POST(req: Request) {
  const guard = await requireAdmin();
  if (guard.error) return guard.error;
  const body = await readJson(req);

  const name = String(body.name ?? "").trim();
  const url = String(body.url ?? "").trim();
  if (!name || !url)
    return NextResponse.json({ error: "Name and URL are required" }, { status: 400 });

  const slug =
    String(body.slug ?? "")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || name.toLowerCase().replace(/[^a-z0-9]+/g, "-");

  try {
    const [created] = await db
      .insert(services)
      .values({
        name,
        slug,
        shortName: String(body.shortName ?? name).slice(0, 18),
        url,
        provider: String(body.provider ?? "Independent"),
        category: String(body.category ?? "payments"),
        description: String(body.description ?? ""),
        checkIntervalSec: Number(body.checkIntervalSec ?? 30),
        timeoutMs: Number(body.timeoutMs ?? 5000),
        degradedThresholdMs: Number(body.degradedThresholdMs ?? 900),
        downThresholdMs: Number(body.downThresholdMs ?? 3000),
        baseLatencyMs: Number(body.baseLatencyMs ?? 220),
        sortOrder: Number(body.sortOrder ?? 50),
        paused: Boolean(body.paused),
      })
      .returning();
    await cache.del(STATUS_CACHE_KEY);
    return NextResponse.json({ ok: true, service: created }, { status: 201 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { error: msg.includes("unique") ? "That slug already exists" : msg },
      { status: 400 },
    );
  }
}

export async function PATCH(req: Request) {
  const guard = await requireAdmin();
  if (guard.error) return guard.error;
  const body = await readJson(req);
  const id = Number(body.id);
  if (!Number.isFinite(id))
    return NextResponse.json({ error: "id required" }, { status: 400 });

  const patch: Partial<typeof services.$inferInsert> = {};
  for (const f of numericFields) {
    if (body[f] !== undefined && body[f] !== "") {
      const n = Number(body[f]);
      if (!Number.isFinite(n)) return NextResponse.json({ error: `${f} must be a number` }, { status: 400 });
      patch[f] = n;
    }
  }
  if (typeof body.name === "string" && body.name.trim()) patch.name = body.name.trim();
  if (typeof body.shortName === "string" && body.shortName.trim())
    patch.shortName = body.shortName.trim().slice(0, 18);
  if (typeof body.url === "string" && body.url.trim()) patch.url = body.url.trim();
  if (typeof body.provider === "string") patch.provider = body.provider;
  if (typeof body.category === "string") patch.category = body.category;
  if (typeof body.description === "string") patch.description = body.description;
  if (typeof body.paused === "boolean") patch.paused = body.paused;

  const [updated] = await db
    .update(services)
    .set(patch)
    .where(eq(services.id, id))
    .returning();
  if (!updated) return NextResponse.json({ error: "Not found" }, { status: 404 });
  await cache.del(STATUS_CACHE_KEY);
  return NextResponse.json({ ok: true, service: updated });
}

export async function DELETE(req: Request) {
  const guard = await requireAdmin();
  if (guard.error) return guard.error;
  const body = await readJson(req);
  const id = Number(body.id);
  const [existing] = await db.select().from(services).where(eq(services.id, id)).limit(1);
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
  await db.delete(probeResults).where(eq(probeResults.serviceId, id));
  await db.delete(services).where(eq(services.id, id));
  await cache.del(STATUS_CACHE_KEY);
  return NextResponse.json({ ok: true });
}

export async function GET() {
  const rows = await db
    .select({
      id: services.id,
      n: sql<number>`(select count(*) from probe_results p where p.service_id = ${services.id})::int`,
    })
    .from(services);
  return NextResponse.json({ counts: rows });
}
