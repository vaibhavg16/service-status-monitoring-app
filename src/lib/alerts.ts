import { and, asc, desc, eq, gte, sql } from "drizzle-orm";
import { db } from "@/db";
import { outbox, services, subscriptions, users } from "@/db/schema";
import { adviceFor } from "@/lib/status";
import { isLocale, type Locale } from "@/lib/i18n";

const RANK = { degraded: 1, down: 2 } as const;
const MIN_SEVERITY_RANK = { up: 0, degraded: 1, down: 2 } as const;

/** Don't re-notify the same user about the same service+severity inside this window. */
const DEDUPE_WINDOW_MS = 5 * 60_000;

/**
 * Alert fan-out.
 *
 * On Elastic Beanstalk this is `enqueueAlerts` → SQS → worker-tier `deliverOutbox`.
 * In this runtime the `outbox` table *is* the queue and `deliverOutbox()` is the
 * worker, driven by `startAlertWorker()` and/or `POST /api/cron/tick`.
 */
/**
 * Core fan-out. `severity` is also used for recovery ("up") so subscribers who
 * were told about a problem get told when it clears.
 */
async function fanOut(
  service: typeof services.$inferSelect,
  severity: "up" | "degraded" | "down",
  headline: string,
  body: (locale: Locale) => string,
): Promise<number> {
  const subs = await db
    .select({ sub: subscriptions, user: users })
    .from(subscriptions)
    .innerJoin(users, eq(subscriptions.userId, users.id))
    .where(
      and(eq(subscriptions.serviceId, service.id), eq(subscriptions.active, true)),
    );

  // anyone following "degraded or worse" hears about problems AND recoveries;
  // "down only" subscribers only hear about outages and their recovery.
  const matching = subs.filter(
    (s) =>
      severity === "up" ||
      RANK[severity] >= MIN_SEVERITY_RANK[s.sub.minSeverity],
  );
  if (!matching.length) return 0;

  // de-duplicate against alerts already queued/sent in the last 5 minutes
  const recent = await db
    .select({ userId: outbox.userId, severity: outbox.severity })
    .from(outbox)
    .where(
      and(
        eq(outbox.serviceId, service.id),
        gte(outbox.createdAt, new Date(Date.now() - DEDUPE_WINDOW_MS)),
      ),
    );
  const seen = new Set(recent.map((r) => `${r.userId}:${r.severity}`));

  const values = matching
    .filter((m) => !seen.has(`${m.user.id}:${severity}`))
    .map((m) => {
      const locale: Locale = isLocale(m.user.locale) ? m.user.locale : "en";
      const destination =
        m.sub.channel === "telegram"
          ? m.user.telegramId ?? `@${m.user.telegramHandle ?? m.user.email}`
          : (m.user.phone ?? m.user.email);
      return {
        userId: m.user.id,
        subscriptionId: m.sub.id,
        serviceId: service.id,
        channel: m.sub.channel,
        severity,
        title: `${service.shortName} — ${headline}`,
        body: body(locale),
        target: `${m.sub.channel}:${destination}`,
      };
    });

  if (!values.length) return 0;
  await db.insert(outbox).values(values);
  return values.length;
}

export async function enqueueAlerts(
  service: typeof services.$inferSelect,
  aspect: "degraded" | "down",
): Promise<number> {
  const headline = aspect === "down" ? "STATUS: DOWN" : "STATUS: DEGRADED";
  return fanOut(service, aspect, headline, (locale) =>
    adviceFor(locale, service.name, aspect),
  );
}

/** "It's back" message to everyone who was following the service. */
export async function enqueueRecoveryAlerts(
  service: typeof services.$inferSelect,
): Promise<number> {
  return fanOut(service, "up", "STATUS: RECOVERED", (locale) =>
    adviceFor(locale, service.name, "up"),
  );
}

type Delivery = { ok: boolean; detail?: string };

async function sendTelegram(
  chatId: string,
  title: string,
  body: string,
): Promise<Delivery> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  // No token (local dev / preview): log the row instead of failing it, so the
  // queue behaves exactly as it will in production.
  if (!token)
    return { ok: true, detail: `logged locally · ${title} · ${body.slice(0, 60)}` };
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text: `${title}\n${body}`,
        disable_web_page_preview: true,
      }),
      signal: AbortSignal.timeout(6000),
    });
    const data = await res.json();
    if (data.ok) return { ok: true };
    return {
      ok: false,
      detail: data.description ?? `Telegram HTTP ${res.status}`,
    };
  } catch (err) {
    return { ok: false, detail: err instanceof Error ? err.message : "network error" };
  }
}

async function sendWhatsApp(to: string, body: string): Promise<Delivery> {
  const token = process.env.WHATSAPP_TOKEN;
  const phoneId = process.env.WHATSAPP_PHONE_ID;
  const template = process.env.WHATSAPP_TEMPLATE || "status_alert";
  if (!token || !phoneId)
    return { ok: true, detail: "logged locally · WhatsApp not configured" };
  try {
    const res = await fetch(
      `https://graph.facebook.com/v21.0/${phoneId}/messages`,
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${token}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          recipient_type: "individual",
          to,
          type: "template",
          template: {
            name: template,
            language: { code: "en" },
            components: [
              { type: "body", parameters: [{ type: "text", text: body.slice(0, 700) }] },
            ],
          },
        }),
        signal: AbortSignal.timeout(8000),
      },
    );
    const data = await res.json();
    if (res.ok && data.messages) return { ok: true };
    return {
      ok: false,
      detail: data?.error?.message ?? `WhatsApp HTTP ${res.status}`,
    };
  } catch (err) {
    return { ok: false, detail: err instanceof Error ? err.message : "network error" };
  }
}

export async function deliverOutbox(limit = 25): Promise<number> {
  const queued = await db
    .select({ row: outbox, user: users })
    .from(outbox)
    .innerJoin(users, eq(outbox.userId, users.id))
    .where(eq(outbox.state, "queued"))
    .orderBy(asc(outbox.createdAt))
    .limit(limit);
  if (!queued.length) return 0;

  let sent = 0;
  for (const item of queued) {
    const [rawChannel, destination] = item.row.target.split(":");
    const channel = rawChannel || item.row.channel;

    let delivery: Delivery;
    if (channel === "telegram") {
      delivery = await sendTelegram(destination, item.row.title, item.row.body);
      if (!delivery.ok && destination.startsWith("@")) {
        delivery = {
          ok: false,
          detail: `${delivery.detail ?? "no chat"} — user has not pressed Start in the bot yet`,
        };
      }
    } else if (channel === "whatsapp") {
      delivery = await sendWhatsApp(destination, item.row.body);
    } else {
      // SMS: no provider wired yet — logged as a delivered demo row
      delivery = { ok: true, detail: "no SMS provider configured; logged only" };
    }

    await db
      .update(outbox)
      .set({
        state: delivery.ok ? "sent" : "failed",
        attempts: item.row.attempts + 1,
        detail: delivery.detail ?? null,
        target: `${channel}:${destination}`,
        sentAt: delivery.ok ? new Date() : null,
      })
      .where(eq(outbox.id, item.row.id));
    if (delivery.ok) sent++;
  }
  return sent;
}

/** Retry failed rows (e.g. the user pressed Start after the first attempt). */
export async function retryFailed(limit = 25): Promise<number> {
  const failed = await db
    .select({ id: outbox.id })
    .from(outbox)
    .where(eq(outbox.state, "failed"))
    .orderBy(desc(outbox.createdAt))
    .limit(limit);
  if (!failed.length) return 0;
  await db
    .update(outbox)
    .set({ state: "queued", detail: null })
    .where(
      and(
        eq(outbox.state, "failed"),
        sql`${outbox.id} in (${sql.raw(failed.map((f) => f.id).join(","))})`,
      ),
    );
  return deliverOutbox(limit);
}

type WorkerGlobal = typeof globalThis & { __iidAlertWorker?: NodeJS.Timeout };

export function startAlertWorker() {
  const g = globalThis as WorkerGlobal;
  if (g.__iidAlertWorker) return;
  if (process.env.DISABLE_PROBE_WORKER === "1") return;
  const run = async () => {
    try {
      await deliverOutbox();
      await retryFailed(10);
    } catch (err) {
      console.error("[alerts] delivery failed", err);
    }
  };
  const timer = setInterval(() => void run(), 7000);
  timer.unref?.();
  g.__iidAlertWorker = timer;
  setTimeout(() => void run(), 3000).unref?.();
  console.log("[alerts] fan-out worker started");
}

export async function recentAlerts(userId: number, limit = 12) {
  return db
    .select({ row: outbox, service: services })
    .from(outbox)
    .leftJoin(services, eq(outbox.serviceId, services.id))
    .where(eq(outbox.userId, userId))
    .orderBy(desc(outbox.createdAt))
    .limit(limit);
}
