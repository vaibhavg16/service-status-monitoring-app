import { NextResponse } from "next/server";
import { createHash, createHmac, timingSafeEqual } from "crypto";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import {
  clearSession,
  hashPassword,
  setSession,
  verifyPassword,
} from "@/lib/auth";
import { isLocale } from "@/lib/i18n";
import { isUniqueViolation, normalizeTelegramHandle } from "@/lib/telegram-handle";

export async function POST(req: Request) {
  let body: Record<string, any>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const action = body.action as string;

  if (action === "logout") {
    await clearSession();
    return NextResponse.json({ ok: true });
  }

  if (action === "login") {
    const email = String(body.email ?? "").trim().toLowerCase();
    const password = String(body.password ?? "");
    if (!email || !password)
      return NextResponse.json({ error: "Email and password required" }, { status: 400 });
    const rows = await db.select().from(users).where(eq(users.email, email)).limit(1);
    const user = rows[0];
    if (!user || !verifyPassword(password, user.passwordHash))
      return NextResponse.json({ error: "Wrong email or password" }, { status: 401 });
    await setSession(user.id);
    return NextResponse.json({
      user: { id: user.id, name: user.name, role: user.role, email: user.email },
    });
  }

  if (action === "register") {
    const email = String(body.email ?? "").trim().toLowerCase();
    const password = String(body.password ?? "");
    const name = String(body.name ?? "").trim() || "New user";
    const city = String(body.city ?? "Pune").trim();
    if (!email || password.length < 6)
      return NextResponse.json(
        { error: "A valid email and a 6+ character password are needed" },
        { status: 400 },
      );
    const telegramHandle = normalizeTelegramHandle(body.telegramHandle);
    if (!telegramHandle)
      return NextResponse.json(
        {
          error:
            "Enter your Telegram username (5-32 letters, digits or _), e.g. vaibhav_godse",
        },
        { status: 400 },
      );
    const existing = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, email))
      .limit(1);
    if (existing.length)
      return NextResponse.json({ error: "That email is already registered" }, { status: 409 });
    const handleTaken = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.telegramHandle, telegramHandle))
      .limit(1);
    if (handleTaken.length)
      return NextResponse.json(
        { error: "That Telegram username is already registered to another account" },
        { status: 409 },
      );
    let user: typeof users.$inferSelect;
    try {
      [user] = await db
        .insert(users)
        .values({
          email,
          name,
          city,
          passwordHash: hashPassword(password),
          role: "merchant",
          telegramHandle,
        })
        .returning();
    } catch (err) {
      if (isUniqueViolation(err))
        return NextResponse.json(
          { error: "That email or Telegram username is already registered" },
          { status: 409 },
        );
      throw err;
    }
    await setSession(user.id);
    return NextResponse.json({
      user: { id: user.id, name: user.name, role: user.role, email: user.email },
    });
  }

  if (action === "telegram") {
    const payload = body.payload ?? {};
    const ok = verifyTelegramPayload(payload);
    if (!ok)
      return NextResponse.json(
        { error: "Telegram signature could not be verified" },
        { status: 401 },
      );
    const handle = String(payload.username ?? `tg_${payload.id}`).toLowerCase();
    const rows = await db
      .select()
      .from(users)
      .where(eq(users.telegramId, String(payload.id)))
      .limit(1);
    let user = rows[0];
    if (!user) {
      const byHandle = await db
        .select()
        .from(users)
        .where(eq(users.email, `${handle}@telegram.isitdown.in`))
        .limit(1);
      user = byHandle[0];
    }
    if (!user) {
      const [created] = await db
        .insert(users)
        .values({
          email: `${handle}@telegram.isitdown.in`,
          name: String(payload.first_name ?? handle),
          city: "Pune",
          passwordHash: hashPassword(`tg-${payload.id}-${Date.now()}`),
          role: "merchant",
          telegramId: String(payload.id),
          telegramHandle: handle,
        })
        .returning();
      user = created;
    } else if (!user.telegramId) {
      const [updated] = await db
        .update(users)
        .set({ telegramId: String(payload.id), telegramHandle: handle })
        .where(eq(users.id, user.id))
        .returning();
      user = updated;
    }
    await setSession(user.id);
    return NextResponse.json({
      user: { id: user.id, name: user.name, role: user.role, email: user.email },
    });
  }

  if (action === "update") {
    const { getSessionUser } = await import("@/lib/auth");
    const current = await getSessionUser();
    if (!current)
      return NextResponse.json({ error: "Not signed in" }, { status: 401 });
    const patch: Record<string, unknown> = {};
    if (typeof body.name === "string" && body.name.trim()) patch.name = body.name.trim();
    if (typeof body.city === "string" && body.city.trim()) patch.city = body.city.trim();
    if (isLocale(body.locale)) patch.locale = body.locale;
    if (typeof body.telegramHandle === "string" && body.telegramHandle.trim()) {
      const handle = normalizeTelegramHandle(body.telegramHandle);
      if (!handle)
        return NextResponse.json(
          { error: "Telegram username must be 5-32 letters, digits or _" },
          { status: 400 },
        );
      if (handle !== current.telegramHandle) {
        // a different handle has to be verified again: drop the old chat link
        patch.telegramHandle = handle;
        patch.telegramId = null;
      }
    }
    let updated: typeof users.$inferSelect;
    try {
      [updated] = await db
        .update(users)
        .set(patch)
        .where(eq(users.id, current.id))
        .returning();
    } catch (err) {
      if (isUniqueViolation(err))
        return NextResponse.json(
          { error: "That Telegram username is already registered to another account" },
          { status: 409 },
        );
      throw err;
    }
    return NextResponse.json({
      user: { id: updated.id, name: updated.name, role: updated.role, locale: updated.locale },
    });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}

/**
 * Telegram Login Widget signature check.
 * secret = SHA256(<bot_token>) ; check_hash = HMAC_SHA256(key=secret, data=check_string)
 * Without a bot token configured (local demo) we accept the payload so the
 * optional Telegram path is still exercisable.
 */
function verifyTelegramPayload(payload: Record<string, unknown>): boolean {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token || token === "demo") return Boolean(payload?.id);
  try {
    const dataCheckString = Object.keys(payload)
      .filter((k) => k !== "hash")
      .sort()
      .map((k) => `${k}=${String(payload[k])}`)
      .join("\n");
    const secret = createHmac("sha256", token).update(token).digest();
    const hash = createHmac("sha256", secret)
      .update(dataCheckString)
      .digest("hex");
    const a = Buffer.from(hash, "hex");
    const b = Buffer.from(String(payload.hash ?? ""), "hex");
    return a.length === b.length && timingSafeEqual(a, b);
  } catch {
    return false;
  }
}
