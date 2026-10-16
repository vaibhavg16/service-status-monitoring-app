import { and, eq, inArray, ne, sql } from "drizzle-orm";
import { db } from "@/db";
import { incidentEvents, incidents, reports, services, subscriptions } from "@/db/schema";
import { cache, STATUS_CACHE_KEY } from "@/lib/cache";
import { CROWD_RED_THRESHOLD, CROWD_SUSPECT_THRESHOLD } from "@/lib/status";

/**
 * Shared mutations used by both the web API (session-authenticated) and the
 * Telegram bot (chat-authenticated), so the escalation rules live in one place.
 */

export async function createCrowdReport(input: {
  userId: number;
  serviceId: number;
  city: string;
  note?: string;
}): Promise<
  | { ok: true; duplicate: false; count: number; escalated: boolean }
  | { ok: false; reason: "unknown-service" | "duplicate"; count: number }
> {
  const [service] = await db
    .select()
    .from(services)
    .where(eq(services.id, input.serviceId))
    .limit(1);
  if (!service) return { ok: false, reason: "unknown-service", count: 0 };

  const open = await db
    .select({ id: reports.id })
    .from(reports)
    .where(
      and(
        eq(reports.serviceId, input.serviceId),
        eq(reports.userId, input.userId),
        inArray(reports.state, ["open", "confirmed"]),
      ),
    )
    .limit(1);
  if (open.length)
    return { ok: false, reason: "duplicate", count: await countOpen(input.serviceId) };

  await db.insert(reports).values({
    serviceId: input.serviceId,
    userId: input.userId,
    city: input.city.slice(0, 40),
    note: (input.note ?? "").slice(0, 240),
    state: "open",
  });

  const count = await countOpen(input.serviceId);
  let escalated = false;

  if (count >= CROWD_SUSPECT_THRESHOLD) {
    const existing = await db
      .select({ id: incidents.id })
      .from(incidents)
      .where(
        and(
          eq(incidents.serviceId, input.serviceId),
          ne(incidents.state, "resolved"),
        ),
      )
      .limit(1);

    if (!existing.length) {
      const [inc] = await db
        .insert(incidents)
        .values({
          serviceId: input.serviceId,
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
        body: `Opened from crowd reports (${count} in the window).`,
        author: "telegram-bot",
      });
      escalated = true;
    }
  }

  await cache.del(STATUS_CACHE_KEY);
  return { ok: true, duplicate: false, count, escalated };
}

async function countOpen(serviceId: number): Promise<number> {
  const rows = await db
    .select({ n: sqlCount() })
    .from(reports)
    .where(
      and(
        eq(reports.serviceId, serviceId),
        inArray(reports.state, ["open", "confirmed"]),
      ),
    );
  return Number(rows[0]?.n ?? 0);
}

// local helper so we don't import the sql builder in three places
function sqlCount() {
  return reports.id;
}

export async function setSubscription(input: {
  userId: number;
  serviceId: number;
  channel?: "telegram" | "sms" | "whatsapp";
  minSeverity?: "degraded" | "down";
}): Promise<{ ok: boolean; created: boolean }> {
  const channel = input.channel ?? "telegram";
  const minSeverity = input.minSeverity ?? "degraded";

  const existing = await db
    .select()
    .from(subscriptions)
    .where(
      and(
        eq(subscriptions.userId, input.userId),
        eq(subscriptions.serviceId, input.serviceId),
        eq(subscriptions.channel, channel),
      ),
    )
    .limit(1);

  if (existing.length) {
    if (existing[0].active && existing[0].minSeverity === minSeverity)
      return { ok: true, created: false };
    await db
      .update(subscriptions)
      .set({ active: true, minSeverity })
      .where(eq(subscriptions.id, existing[0].id));
    return { ok: true, created: false };
  }

  await db.insert(subscriptions).values({
    userId: input.userId,
    serviceId: input.serviceId,
    channel,
    minSeverity,
    active: true,
  });
  return { ok: true, created: true };
}

export async function removeSubscription(input: {
  userId: number;
  serviceId: number;
  channel?: "telegram" | "sms" | "whatsapp";
}): Promise<{ ok: boolean; removed: boolean }> {
  const channel = input.channel ?? "telegram";
  const existing = await db
    .select()
    .from(subscriptions)
    .where(
      and(
        eq(subscriptions.userId, input.userId),
        eq(subscriptions.serviceId, input.serviceId),
        eq(subscriptions.channel, channel),
      ),
    )
    .limit(1);
  if (!existing.length) return { ok: true, removed: false };

  await db.delete(subscriptions).where(eq(subscriptions.id, existing[0].id));
  await cache.del(STATUS_CACHE_KEY);
  return { ok: true, removed: true };
}

export async function listUserSubscriptions(userId: number) {
  return db
    .select({ sub: subscriptions, service: services })
    .from(subscriptions)
    .innerJoin(services, eq(subscriptions.serviceId, services.id))
    .where(eq(subscriptions.userId, userId))
    .orderBy(services.sortOrder);
}
