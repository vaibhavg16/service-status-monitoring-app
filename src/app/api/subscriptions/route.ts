import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { services, subscriptions } from "@/db/schema";
import { readJson, requireUser } from "@/lib/guard";

export const dynamic = "force-dynamic";

const CHANNELS = ["telegram", "sms", "whatsapp"] as const;
const SEVERITIES = ["degraded", "down"] as const;

export async function POST(req: Request) {
  const guard = await requireUser();
  if (guard.error) return guard.error;
  const body = await readJson(req);
  const serviceId = Number(body.serviceId);
  const channel = CHANNELS.includes(body.channel) ? body.channel : "telegram";
  const minSeverity = SEVERITIES.includes(body.minSeverity) ? body.minSeverity : "degraded";
  if (!Number.isFinite(serviceId))
    return NextResponse.json({ error: "serviceId required" }, { status: 400 });

  const [service] = await db.select().from(services).where(eq(services.id, serviceId)).limit(1);
  if (!service) return NextResponse.json({ error: "Unknown service" }, { status: 404 });

  const existing = await db
    .select()
    .from(subscriptions)
    .where(
      and(
        eq(subscriptions.userId, guard.user.id),
        eq(subscriptions.serviceId, serviceId),
        eq(subscriptions.channel, channel),
      ),
    )
    .limit(1);

  if (existing.length) {
    const [updated] = await db
      .update(subscriptions)
      .set({ active: true, minSeverity })
      .where(eq(subscriptions.id, existing[0].id))
      .returning();
    return NextResponse.json({ ok: true, sub: updated, created: false });
  }

  const [created] = await db
    .insert(subscriptions)
    .values({
      userId: guard.user.id,
      serviceId,
      channel,
      minSeverity: minSeverity as "degraded" | "down",
    })
    .returning();
  return NextResponse.json({ ok: true, sub: created, created: true }, { status: 201 });
}

export async function PATCH(req: Request) {
  const guard = await requireUser();
  if (guard.error) return guard.error;
  const body = await readJson(req);
  const id = Number(body.id);
  const [existing] = await db.select().from(subscriptions).where(eq(subscriptions.id, id)).limit(1);
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (existing.userId !== guard.user.id && guard.user.role !== "admin")
    return NextResponse.json({ error: "Not yours" }, { status: 403 });

  const patch: Partial<typeof subscriptions.$inferInsert> = {};
  if (CHANNELS.includes(body.channel)) patch.channel = body.channel;
  if (SEVERITIES.includes(body.minSeverity)) patch.minSeverity = body.minSeverity;
  if (typeof body.active === "boolean") patch.active = body.active;

  const [updated] = await db
    .update(subscriptions)
    .set(patch)
    .where(eq(subscriptions.id, id))
    .returning();
  return NextResponse.json({ ok: true, sub: updated });
}

export async function DELETE(req: Request) {
  const guard = await requireUser();
  if (guard.error) return guard.error;
  const body = await readJson(req);
  const id = body.id ? Number(body.id) : null;

  if (id) {
    const [existing] = await db.select().from(subscriptions).where(eq(subscriptions.id, id)).limit(1);
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (existing.userId !== guard.user.id && guard.user.role !== "admin")
      return NextResponse.json({ error: "Not yours" }, { status: 403 });
    await db.delete(subscriptions).where(eq(subscriptions.id, id));
    return NextResponse.json({ ok: true });
  }

  const serviceId = Number(body.serviceId);
  const channel = CHANNELS.includes(body.channel) ? body.channel : "telegram";
  await db
    .delete(subscriptions)
    .where(
      and(
        eq(subscriptions.userId, guard.user.id),
        eq(subscriptions.serviceId, serviceId),
        eq(subscriptions.channel, channel),
      ),
    );
  return NextResponse.json({ ok: true });
}
