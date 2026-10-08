import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";

export const dynamic = "force-dynamic";

/** Sends a real message to the signed-in user's linked chat. */
export async function POST() {
  const { getSessionUser } = await import("@/lib/auth");
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Sign in first" }, { status: 401 });

  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token)
    return NextResponse.json(
      { error: "TELEGRAM_BOT_TOKEN is not set on the server" },
      { status: 503 },
    );

  const [row] = await db.select().from(users).where(eq(users.id, user.id)).limit(1);
  if (!row?.telegramId)
    return NextResponse.json(
      { error: "Telegram is not connected yet — use Connect Telegram first" },
      { status: 409 },
    );

  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      chat_id: row.telegramId,
      text:
        "✅ Test alert from Is It Down, India?\n\n" +
        "If you can read this, live alerts will reach you the moment a service you " +
        "subscribe to turns amber or red.\n\n" +
        "Send /status for the live board.",
      disable_web_page_preview: true,
    }),
  });
  const data = await res.json();
  if (!data.ok)
    return NextResponse.json(
      { error: data.description ?? "Telegram rejected the message" },
      { status: 502 },
    );
  return NextResponse.json({ ok: true, chatId: row.telegramId });
}
