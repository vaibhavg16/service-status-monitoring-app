import Link from "next/link";
import { db } from "@/db";
import { appComponents, incidentEvents, incidents, services, probeResults } from "@/db/schema";
import { asc, desc, eq, gte, inArray, sql } from "drizzle-orm";
import { Lamp, Pill, StatusStamp } from "@/components/ui";
import { Mark } from "@/components/shell";
import { ist } from "@/lib/status";
import { getBoardSnapshot } from "@/lib/queries";

export const dynamic = "force-dynamic";

export default async function SelfHealthPage() {
  const since = new Date(Date.now() - 24 * 3600_000);
  const [components, history, snap, probeCount, incidentRows] = await Promise.all([
    db.select().from(appComponents).orderBy(asc(appComponents.id)),
    db
      .select({
        check: probeResults.checkedAt,
        ok: probeResults.success,
        latency: probeResults.latencyMs,
      })
      .from(probeResults)
      .where(gte(probeResults.checkedAt, since))
      .orderBy(desc(probeResults.checkedAt))
      .limit(4000),
    getBoardSnapshot({ force: true }),
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(probeResults)
      .where(gte(probeResults.checkedAt, since)),
    db
      .select({ incident: incidents, service: services })
      .from(incidents)
      .innerJoin(services, eq(incidents.serviceId, services.id))
      .orderBy(desc(incidents.startedAt))
      .limit(6),
  ]);

  const events = await listNotes(incidentRows.map((r) => r.incident.id));

  const okRate = history.length
    ? Math.round(
        (history.filter((h) => h.ok).length / history.length) * 1000,
      ) / 10
    : 100;
  const degradedComponents = components.filter((c) => c.state !== "up");
  const overall: "up" | "degraded" | "down" =
    degradedComponents.length === 0 ? "up" : degradedComponents.some((c) => c.state === "down") ? "down" : "degraded";

  return (
    <div className="relative z-10 min-h-dvh">
      <header className="border-b border-rule bg-paper">
        <div className="mx-auto flex h-16 w-full max-w-[1100px] items-center gap-3 px-4 sm:px-6">
          <Mark size={28} />
          <div className="min-w-0">
            <div className="text-sm font-semibold">Is It Down, India?</div>
            <div className="micro !text-[9px]">App health · public</div>
          </div>
          <Link
            href="/"
            className="ml-auto border border-rule bg-card px-3 py-2 text-xs hover:border-ink/40"
          >
            ← {t_safe("nav.board")}
          </Link>
        </div>
      </header>

      <main className="mx-auto w-full max-w-[1100px] px-4 py-8 sm:px-6">
        <section className="relative -mx-4 overflow-hidden bg-board px-4 py-8 text-paper sm:-mx-6 sm:px-6">
          <div className="flex flex-wrap items-end justify-between gap-5">
            <div>
              <div className="micro !text-paper/45">Overall</div>
              <div className="mt-2 flex items-center gap-3">
                <Lamp aspect={overall} size={30} />
                <h1 className="display text-[clamp(1.7rem,5vw,3rem)] leading-none">
                  {overall === "up"
                    ? "All systems operational"
                    : overall === "degraded"
                      ? "Degraded performance"
                      : "Service disruption"}
                </h1>
              </div>
              <p className="mt-3 max-w-[56ch] text-sm text-paper/65">
                This is the status page for the status page: probe worker, Postgres
                store, hot status cache, alert fan-out and the web app itself.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-x-6 gap-y-3 font-mono text-xs text-paper/70">
              <div>
                <div className="micro !text-paper/40">Probe success 24h</div>
                <div className="tnum mt-1 text-2xl text-paper">{okRate}%</div>
              </div>
              <div>
                <div className="micro !text-paper/40">Checks 24h</div>
                <div className="tnum mt-1 text-2xl text-paper">
                  {(probeCount[0]?.n ?? 0).toLocaleString("en-IN")}
                </div>
              </div>
              <div>
                <div className="micro !text-paper/40">Cache</div>
                <div className="tnum mt-1 text-2xl text-paper">{snap.backend}</div>
              </div>
              <div>
                <div className="micro !text-paper/40">Services</div>
                <div className="tnum mt-1 text-2xl text-paper">
                  {snap.entries.length}
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="mt-8">
          <div className="micro mb-3">Components</div>
          <div className="paper-card">
            {components.map((c) => (
              <div key={c.id} className="rule-row flex flex-wrap items-center gap-3 px-4 py-4 sm:px-5">
                <Lamp aspect={c.state} size={20} />
                <div className="min-w-0 flex-1 basis-[200px]">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold">{c.name}</span>
                    <StatusStamp aspect={c.state} />
                  </div>
                  <div className="mt-1 text-[13px] text-ink-2">{c.description}</div>
                </div>
                <div className="text-right">
                  <div className="micro">Uptime 7d</div>
                  <div className="tnum text-lg">{Number(c.uptime7d).toFixed(2)}%</div>
                </div>
                <div className="tnum w-[130px] text-right text-[11px] text-ink-3">
                  updated {ist(new Date(c.updatedAt))}
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="mt-8 grid gap-5 lg:grid-cols-[1.2fr_1fr]">
          <div>
            <div className="micro mb-3">Past app incidents</div>
            <div className="paper-card">
              {incidentRows.length === 0 && (
                <p className="px-4 py-8 text-center text-sm text-ink-2">
                  No app incidents recorded.
                </p>
              )}
              {incidentRows.map((r) => (
                <div key={r.incident.id} className="rule-row px-4 py-4 sm:px-5">
                  <div className="flex flex-wrap items-center gap-2">
                    <Pill tone={r.incident.state === "resolved" ? "up" : "danger"}>
                      {r.incident.state}
                    </Pill>
                    <span className="text-sm font-semibold">{r.incident.title}</span>
                  </div>
                  <div className="micro mt-2">
                    {r.service.shortName} · {ist(new Date(r.incident.startedAt))} IST
                    {r.incident.resolvedAt
                      ? ` → ${ist(new Date(r.incident.resolvedAt))}`
                      : " → ongoing"}
                  </div>
                  <p className="mt-1.5 text-[13px] text-ink-2">{r.incident.cause}</p>
                  {events
                    .filter((e) => e.incidentId === r.incident.id)
                    .slice(0, 2)
                    .map((e) => (
                      <p key={e.id} className="mt-2 border-l-2 border-rule pl-3 text-[12px] text-ink-2">
                        {e.body}
                      </p>
                    ))}
                </div>
              ))}
            </div>
          </div>

          <div>
            <div className="micro mb-3">Monitored right now</div>
            <div className="paper-card">
              {snap.entries.map((e) => (
                <div key={e.service.id} className="rule-row flex items-center gap-3 px-4 py-3">
                  <Lamp aspect={e.aspect} paused={e.service.paused} size={16} />
                  <span className="min-w-0 flex-1 truncate text-[13px]">{e.service.name}</span>
                  <span className="tnum text-[11px] text-ink-3">{e.latency ?? "—"} ms</span>
                </div>
              ))}
            </div>
            <div className="mt-4 border border-rule bg-card p-4 text-xs leading-relaxed text-ink-2">
              Probes run every 30 seconds from the worker tier. Alert fan-out drains
              an outbox queue every 7 seconds. Reports from 3+ people open an
              incident automatically; 10+ flip the public board red.
            </div>
          </div>
        </section>

        <footer className="mt-10 flex flex-wrap items-center justify-between gap-3 border-t border-rule py-6 text-xs text-ink-3">
          <span>Is It Down, India? · public status page</span>
          <span className="tnum">generated {ist(new Date(), true)} IST</span>
        </footer>
      </main>
    </div>
  );
}

async function listNotes(ids: number[]) {
  if (!ids.length) return [];
  return db
    .select()
    .from(incidentEvents)
    .where(inArray(incidentEvents.incidentId, ids))
    .orderBy(asc(incidentEvents.at))
    .limit(20);
}

function t_safe(key: string) {
  return key === "nav.board" ? "Status Board" : key;
}
