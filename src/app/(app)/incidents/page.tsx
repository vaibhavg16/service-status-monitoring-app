import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { listIncidentEvents, listIncidents } from "@/lib/queries";
import { IncidentsView } from "@/components/incidents-view";

export const dynamic = "force-dynamic";

export default async function IncidentsPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login?next=/incidents");

  const rows = await listIncidents(50);
  const events = await listIncidentEvents(rows.map((r) => r.incident.id));

  return (
    <IncidentsView
      isAdmin={user.role === "admin"}
      rows={rows.map((r) => ({
        incident: { ...r.incident },
        service: { id: r.service.id, name: r.service.name, shortName: r.service.shortName },
        events: events
          .filter((e) => e.incidentId === r.incident.id)
          .map((e) => ({ ...e })),
      }))}
    />
  );
}
