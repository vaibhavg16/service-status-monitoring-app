import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { listOutbox, listSubscriptions, getBoardSnapshot } from "@/lib/queries";
import { SettingsView } from "@/components/settings-view";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const session = await getSessionUser();
  if (!session) redirect("/login?next=/settings");

  const userRows = await db.select().from(users).where(eq(users.id, session.id));
  const user = userRows[0];
  if (!user) redirect("/login");
  const [subs, alerts, snap] = await Promise.all([
    listSubscriptions(user.id),
    listOutbox(user.id, 40),
    getBoardSnapshot(),
  ]);
  const aspectByService = new Map(snap.entries.map((e) => [e.service.id, e.aspect]));

  return (
    <SettingsView
      user={{
        id: user.id,
        name: user.name,
        email: user.email,
        city: user.city,
        role: user.role,
        locale: user.locale,
        telegramHandle: user.telegramHandle,
        telegramId: user.telegramId,
        phone: user.phone,
      }}
      subs={subs.map((s) => ({
        id: s.sub.id,
        service: s.service.name,
        channel: s.sub.channel,
        active: s.sub.active,
        aspect: aspectByService.get(s.service.id) ?? "up",
      }))}
      alerts={alerts.map((a) => ({
        id: a.row.id,
        title: a.row.title,
        body: a.row.body,
        severity: a.row.severity,
        state: a.row.state,
        channel: a.row.channel,
        target: a.row.target,
        createdAt: a.row.createdAt.toISOString(),
        service: a.service?.name ?? "—",
      }))}
    />
  );
}
