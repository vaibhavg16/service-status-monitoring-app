import { createHmac, randomBytes, scryptSync, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { isLocale, type Locale } from "@/lib/i18n";

const SESSION_COOKIE = "iid_session";
const SESSION_DAYS = 7;

export type SessionUser = {
  id: number;
  email: string;
  name: string;
  role: "merchant" | "admin";
  city: string;
  locale: Locale;
  telegramHandle: string | null;
  telegramId: string | null;
  phone: string | null;
  emailVerified: boolean;
  phoneVerified: boolean;
};

function secret(): string {
  return process.env.AUTH_SECRET || "dev-only-insecure-secret-change-me";
}

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const derived = scryptSync(password, salt, 64).toString("hex");
  return `s2$${salt}$${derived}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  try {
    const [scheme, salt, hash] = stored.split("$");
    if (scheme !== "s2" || !salt || !hash) return false;
    const derived = scryptSync(password, salt, 64);
    const expected = Buffer.from(hash, "hex");
    return expected.length === derived.length && timingSafeEqual(derived, expected);
  } catch {
    return false;
  }
}

function sign(payload: string): string {
  return createHmac("sha256", secret()).update(payload).digest("base64url");
}

/**
 * Stateless deep-link token used to bind a Telegram chat to a user account:
 * t.me/<bot>?start=<token>  →  webhook verifies and stores the chat_id.
 * Avoids a migration for one-shot tokens; expires in LINK_TTL_DAYS.
 *
 * IMPORTANT: Telegram's /start deep-link parameter may ONLY contain
 * A-Z, a-z, 0-9, underscore (_) and hyphen (-) — no dots — and is capped
 * at 64 characters (https://core.telegram.org/bots/features#deep-linking).
 * This token is built from fixed-width hex fields (no separators) plus a
 * truncated, base64url-encoded HMAC, giving a 39-character token that is
 * fully legal for Telegram and still cryptographically authenticated.
 */
const LINK_TTL_DAYS = 30;

function toHex(n: number, width: number): string {
  return n.toString(16).padStart(width, "0");
}

// Truncate the HMAC-SHA256 digest to 15 raw bytes (120 bits) before
// base64url-encoding. 120 bits of authentication is more than enough for a
// short-lived (30-day), low-value link token, and keeps the final encoded
// token short enough to stay well under Telegram's 64-character limit.
function signShort(payload: string): string {
  const full = createHmac("sha256", secret()).update(payload).digest();
  return full.subarray(0, 15).toString("base64url"); // 15 bytes -> 20 chars
}

export function encodeTelegramLinkToken(userId: number): string {
  const exp = Date.now() + LINK_TTL_DAYS * 86400_000;
  const idHex = toHex(userId, 8); // supports user IDs up to ~4.29 billion
  const expHex = toHex(exp, 11); // supports timestamps up to roughly year 2527
  const sig = signShort(`${idHex}.${expHex}`);
  return `${idHex}${expHex}${sig}`; // 8 + 11 + 20 = 39 chars, Telegram-legal
}

export function decodeTelegramLinkToken(token: string | undefined): number | null {
  if (!token || token.length !== 39) return null;
  const idHex = token.slice(0, 8);
  const expHex = token.slice(8, 19);
  const sig = token.slice(19);
  const expected = signShort(`${idHex}.${expHex}`);
  if (expected !== sig) return null;
  const exp = parseInt(expHex, 16);
  if (!Number.isFinite(exp) || exp < Date.now()) return null;
  const id = parseInt(idHex, 16);
  return Number.isFinite(id) ? id : null;
}

export function encodeSession(userId: number): string {
  const payload = `${userId}.${Date.now() + SESSION_DAYS * 86400_000}`;
  return `${payload}.${sign(payload)}`;
}

export function decodeSession(token: string | undefined): number | null {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [idRaw, expRaw, sig] = parts;
  const payload = `${idRaw}.${expRaw}`;
  if (sign(payload) !== sig) return null;
  if (Number(expRaw) < Date.now()) return null;
  const id = Number(idRaw);
  return Number.isFinite(id) ? id : null;
}

export async function getSessionUser(): Promise<SessionUser | null> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  const id = decodeSession(token);
  if (id === null) return null;
  const rows = await db.select().from(users).where(eq(users.id, id)).limit(1);
  const u = rows[0];
  if (!u) return null;
  return {
    id: u.id,
    email: u.email,
    name: u.name,
    role: u.role,
    city: u.city,
    locale: isLocale(u.locale) ? u.locale : "en",
    telegramHandle: u.telegramHandle,
    telegramId: u.telegramId,
    phone: u.phone,
    emailVerified: u.emailVerified,
    phoneVerified: u.phoneVerified,
  };
}

export async function setSession(userId: number): Promise<void> {
  const jar = await cookies();
  jar.set(SESSION_COOKIE, encodeSession(userId), {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_DAYS * 86400,
  });
}

export async function clearSession(): Promise<void> {
  const jar = await cookies();
  jar.delete(SESSION_COOKIE);
}

export const LOCALE_COOKIE = "iid_locale";

export async function readLocale(): Promise<Locale> {
  const jar = await cookies();
  const fromCookie = jar.get(LOCALE_COOKIE)?.value;
  if (isLocale(fromCookie)) return fromCookie;
  const user = await getSessionUser();
  if (user) return user.locale;
  return "en";
}

