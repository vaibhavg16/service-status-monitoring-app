import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { getBoardSnapshot, listSubscriptions } from "@/lib/queries";
import { SubscriptionsView } from "@/components/subscriptions-view";

export const dynamic = "force-dynamic";

export default async function SubscriptionsPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login?next=/subscriptions");
  const [rows, snap] = await Promise.all([
    listSubscriptions(user.id),
    getBoardSnapshot(),
  ]);

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3 border-b border-rule pb-4">
        <div>
          <div className="micro">Yours</div>
          <h1 className="display mt-1 text-[clamp(1.6rem,4vw,2.4rem)]">
            My Subscriptions
          </h1>
          <p className="mt-1.5 max-w-[62ch] text-sm text-ink-2">
            Pick the services and banks you want alerts for. Telegram now; SMS and
            WhatsApp next.
          </p>
        </div>
        <Link
          href="/"
          className="border border-rule bg-card px-3 py-2 text-xs hover:border-ink/40"
        >
          ← Status Board
        </Link>
      </header>

      <SubscriptionsView
        rows={rows.map((r) => ({
          ...r,
          aspect:
            snap.entries.find((e) => e.service.id === r.service.id)?.aspect ?? "up",
        }))}
        services={snap.entries.map((e) => ({
          id: e.service.id,
          slug: e.service.slug,
          name: e.service.name,
          shortName: e.service.shortName,
          provider: e.service.provider,
          aspect: e.aspect,
          paused: e.service.paused,
        }))}
        telegramHandle={user.telegramHandle}
      />
    </div>
  );
}
