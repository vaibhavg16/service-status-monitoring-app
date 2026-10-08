import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { getBoardSnapshot, listReports } from "@/lib/queries";
import { ReportsView } from "@/components/reports-view";

export const dynamic = "force-dynamic";

export default async function ReportsPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login?next=/reports");

  const [rows, snap] = await Promise.all([
    listReports({ limit: 80 }),
    getBoardSnapshot(),
  ]);

  const aspectBySlug = new Map(snap.entries.map((e) => [e.service.id, e.aspect]));

  return (
    <ReportsView
      rows={rows.map((r) => ({
        report: { ...r.report },
        service: {
          id: r.service.id,
          name: r.service.name,
          shortName: r.service.shortName,
          slug: r.service.slug,
        },
        author: r.user ? { id: r.user.id, name: r.user.name, role: r.user.role } : null,
        aspect: aspectBySlug.get(r.service.id) ?? "up",
      }))}
      currentUserId={user.id}
      isAdmin={user.role === "admin"}
      city={user.city}
      services={snap.entries.map((e) => ({
        id: e.service.id,
        name: e.service.name,
      }))}
    />
  );
}
