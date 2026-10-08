import { and, eq, ne } from "drizzle-orm";
import { db } from "@/db";
import { services, users } from "@/db/schema";
import type { ServiceRow } from "@/lib/queries";
import { decodeTelegramLinkToken } from "@/lib/auth";
import { isUniqueViolation } from "@/lib/telegram-handle";
import { botLocale, botT } from "@/lib/bot-i18n";
import type { Locale } from "@/lib/i18n";
import { getBoardSnapshot } from "@/lib/queries";
import {
  createCrowdReport,
  listUserSubscriptions,
  removeSubscription,
  setSubscription,
} from "@/lib/actions";

const API = "https://api.telegram.org/bot";

/* ------------------------------------------------------------------ */
/* low-level Bot API calls                                            */
/* ------------------------------------------------------------------ */

type Keyboard = { inline_keyboard: Array<Array<{ text: string; callback_data: string }>> };

async function call(method: string, body: Record<string, unknown>) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return null;
  try {
    const res = await fetch(`${API}${token}/${method}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(8000),
    });
    return await res.json();
  } catch {
    return null;
  }
}

export async function sendMessage(
  chatId: string | number,
  text: string,
  keyboard?: Keyboard,
) {
  return call("sendMessage", {
    chat_id: chatId,
    text,
    disable_web_page_preview: true,
    ...(keyboard ? { reply_markup: keyboard } : {}),
  });
}

async function editMessage(
  chatId: string | number,
  messageId: number,
  text: string,
  keyboard?: Keyboard,
) {
  return call("editMessageText", {
    chat_id: chatId,
    message_id: messageId,
    text,
    disable_web_page_preview: true,
    ...(keyboard ? { reply_markup: keyboard } : {}),
  });
}

async function answerCallback(id: string, text?: string) {
  return call("answerCallbackQuery", {
    callback_query_id: id,
    ...(text ? { text } : {}),
  });
}

/* ------------------------------------------------------------------ */
/* service matching + keyboards                                       */
/* ------------------------------------------------------------------ */

const ALIASES: Record<string, string> = {
  npci: "upi-npci",
  upi: "upi-npci",
  hdfc: "upi-hdfc",
  sbi: "upi-sbi",
  onlinesbi: "upi-sbi",
  icici: "upi-icici",
  paytm: "upi-paytm",
  phonepe: "upi-phonepe",
  gpay: "upi-gpay",
  googlepay: "upi-gpay",
  google: "upi-gpay",
  irctc: "irctc",
  railway: "irctc",
  railways: "irctc",
  tatkal: "irctc",
  digilocker: "digilocker",
  aadhaar: "aadhaar-ekyc",
  uidai: "aadhaar-ekyc",
  ekyc: "aadhaar-ekyc",
  gst: "gst-portal",
  gstn: "gst-portal",
  incometax: "income-tax",
  itr: "income-tax",
  tax: "income-tax",
  it: "income-tax",
};

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

export async function matchService(query: string): Promise<ServiceRow | null> {
  const q = norm(query);
  if (!q) return null;
  const all = await db.select().from(services).orderBy(services.sortOrder);
  const bySlug = ALIASES[q];
  if (bySlug) {
    const hit = all.find((s) => s.slug === bySlug);
    if (hit) return hit;
  }
  return (
    all.find((s) => norm(s.slug) === q) ??
    all.find((s) => norm(s.shortName) === q) ??
    all.find((s) => norm(s.name) === q) ??
    all.find((s) => norm(s.name).includes(q)) ??
    all.find((s) => norm(s.shortName).includes(q)) ??
    null
  );
}

async function allServices(): Promise<ServiceRow[]> {
  return db.select().from(services).orderBy(services.sortOrder);
}

/** 2-up grid of service buttons; prefix decides the callback action. */
async function serviceKeyboard(
  prefix: "sub" | "unsub" | "rep",
  subscribedSlugs: Set<string> = new Set(),
): Promise<Keyboard> {
  const all = await allServices();
  const rows: Keyboard["inline_keyboard"] = [];
  for (let i = 0; i < all.length; i += 2) {
    const pair = all.slice(i, i + 2).map((s) => {
      const on = subscribedSlugs.has(s.slug);
      const label =
        prefix === "unsub"
          ? `${on ? "🔕" : "•"} ${s.shortName}`
          : prefix === "sub"
            ? `${on ? "✅" : "➕"} ${s.shortName}`
            : `! ${s.shortName}`;
      return { text: label, callback_data: `${prefix}:${s.slug}` };
    });
    rows.push(pair);
  }
  return { inline_keyboard: rows };
}

/* ------------------------------------------------------------------ */
/* user resolution                                                    */
/* ------------------------------------------------------------------ */

type LinkedUser = {
  id: number;
  name: string;
  city: string;
  locale: Locale;
  telegramId: string | null;
  telegramHandle: string | null;
};

async function resolveUser(chatId: string | number): Promise<LinkedUser | null> {
  const rows = await db
    .select()
    .from(users)
    .where(eq(users.telegramId, String(chatId)))
    .limit(1);
  const u = rows[0];
  if (!u) return null;
  return {
    id: u.id,
    name: u.name,
    city: u.city,
    locale: botLocale(u.locale),
    telegramId: u.telegramId,
    telegramHandle: u.telegramHandle,
  };
}

/* ------------------------------------------------------------------ */
/* update router                                                      */
/* ------------------------------------------------------------------ */

export async function handleTelegramUpdate(update: Record<string, any>) {
  if (update.callback_query) {
    await handleCallback(update.callback_query);
    return;
  }
  const msg = update.message ?? update.edited_message;
  const chatId = msg?.chat?.id;
  if (chatId == null) return;
  const text = String(msg?.text ?? "").trim();
  if (!text) return;
  await handleCommand(chatId, text, msg.from ?? {});
}

async function handleCommand(
  chatId: number,
  raw: string,
  from: Record<string, any>,
) {
  const user = await resolveUser(chatId);
  const locale = user?.locale ?? "en";
  const t = (key: string, vars?: Record<string, string | number>) =>
    botT(locale, key, vars);

  /* ---------------- /start [token] : link account ---------------- */
  const start = raw.match(/^\/start(?:@\w+)?(?:\s+(\S+))?/);
  if (start) {
    const userId = decodeTelegramLinkToken(start[1]);
    if (userId) {
      const [target] = await db
        .select({ id: users.id, handle: users.telegramHandle })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);
      if (!target) {
        await sendMessage(chatId, t("bot.notLinked"));
        return;
      }

      // Ownership check: the Telegram account pressing START must own the
      // @username this website account was registered with.
      const tgName =
        typeof from.username === "string" ? from.username.toLowerCase() : "";
      if (!tgName) {
        await sendMessage(chatId, t("bot.needUsername"));
        return;
      }
      if (target.handle && target.handle !== tgName) {
        await sendMessage(
          chatId,
          t("bot.handleMismatch", { got: tgName, want: target.handle }),
        );
        return;
      }

      const chat = String(chatId);
      try {
        // one Telegram chat <-> one account: free this chat from any other
        // account first, then bind it (unique indexes enforce the same rule).
        await db.transaction(async (tx) => {
          await tx
            .update(users)
            .set({ telegramId: null })
            .where(and(eq(users.telegramId, chat), ne(users.id, userId)));
          await tx
            .update(users)
            .set({ telegramId: chat, telegramHandle: tgName })
            .where(eq(users.id, userId));
        });
      } catch (err) {
        if (isUniqueViolation(err)) {
          await sendMessage(chatId, t("bot.handleTaken", { got: tgName }));
          return;
        }
        throw err;
      }
      await sendMessage(
        chatId,
        t("bot.linked", { h: from.username ? ` as @${from.username}` : "" }),
        await serviceKeyboard("sub"),
      );
    } else {
      await sendMessage(chatId, t("bot.notLinked"));
    }
    return;
  }

  /* ---------------- everything else needs a linked account ---------------- */
  if (!user) {
    await sendMessage(chatId, t("bot.notLinked"));
    return;
  }

  const [cmd, ...rest] = raw.replace(/^\//, "").split(/\s+/);
  const arg = rest.join(" ").trim();

  switch (cmd.split("@")[0].toLowerCase()) {
    /* ---------------- /status ---------------- */
    case "status":
    case "board": {
      const snap = await getBoardSnapshot({ force: true });
      const bad = snap.entries.filter((e) => e.aspect !== "up");
      const lines = bad.length
        ? bad
            .map((e) => {
              const icon = e.aspect === "down" ? "🔴" : "🟠";
              const extra = [
                t("bot.uptime", { u: e.uptime24, p: e.p50 }),
                e.reportCount ? t("bot.crowd", { n: e.reportCount }) : null,
              ]
                .filter(Boolean)
                .join(" · ");
              return `${icon} ${e.service.shortName} — ${e.aspect.toUpperCase()}\n    ${extra}`;
            })
            .join("\n")
        : t("bot.allClear", { total: snap.entries.length });
      await sendMessage(
        chatId,
        `${t("bot.statusTitle", { up: snap.totals.up, total: snap.entries.length })}\n\n${lines}`,
      );
      return;
    }

    /* ---------------- /help ---------------- */
    case "help":
    case "commands":
      await sendMessage(chatId, t("bot.help"));
      return;

    /* ---------------- /subscribe ---------------- */
    case "subscribe":
    case "sub":
    case "follow": {
      if (!arg) {
        const subs = await listUserSubscriptions(user.id);
        const on = new Set(subs.map((s) => s.service.slug));
        await sendMessage(chatId, t("bot.pickService"), await serviceKeyboard("sub", on));
        return;
      }
      const service = await matchService(arg);
      if (!service) {
        await sendMessage(chatId, t("bot.unknownService", { q: arg }));
        return;
      }
      const before = await listUserSubscriptions(user.id);
      const res = await setSubscription({ userId: user.id, serviceId: service.id });
      const wasSubscribed = before.some((s) => s.service.id === service.id);
      if (wasSubscribed && !res.created) {
        await sendMessage(chatId, t("bot.alreadySub", { s: service.shortName }));
        return;
      }
      await sendMessage(chatId, t("bot.subAdded", { s: service.shortName }));
      return;
    }

    /* ---------------- /unsubscribe ---------------- */
    case "unsubscribe":
    case "unsub":
    case "unfollow": {
      if (!arg) {
        const subs = await listUserSubscriptions(user.id);
        const on = new Set(subs.map((s) => s.service.slug));
        if (!on.size) {
          await sendMessage(chatId, t("bot.noSubs"));
          return;
        }
        await sendMessage(
          chatId,
          t("bot.pickUnsub"),
          await serviceKeyboard("unsub", on),
        );
        return;
      }
      if (["all", "everything", "sab"].includes(norm(arg))) {
        const subs = await listUserSubscriptions(user.id);
        for (const s of subs)
          await removeSubscription({ userId: user.id, serviceId: s.service.id });
        await sendMessage(chatId, t("bot.subRemoved", { s: `${subs.length}` }));
        return;
      }
      const service = await matchService(arg);
      if (!service) {
        await sendMessage(chatId, t("bot.unknownService", { q: arg }));
        return;
      }
      const res = await removeSubscription({ userId: user.id, serviceId: service.id });
      await sendMessage(
        chatId,
        res.removed
          ? t("bot.subRemoved", { s: service.shortName })
          : t("bot.notSubscribed", { s: service.shortName }),
      );
      return;
    }

    /* ---------------- /mysubs ---------------- */
    case "mysubs":
    case "subscriptions": {
      const subs = await listUserSubscriptions(user.id);
      if (!subs.length) {
        await sendMessage(chatId, t("bot.noSubs"), await serviceKeyboard("sub"));
        return;
      }
      const list = subs
        .map(
          (s) =>
            `• ${s.service.shortName} — ${s.sub.minSeverity === "down" ? "down only" : "degraded+"}`,
        )
        .join("\n");
      await sendMessage(chatId, t("bot.subsList", { list }));
      return;
    }

    /* ---------------- /report ---------------- */
    case "report":
    case "failing": {
      if (!arg) {
        await sendMessage(chatId, t("bot.pickReport"), await serviceKeyboard("rep"));
        return;
      }
      const [first, ...noteParts] = arg.split(/\s+/);
      const service = await matchService(first);
      if (!service) {
        await sendMessage(chatId, t("bot.unknownService", { q: first }));
        return;
      }
      const note = noteParts.join(" ").trim();
      const res = await createCrowdReport({
        userId: user.id,
        serviceId: service.id,
        city: user.city,
        note,
      });
      if (!res.ok && res.reason === "duplicate") {
        await sendMessage(chatId, t("bot.duplicateReport", { s: service.shortName }));
        return;
      }
      if (!res.ok) {
        await sendMessage(chatId, t("bot.unknownService", { q: first }));
        return;
      }
      await sendMessage(
        chatId,
        t("bot.reportThanks", {
          s: service.shortName,
          n: note ? ` “${note}”` : "",
        }),
      );
      return;
    }

    /* ---------------- /stop ---------------- */
    case "stop":
    case "disconnect":
      await db.update(users).set({ telegramId: null }).where(eq(users.id, user.id));
      await sendMessage(chatId, t("bot.notLinked"));
      return;

    default:
      await sendMessage(chatId, t("bot.help"));
  }
}

/* ------------------------------------------------------------------ */
/* inline keyboard callbacks                                          */
/* ------------------------------------------------------------------ */

async function handleCallback(query: Record<string, any>) {
  const id = String(query.id ?? "");
  const data = String(query.data ?? "");
  const msg = query.message;
  const chatId = msg?.chat?.id;
  const messageId = msg?.message_id;
  if (chatId == null || !id) return;

  const [action, payload] = data.split(":");
  const user = await resolveUser(chatId);
  const locale = user?.locale ?? "en";
  const t = (key: string, vars?: Record<string, string | number>) =>
    botT(locale, key, vars);

  if (action === "noop") {
    await answerCallback(id);
    return;
  }

  if (action === "pick") {
    const subs = user ? await listUserSubscriptions(user.id) : [];
    const on = new Set(subs.map((s) => s.service.slug));
    const keyboard = await serviceKeyboard(
      payload === "unsub" ? "unsub" : payload === "rep" ? "rep" : "sub",
      on,
    );
    await answerCallback(id);
    if (messageId) await editMessage(chatId, messageId, t(`bot.pick${labelSuffix(payload)}`), keyboard);
    return;
  }

  if (!user) {
    await answerCallback(id, t("bot.notLinked"));
    return;
  }

  const service = await matchService(payload);
  if (!service) {
    await answerCallback(id, "Unknown service");
    return;
  }

  if (action === "sub") {
    const res = await setSubscription({ userId: user.id, serviceId: service.id });
    await answerCallback(id, res.created ? t("bot.subAdded", { s: service.shortName }) : t("bot.alreadySub", { s: service.shortName }));
    const subs = await listUserSubscriptions(user.id);
    if (messageId)
      await editMessage(
        chatId,
        messageId,
        t("bot.chooseAction"),
        await serviceKeyboard("sub", new Set(subs.map((s) => s.service.slug))),
      );
    return;
  }

  if (action === "unsub") {
    const res = await removeSubscription({ userId: user.id, serviceId: service.id });
    await answerCallback(id, res.removed ? t("bot.subRemoved", { s: service.shortName }) : t("bot.notSubscribed", { s: service.shortName }));
    const subs = await listUserSubscriptions(user.id);
    if (messageId) {
      if (!subs.length) {
        await editMessage(chatId, messageId, t("bot.noSubs"));
      } else {
        await editMessage(
          chatId,
          messageId,
          t("bot.pickUnsub"),
          await serviceKeyboard("unsub", new Set(subs.map((s) => s.service.slug))),
        );
      }
    }
    return;
  }

  if (action === "rep") {
    const res = await createCrowdReport({
      userId: user.id,
      serviceId: service.id,
      city: user.city,
      note: "",
    });
    await answerCallback(
      id,
      res.ok
        ? t("bot.reportThanks", { s: service.shortName, n: "" })
        : t("bot.duplicateReport", { s: service.shortName }),
    );
    if (messageId) await editMessage(chatId, messageId, t("bot.chooseAction"), await serviceKeyboard("rep"));
    return;
  }

  await answerCallback(id);
}

function labelSuffix(payload: string | undefined): string {
  if (payload === "unsub") return "Unsub";
  if (payload === "rep") return "Report";
  return "Service";
}
