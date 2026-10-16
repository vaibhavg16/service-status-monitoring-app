import { NextResponse } from "next/server";
import { lt } from "drizzle-orm";
import { db } from "@/db";
import { probeResults } from "@/db/schema";
import { cache, STATUS_CACHE_KEY } from "@/lib/cache";
import { deliverOutbox, retryFailed } from "@/lib/alerts";
import { runProbeCycle, probeWorkerInfo } from "@/lib/probe";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const RETENTION_MS = 48 * 3600_000;

function authorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  const url = new URL(req.url);
  const bearer = req.headers.get("authorization");
  if (secret) {
    return url.searchParams.get("key") === secret || bearer === `Bearer ${secret}`;
  }
  // No secret configured: only allow open access while developing locally.
  return process.env.NODE_ENV !== "production";
}

/**
 * One scheduled tick: probe every service, drain the alert outbox, prune old
 * probe rows, warm the status cache.
 *
 * Use this when the app runs where in-process timers don't persist (Vercel,
 * Netlify, serverless containers). Point Vercel Cron, a GitHub Actions
 * schedule, cron-job.org or a host cron at it, e.g.
 *
 *   curl -X POST "https://yourdomain.com/api/cron/tick?key=$CRON_SECRET"
 */
export async function POST(req: Request) {
  if (!authorized(req))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const cycle = await runProbeCycle();
  const delivered = await deliverOutbox(50);
  const retried = await retryFailed(20);

  const pruned = await db
    .delete(probeResults)
    .where(lt(probeResults.checkedAt, new Date(Date.now() - RETENTION_MS)))
    .returning({ id: probeResults.id });

  await cache.del(STATUS_CACHE_KEY);

  return NextResponse.json({
    ok: true,
    cycle,
    delivered,
    retried,
    pruned: pruned.length,
    worker: probeWorkerInfo(),
    at: new Date().toISOString(),
  });
}

export async function GET(req: Request) {
  return POST(req);
}
