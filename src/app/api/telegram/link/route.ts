import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { decodeTelegramLinkToken, encodeTelegramLinkToken } from "@/lib/auth";

export const dynamic = "force-dynamic";

/**
 * Deep link that binds the signed-in user's Telegram chat to their account.
 * The user must press "Start" once — Telegram forbids a bot messaging a chat
 * that has never opened a conversation with it.
 */
export async function GET() {
  const { getSessionUser } = await import("@/lib/auth");
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Sign in first" }, { status: 401 });

  const bot = process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME;
  if (!bot)
    return NextResponse.json(
      { error: "NEXT_PUBLIC_TELEGRAM_BOT_USERNAME is not configured" },
      { status: 503 },
    );

  const url = `https://t.me/${bot}?start=${encodeTelegramLinkToken(user.id)}`;
  return NextResponse.json({ url, bot, alreadyLinked: Boolean(user.telegramId) });
}

export async function DELETE() {
  const { getSessionUser } = await import("@/lib/auth");
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Sign in first" }, { status: 401 });
  await db
    .update(users)
    .set({ telegramId: null })
    .where(eq(users.id, user.id));
  return NextResponse.json({ ok: true });
}
