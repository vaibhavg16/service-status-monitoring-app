import { NextResponse } from "next/server";
import { requireUser, readJson } from "@/lib/guard";
import { confirmVerificationCode, requestVerificationCode } from "@/lib/verification";
import { sendVerificationEmail } from "@/lib/email";
import { notifyTelegramIfLinked } from "@/lib/telegram-bot";

/**
 * Email ownership verification.
 *
 *   POST { action: "request-email" }
 *   POST { action: "confirm-email", code }
 *
 * (Phone/WhatsApp OTP verification was removed — the WhatsApp Cloud API
 * sandbox account it depended on was locked by Meta and isn't reliable for
 * this app. Verification is now email + Telegram only; see
 * SETUP.md section-9)
 *
 * Mirrors the single-route/action-switch style already used by
 * src/app/api/auth/route.ts and src/app/api/telegram/link/route.ts.
 */
export async function POST(req: Request) {
  const guard = await requireUser();
  if (guard.error) return guard.error;
  const user = guard.user;

  const body = await readJson(req);
  const action = String(body.action ?? "");

  if (action === "request-email") {
    const result = await requestVerificationCode(user.id, "email", user.email);
    if (!result.ok) return cooldownOrTargetError(result);
    const sent = await sendVerificationEmail(result.target, result.code);
    if (!sent.ok)
      return NextResponse.json(
        { error: sent.detail ?? "Could not send the email" },
        { status: 502 },
      );
    return NextResponse.json({
      ok: true,
      target: maskEmail(result.target),
      delivered: !sent.detail?.startsWith("logged locally"),
    });
  }

  if (action === "confirm-email") {
    const code = String(body.code ?? "").trim();
    if (!code) return NextResponse.json({ error: "Enter the code" }, { status: 400 });
    const result = await confirmVerificationCode(user.id, "email", code);
    if (!result.ok) return codeErrorResponse(result.reason);
    await notifyTelegramIfLinked(user.id, "bot.emailVerified", { e: user.email });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}

function cooldownOrTargetError(result: { reason: "cooldown" | "no-target"; retryInMs?: number }) {
  if (result.reason === "no-target")
    return NextResponse.json({ error: "Nothing to verify yet" }, { status: 400 });
  const secs = Math.ceil((result.retryInMs ?? 0) / 1000);
  return NextResponse.json(
    { error: `Please wait ${secs}s before requesting another code` },
    { status: 429 },
  );
}

function codeErrorResponse(
  reason: "no-code" | "expired" | "too-many-attempts" | "wrong-code",
) {
  const messages: Record<typeof reason, string> = {
    "no-code": "Request a code first",
    expired: "That code expired — request a new one",
    "too-many-attempts": "Too many wrong attempts — request a new code",
    "wrong-code": "That code is incorrect",
  };
  return NextResponse.json({ error: messages[reason] }, { status: 400 });
}

function maskEmail(email: string): string {
  const [name, domain] = email.split("@");
  if (!domain) return email;
  const visible = name.slice(0, 2);
  return `${visible}${"*".repeat(Math.max(name.length - 2, 1))}@${domain}`;
}
