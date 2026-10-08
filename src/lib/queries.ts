import { and, asc, desc, eq, gte, inArray, ne, or, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  appComponents,
  incidentEvents,
  incidents,
  outbox,
  probeResults,
  reports,
  services,
  subscriptions,
  users,
} from "@/db/schema";
import { cache, STATUS_CACHE_KEY } from "@/lib/cache";
import {
  crowdAspect,
  mergeAspect,
  percentile,
  probeAspect,
  type Aspect,
} from "@/lib/status";

export type ServiceRow = typeof services.$inferSelect;
export type ReportRow = typeof reports.$inferSelect;
export type IncidentRow = typeof incidents.$inferSelect;
export type SubscriptionRow = typeof subscriptions.$inferSelect;
export type OutboxRow = typeof outbox.$inferSelect;
export type ComponentRow = typeof appComponents.$inferSelect;

export type BoardEntry = {
  service: ServiceRow;
  aspect: Aspect;
  probeAspect: Aspect;
  crowdAspect: Aspect | null;
  forced: boolean;
  latency: number | null;
  lastProbeAt: string | null;
  series: number[];
  uptime24: number;
  p50: number;
  p95: number;
  checks24: number;
  reportCount: number;
  openIncidentId: number | null;
};

export type BoardSnapshot = {
  generatedAt: string;
  entries: BoardEntry[];
  totals: { up: number; degraded: number; down: number; paused: number };
  checks24: number;
  backend: string;
};

const CROWD_WINDOW_MIN = 15;
const SIM_KEY = "sim:forced:v1";

export type ForcedMap = Partial<Record<string, Aspect>>;

export async function readForced(): Promise<ForcedMap> {
  return (await cache.get<ForcedMap>(SIM_KEY)) ?? {};
}
export async function writeForced(map: ForcedMap): Promise<void> {
  await cache.set(SIM_KEY, map, 0);
}

function downsample(values: number[], target: number): number[] {
  if (values.length <= target) return values;
  const bucket = values.length / target;
  const out: number[] = [];
  for (let i = 0; i < target; i++) {
    const start = Math.floor(i * bucket);
    const end = Math.max(start + 1, Math.floor((i + 1) * bucket));
    const slice = values.slice(start, end);
    out.push(Math.round(slice.reduce((a, b) => a + b, 0) / slice.length));
  }
  return out;
}

export async function getBoardSnapshot(opts?: {
  force?: boolean;
}): Promise<BoardSnapshot> {
  if (!opts?.force) {
    const hit = await cache.get<BoardSnapshot>(STATUS_CACHE_KEY);
    if (hit) return hit;
  }

  const since = new Date(Date.now() - 24 * 3600_000);
  const crowdSince = new Date(Date.now() - CROWD_WINDOW_MIN * 60_000);

  const [serviceRows, probeRows, reportRows, incidentRows, forced] =
    await Promise.all([
      db.select().from(services).orderBy(asc(services.sortOrder), asc(services.id)),
      db
        .select({
          serviceId: probeResults.serviceId,
          checkedAt: probeResults.checkedAt,
          latencyMs: probeResults.latencyMs,
          success: probeResults.success,
          status: probeResults.status,
        })
        .from(probeResults)
        .where(gte(probeResults.checkedAt, since))
        .orderBy(asc(probeResults.checkedAt)),
      db
        .select({
          serviceId: reports.serviceId,
          n: sql<number>`count(*)::int`,
        })
        .from(reports)
        .where(
          and(
            gte(reports.createdAt, crowdSince),
            inArray(reports.state, ["open", "confirmed"]),
          ),
        )
        .groupBy(reports.serviceId),
      db
        .select({
          id: incidents.id,
          serviceId: incidents.serviceId,
          state: incidents.state,
        })
        .from(incidents)
        .where(ne(incidents.state, "resolved")),
      readForced(),
    ]);

  const byService = new Map<number, typeof probeRows>();
  for (const row of probeRows) {
    const arr = byService.get(row.serviceId) ?? [];
    arr.push(row);
    byService.set(row.serviceId, arr);
  }
  const reportMap = new Map(reportRows.map((r) => [r.serviceId, r.n]));
  const incidentMap = new Map(
    incidentRows.filter((i) => i.state !== "resolved").map((i) => [i.serviceId, i.id]),
  );

  const entries: BoardEntry[] = serviceRows.map((service) => {
    const rows = byService.get(service.id) ?? [];
    const latencies = rows.map((r) => r.latencyMs);
    const last = rows[rows.length - 1];
    const recent = rows.slice(-1);
    const baseAspect: Aspect = last
      ? probeAspect(
          last.latencyMs,
          last.success,
          service.degradedThresholdMs,
          service.downThresholdMs,
        )
      : "up";
    const rCount = reportMap.get(service.id) ?? 0;
    const cAspect = crowdAspect(rCount);
    const forcedAspect = forced[service.slug];
    const derived = forcedAspect ?? mergeAspect(baseAspect, cAspect);
    const successes = rows.filter((r) => r.success).length;

    return {
      service,
      aspect: service.paused && !forcedAspect ? "up" : derived,
      probeAspect: baseAspect,
      crowdAspect: cAspect,
      forced: Boolean(forcedAspect),
      latency: recent.length ? recent[recent.length - 1].latencyMs : null,
      lastProbeAt: last ? last.checkedAt.toISOString() : null,
      series: downsample(latencies, 48),
      uptime24: rows.length ? Math.round((successes / rows.length) * 1000) / 10 : 100,
      p50: percentile(latencies, 50),
      p95: percentile(latencies, 95),
      checks24: rows.length,
      reportCount: rCount,
      openIncidentId: incidentMap.get(service.id) ?? null,
    };
  });

  const totals = { up: 0, degraded: 0, down: 0, paused: 0 };
  for (const e of entries) {
    if (e.service.paused) totals.paused++;
    totals[e.aspect]++;
  }

  const snapshot: BoardSnapshot = {
    generatedAt: new Date().toISOString(),
    entries,
    totals,
    checks24: entries.reduce((a, e) => a + e.checks24, 0),
    backend: cache.backend(),
  };
  await cache.set(STATUS_CACHE_KEY, snapshot, 8000);
  return snapshot;
}

export async function getReportCounts(since = CROWD_WINDOW_MIN) {
  const rows = await db
    .select({ serviceId: reports.serviceId, n: sql<number>`count(*)::int` })
    .from(reports)
    .where(
      and(
        gte(reports.createdAt, new Date(Date.now() - since * 60_000)),
        inArray(reports.state, ["open", "confirmed"]),
      ),
    )
    .groupBy(reports.serviceId);
  return new Map(rows.map((r) => [r.serviceId, r.n]));
}

export async function listReports(opts: { userId?: number; limit?: number }) {
  const limit = opts.limit ?? 60;
  const rows = await db
    .select({
      report: reports,
      service: services,
      user: users,
    })
    .from(reports)
    .innerJoin(services, eq(reports.serviceId, services.id))
    .leftJoin(users, eq(reports.userId, users.id))
    .orderBy(desc(reports.createdAt))
    .limit(limit);
  return opts.userId
    ? rows.filter((r) => r.report.userId === opts.userId)
    : rows;
}

export async function listSubscriptions(userId: number) {
  return db
    .select({ sub: subscriptions, service: services })
    .from(subscriptions)
    .innerJoin(services, eq(subscriptions.serviceId, services.id))
    .where(eq(subscriptions.userId, userId))
    .orderBy(asc(services.sortOrder));
}

export async function listIncidents(limit = 40) {
  return db
    .select({ incident: incidents, service: services })
    .from(incidents)
    .innerJoin(services, eq(incidents.serviceId, services.id))
    .orderBy(desc(incidents.startedAt))
    .limit(limit);
}

export async function listIncidentEvents(incidentIds: number[]) {
  if (!incidentIds.length) return [];
  return db
    .select()
    .from(incidentEvents)
    .where(inArray(incidentEvents.incidentId, incidentIds))
    .orderBy(asc(incidentEvents.at));
}

export async function listOutbox(userId?: number, limit = 50) {
  const rows = await db
    .select({ row: outbox, service: services, user: users })
    .from(outbox)
    .leftJoin(services, eq(outbox.serviceId, services.id))
    .leftJoin(users, eq(outbox.userId, users.id))
    .orderBy(desc(outbox.createdAt))
    .limit(limit);
  return userId ? rows.filter((r) => r.row.userId === userId) : rows;
}

export async function listAppComponents() {
  return db.select().from(appComponents).orderBy(asc(appComponents.id));
}

export async function getUserSubscribedSlugs(userId: number): Promise<string[]> {
  const rows = await db
    .select({ slug: services.slug })
    .from(subscriptions)
    .innerJoin(services, eq(subscriptions.serviceId, services.id))
    .where(eq(subscriptions.userId, userId));
  return rows.map((r) => r.slug);
}

export async function countReportsFor(serviceId: number, minutes: number) {
  const rows = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(reports)
    .where(
      and(
        gte(reports.createdAt, new Date(Date.now() - minutes * 60_000)),
        eq(reports.serviceId, serviceId),
        inArray(reports.state, ["open", "confirmed"]),
      ),
    );
  return rows[0]?.n ?? 0;
}

export function severityRank(a: Aspect): number {
  return a === "down" ? 2 : a === "degraded" ? 1 : 0;
}

export { or };
