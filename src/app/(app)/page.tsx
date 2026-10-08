import { getBoardSnapshot, getUserSubscribedSlugs, listReports } from "@/lib/queries";
import { getSessionUser } from "@/lib/auth";
import { Board } from "@/components/board";

export const dynamic = "force-dynamic";

export default async function StatusBoardPage() {
  const [snapshot, user] = await Promise.all([getBoardSnapshot(), getSessionUser()]);
  const subscribed = user ? await getUserSubscribedSlugs(user.id) : [];
  const reportedIds = user
    ? (await listReports({ userId: user.id, limit: 30 })).map((r) => r.report.serviceId)
    : [];

  return (
    <Board
      entries={snapshot.entries}
      totals={snapshot.totals}
      checks24={snapshot.checks24}
      generatedAt={snapshot.generatedAt}
      backend={snapshot.backend}
      subscribed={subscribed}
      reportedIds={reportedIds}
      signedIn={Boolean(user)}
      isAdmin={user?.role === "admin"}
    />
  );
}
