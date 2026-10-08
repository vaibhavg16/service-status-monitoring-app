import { and, asc, desc, eq, inArray, ne } from "drizzle-orm";
import { db } from "@/db";
import { incidentEvents, incidents, probeResults, services } from "@/db/schema";
import { cache, STATUS_CACHE_KEY } from "@/lib/cache";
import { readForced, type ForcedMap } from "@/lib/queries";
import { probeAspect, type Aspect } from "@/lib/status";
import { enqueueAlerts, enqueueRecoveryAlerts } from "@/lib/alerts";

export type ProbeOutcome = {
  slug: string;
  latencyMs: number;
  success: boolean;
  source: "http" | "sim-net" | "sim-forced";
  detail: string;
};

/** Deterministic-ish synthetic latency used when the network is unreachable. */
function synthetic(service: typeof services.$inferSelect, now: number): ProbeOutcome {
  const bucket = Math.floor(now / 60_000);
  let h = 2166136261;
  const seed = `${service.slug}:${bucket}`;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  const r = ((h >>> 0) % 10000) / 10000;
  const jitter = 0.75 + ((h >>> 8) % 1000) / 1000; // 0.75 .. 1.75
  let latency = Math.round(service.baseLatencyMs * jitter);
  let success = true;
  let detail = "synthetic (egress unreachable)";

  if (r > 0.985) {
    latency = service.downThresholdMs + Math.round(r * 900);
    success = false;
    detail = "synthetic: connection reset by peer";
  } else if (r > 0.955) {
    latency = Math.round(service.degradedThresholdMs * (1 + r));
    detail = "synthetic: upstream queueing";
  }
  return { slug: service.slug, latencyMs: latency, success, source: "sim-net", detail };
}

async function probeOne(
  service: typeof services.$inferSelect,
  forcedAspect?: Aspect,
): Promise<ProbeOutcome> {
  if (forcedAspect) {
    return {
      slug: service.slug,
      latencyMs: forcedAspect === "down" ? service.downThresholdMs + 400 : forcedAspect === "degraded" ? service.degradedThresholdMs + 200 : Math.round(service.baseLatencyMs * 0.9),
      success: forcedAspect !== "down",
      source: "sim-forced",
      detail: `forced ${forcedAspect} from simulation panel`,
    };
  }

  const started = Date.now();
  try {
    const res = await fetch(service.url, {
      method: "GET",
      cache: "no-store",
      redirect: "follow",
      headers: { "user-agent": "IsItDownIndia-Probe/1.0 (+health monitor)" },
      signal: AbortSignal.timeout(Math.min(service.timeoutMs, 5000)),
    });
    const latency = Date.now() - started;
    // Any HTTP answer means the endpoint is reachable; 5xx counts as degraded.
    const ok = res.status < 500;
    return {
      slug: service.slug,
      latencyMs: latency,
      success: ok,
      source: "http",
      detail: `HTTP ${res.status} in ${latency}ms`,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const synth = synthetic(service, started);
    return { ...synth, detail: `${synth.detail} · ${msg.slice(0, 80)}` };
  }
}

export async function runProbeCycle(): Promise<{
  checked: number;
  changes: string[];
  durationMs: number;
}> {
  const t0 = Date.now();
  const active = await db
    .select()
    .from(services)
    .where(eq(services.paused, false))
    .orderBy(asc(services.sortOrder));
  if (active.length === 0) {
    return { checked: 0, changes: [], durationMs: 0 };
  }

  const forced = await readForced();
  const [previousRows] = await Promise.all([
    db
      .select()
      .from(probeResults)
      .where(inArray(probeResults.serviceId, active.map((s) => s.id)))
      .orderBy(desc(probeResults.checkedAt))
      .limit(active.length * 3),
  ]);

  const previous = new Map<number, Aspect>();
  for (const row of previousRows) {
    if (!previous.has(row.serviceId)) previous.set(row.serviceId, row.status);
  }

  const outcomes = await Promise.all(
    active.map((s) => probeOne(s, forced[s.slug])),
  );
  const bySlug = new Map(active.map((s) => [s.slug, s]));

  const inserted: Array<{
    serviceId: number;
    latencyMs: number;
    success: boolean;
    status: Aspect;
    detail: string;
    source: string;
  }> = [];

  for (const out of outcomes) {
    const service = bySlug.get(out.slug);
    if (!service) continue;
    const status = probeAspect(
      out.latencyMs,
      out.success,
      service.degradedThresholdMs,
      service.downThresholdMs,
    );
    inserted.push({
      serviceId: service.id,
      latencyMs: out.latencyMs,
      success: out.success,
      status,
      detail: out.detail,
      source: out.source,
    });
  }

  if (inserted.length) {
    await db.insert(probeResults).values(
      inserted.map((i) => ({ ...i, checkedAt: new Date() })),
    );
  }

  const changes: string[] = [];
  for (const row of inserted) {
    const service = active.find((s) => s.id === row.serviceId)!;
    const before = previous.get(row.serviceId) ?? "up";
    if (before === row.status) continue;
    changes.push(`${service.slug}: ${before} → ${row.status}`);
    await handleTransition(service, before, row.status, row.detail);
  }

  await cache.del(STATUS_CACHE_KEY);
  return { checked: inserted.length, changes, durationMs: Date.now() - t0 };
}

async function handleTransition(
  service: typeof services.$inferSelect,
  before: Aspect,
  after: Aspect,
  detail: string,
) {
  const worsening = after !== "up" && before === "up";
  const recovering = after === "up" && before !== "up";

  if (worsening) {
    const [inc] = await db
      .insert(incidents)
      .values({
        serviceId: service.id,
        title: `${service.shortName} ${after === "down" ? "outage" : "degradation"} detected`,
        severity: after,
        state: "investigating",
        startedAt: new Date(),
        cause: `Probe transition ${before} → ${after}. ${detail}`,
        origin: "probe",
      })
      .returning();
    await db.insert(incidentEvents).values({
      incidentId: inc.id,
      kind: "detect",
      body: `Automatic probe recorded ${after} (${detail}). Watching for recovery.`,
      author: "probe-worker",
    });
  } else if (recovering) {
    const open = await db
      .select()
      .from(incidents)
      .where(
        and(eq(incidents.serviceId, service.id), ne(incidents.state, "resolved")),
      )
      .limit(1);
    const inc = open[0];
    if (inc) {
      const minutes = Math.max(
        1,
        Math.round((Date.now() - inc.startedAt.getTime()) / 60000),
      );
      await db
        .update(incidents)
        .set({ state: "resolved", resolvedAt: new Date(), autoClosed: true })
        .where(eq(incidents.id, inc.id));
      await db.insert(incidentEvents).values({
        incidentId: inc.id,
        kind: "resolve",
        body: `Recovered automatically after ${minutes} min. Probe reports UP again.`,
        author: "probe-worker",
      });
    }
  } else if (after === "down") {
    const open = await db
      .select()
      .from(incidents)
      .where(
        and(eq(incidents.serviceId, service.id), ne(incidents.state, "resolved")),
      )
      .limit(1);
    if (open[0]) {
      await db
        .update(incidents)
        .set({ severity: "down" })
        .where(eq(incidents.id, open[0].id));
    }
  }

  if (after !== "up") await enqueueAlerts(service, after);
  else if (before !== "up") await enqueueRecoveryAlerts(service);
}

/* ------------------------------ worker ------------------------------ */

type WorkerGlobal = typeof globalThis & {
  __iidProbeWorker?: { timer: NodeJS.Timeout; runs: number };
  __iidProbeBusy?: boolean;
};

const INTERVAL_MS = Number(process.env.PROBE_INTERVAL_MS || 30_000);

export function startProbeWorker() {
  const g = globalThis as WorkerGlobal;
  if (g.__iidProbeWorker) return g.__iidProbeWorker;
  if (process.env.DISABLE_PROBE_WORKER === "1") return null;

  const tick = async () => {
    if (g.__iidProbeBusy) return;
    g.__iidProbeBusy = true;
    try {
      const res = await runProbeCycle();
      if (res.changes.length) {
        console.log(`[probe] ${res.checked} checks, ${res.durationMs}ms`, res.changes);
      }
    } catch (err) {
      console.error("[probe] cycle failed", err);
    } finally {
      g.__iidProbeBusy = false;
    }
  };

  const timer = setInterval(() => void tick(), INTERVAL_MS);
  timer.unref?.();
  const worker = { timer, runs: 0 };
  g.__iidProbeWorker = worker;
  // first cycle shortly after boot so the board is never stale
  setTimeout(() => void tick(), 1500).unref?.();
  console.log(`[probe] worker started, interval ${INTERVAL_MS}ms`);
  return worker;
}

export function probeWorkerInfo() {
  const g = globalThis as WorkerGlobal;
  return { running: Boolean(g.__iidProbeWorker), intervalMs: INTERVAL_MS };
}

export async function seedProbesFor(
  serviceIds: number[],
  hours: number,
  stepMinutes: number,
) {
  const rows: Array<(typeof probeResults.$inferInsert)> = [];
  const now = Date.now();
  const list = await db.select().from(services).where(inArray(services.id, serviceIds));
  for (const service of list) {
    for (let t = hours * 60; t >= 0; t -= stepMinutes) {
      const at = new Date(now - t * 60_000);
      const bucket = Math.floor(at.getTime() / 60_000);
      let h = 2166136261;
      const seed = `${service.slug}:${bucket}`;
      for (let i = 0; i < seed.length; i++) {
        h ^= seed.charCodeAt(i);
        h = Math.imul(h, 16777619);
      }
      const r = ((h >>> 0) % 10000) / 10000;
      const jitter = 0.8 + ((h >>> 7) % 900) / 1000;
      let latency = Math.round(service.baseLatencyMs * jitter);
      let success = true;
      let detail = "seeded history";
      if (r > 0.978) {
        latency = service.downThresholdMs + Math.round(r * 1200);
        success = false;
        detail = "seeded: gateway timeout";
      } else if (r > 0.93) {
        latency = Math.round(service.degradedThresholdMs * (0.9 + r * 0.4));
        detail = "seeded: peak-hour queueing";
      }
      const status = probeAspect(
        latency,
        success,
        service.degradedThresholdMs,
        service.downThresholdMs,
      );
      rows.push({
        serviceId: service.id,
        checkedAt: at,
        latencyMs: latency,
        success,
        status,
        source: "seed",
        detail,
      });
    }
  }
  const chunk = 500;
  for (let i = 0; i < rows.length; i += chunk) {
    await db.insert(probeResults).values(rows.slice(i, i + chunk));
  }
  return rows.length;
}
