import { createHmac, randomInt, timingSafeEqual } from "crypto";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { users, verificationCodes } from "@/db/schema";

const CODE_TTL_MIN = 10;
const RESEND_COOLDOWN_MS = 45_000; // avoid someone spamming "send code"
const MAX_ATTEMPTS = 5; // wrong-code guesses allowed per sent code

function secret(): string {
  return process.env.AUTH_SECRET || "dev-only-insecure-secret-change-me";
}

function hashCode(userId: number, channel: string, code: string): string {
  return createHmac("sha256", secret())
    .update(`verify.${channel}.${userId}.${code}`)
    .digest("hex");
}

function generateCode(): string {
  // 6-digit numeric, zero-padded — the standard OTP shape for both
  // email clients and SMS/WhatsApp templates.
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

export type RequestCodeResult =
  | { ok: true; code: string; target: string }
  | { ok: false; reason: "cooldown" | "no-target"; retryInMs?: number };

/**
 * Creates and stores a fresh verification code for the given user/channel.
 * The caller is responsible for actually delivering `code` (email / WhatsApp)
 * — this function only handles generation, hashing, storage and rate limiting.
 */
export async function requestVerificationCode(
  userId: number,
  channel: "email" | "phone",
  target: string | null | undefined,
): Promise<RequestCodeResult> {
  const cleanTarget = (target ?? "").trim();
  if (!cleanTarget) return { ok: false, reason: "no-target" };

  const [last] = await db
    .select()
    .from(verificationCodes)
    .where(
      and(
        eq(verificationCodes.userId, userId),
        eq(verificationCodes.channel, channel),
      ),
    )
    .orderBy(desc(verificationCodes.createdAt))
    .limit(1);

  if (last) {
    const elapsed = Date.now() - last.createdAt.getTime();
    if (elapsed < RESEND_COOLDOWN_MS) {
      return { ok: false, reason: "cooldown", retryInMs: RESEND_COOLDOWN_MS - elapsed };
    }
  }

  const code = generateCode();
  const expiresAt = new Date(Date.now() + CODE_TTL_MIN * 60_000);
  await db.insert(verificationCodes).values({
    userId,
    channel,
    target: cleanTarget,
    codeHash: hashCode(userId, channel, code),
    expiresAt,
  });

  return { ok: true, code, target: cleanTarget };
}

export type ConfirmCodeResult =
  | { ok: true }
  | { ok: false; reason: "no-code" | "expired" | "too-many-attempts" | "wrong-code" };

/**
 * Verifies a user-submitted code against the most recent unconsumed code for
 * that user/channel, then flips the matching `*Verified` flag on `users`.
 */
export async function confirmVerificationCode(
  userId: number,
  channel: "email" | "phone",
  submitted: string,
): Promise<ConfirmCodeResult> {
  const [row] = await db
    .select()
    .from(verificationCodes)
    .where(
      and(
        eq(verificationCodes.userId, userId),
        eq(verificationCodes.channel, channel),
      ),
    )
    .orderBy(desc(verificationCodes.createdAt))
    .limit(1);

  if (!row || row.consumedAt) return { ok: false, reason: "no-code" };
  if (row.expiresAt.getTime() < Date.now()) return { ok: false, reason: "expired" };
  if (row.attempts >= MAX_ATTEMPTS) return { ok: false, reason: "too-many-attempts" };

  const expected = Buffer.from(row.codeHash, "hex");
  const actual = Buffer.from(hashCode(userId, channel, submitted.trim()), "hex");
  const match =
    expected.length === actual.length && timingSafeEqual(expected, actual);

  if (!match) {
    await db
      .update(verificationCodes)
      .set({ attempts: row.attempts + 1 })
      .where(eq(verificationCodes.id, row.id));
    return { ok: false, reason: "wrong-code" };
  }

  await db
    .update(verificationCodes)
    .set({ consumedAt: new Date() })
    .where(eq(verificationCodes.id, row.id));

  await db
    .update(users)
    .set(channel === "email" ? { emailVerified: true } : { phoneVerified: true })
    .where(eq(users.id, userId));

  return { ok: true };
}
