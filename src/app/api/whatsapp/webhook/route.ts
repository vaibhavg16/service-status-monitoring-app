import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { decodeTelegramLinkToken } from "@/lib/auth";

export const dynamic = "force-dynamic";

/**
 * Meta WhatsApp Cloud API webhook.
 *
 * GET  — one-time verification handshake (Meta hits it with hub.challenge)
 * POST — inbound messages; mirrors the Telegram /start flow so a user can bind
 *        their WhatsApp number by messaging the business number.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const mode = url.searchParams.get("hub.mode");
  const verifyToken = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");
  if (mode === "subscribe" && verifyToken === process.env.WHATSAPP_VERIFY_TOKEN) {
    return new NextResponse(challenge ?? "", {
      headers: { "content-type": "text/plain" },
    });
  }
  return NextResponse.json({ error: "Verification failed" }, { status: 403 });
}

export async function POST(req: Request) {
  let body: Record<string, any>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: true });
  }

  const value = body?.entry?.[0]?.changes?.[0]?.value;
  const messages = value?.messages ?? [];
  const contacts = value?.contacts ?? [];

  for (const message of messages) {
    if (message.type !== "text") continue;
    const from: string = message.from ?? "";
    const text: string = message.text?.body ?? "";
    const token = text.trim().split(/\s+/)[1];

    const userId = decodeTelegramLinkToken(token);
    if (userId) {
      const [existing] = await db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);
      if (existing) {
        await db.update(users).set({ phone: from }).where(eq(users.id, userId));
        void contacts;
        return NextResponse.json({ ok: true });
      }
    }
  }
  return NextResponse.json({ ok: true });
}
