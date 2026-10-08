import { NextResponse } from "next/server";
import { handleTelegramUpdate } from "@/lib/telegram-bot";

export const dynamic = "force-dynamic";

/**
 * Telegram Bot API webhook.
 *
 * Set it once after deploy:
 *   curl "https://api.telegram.org/bot$TOKEN/setWebhook" \
 *     -d "url=https://YOURDOMAIN.com/api/telegram/webhook" \
 *     -d "secret_token=$TELEGRAM_WEBHOOK_SECRET" \
 *     -d 'allowed_updates=["message","callback_query"]'
 *
 * Handled here:
 *   /start <token>  bind this chat to a website account
 *   /status         live board summary
 *   /subscribe      service picker (inline keyboard) or /subscribe irctc
 *   /unsubscribe   service picker or /unsubscribe irctc
 *   /mysubs         what this chat follows
 *   /report <svc>   file a crowd report
 *   /stop           disconnect this chat
 */
export async function POST(req: Request) {
  const expected = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (expected && req.headers.get("x-telegram-bot-api-secret-token") !== expected) {
    return NextResponse.json({ ok: false, reason: "bad secret" }, { status: 401 });
  }
  // No token? Still process the update — account linking, subscriptions and
  // reports all work against the database; only the outbound send is skipped.
  // This keeps the bot testable on localhost without a live bot.

  let update: Record<string, any>;
  try {
    update = await req.json();
  } catch {
    return NextResponse.json({ ok: true });
  }

  try {
    await handleTelegramUpdate(update);
  } catch (err) {
    // Never 5xx to Telegram or it will back off and retry aggressively.
    console.error("[telegram] handler failed", err);
  }
  return NextResponse.json({ ok: true });
}
