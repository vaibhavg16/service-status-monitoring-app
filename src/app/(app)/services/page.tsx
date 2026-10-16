import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { getBoardSnapshot, readForced } from "@/lib/queries";
import { db } from "@/db";
import { services } from "@/db/schema";
import { asc } from "drizzle-orm";
import { ServicesView } from "@/components/services-view";

export const dynamic = "force-dynamic";

export default async function ServicesPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login?next=/services");
  if (user.role !== "admin") redirect("/");

  const [rows, snap, forced] = await Promise.all([
    db.select().from(services).orderBy(asc(services.sortOrder), asc(services.id)),
    getBoardSnapshot({ force: true }),
    readForced(),
  ]);

  return (
    <ServicesView
      rows={rows.map((r) => ({ ...r }))}
      aspects={Object.fromEntries(snap.entries.map((e) => [e.service.id, e.aspect]))}
      forced={forced}
      probeInfo={snap.entries.map((e) => ({
        id: e.service.id,
        latency: e.latency,
        checks24: e.checks24,
        uptime24: e.uptime24,
        reports: e.reportCount,
      }))}
    />
  );
}
