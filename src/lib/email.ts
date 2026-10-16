/**
 * Minimal email sender for verification codes.
 *
 * Uses Resend's plain HTTP API (no SDK dependency, same `fetch`-based style
 * as src/lib/alerts.ts and src/lib/telegram-bot.ts). Without RESEND_API_KEY
 * configured it logs the code to the server console instead of failing, so
 * registration/verification is testable locally without an email provider.
 */

import { realEnv } from "@/lib/env";

const RESEND_API = "https://api.resend.com/emails";

type Delivery = { ok: boolean; detail?: string };

export async function sendVerificationEmail(
  to: string,
  code: string,
): Promise<Delivery> {
  const apiKey = realEnv("RESEND_API_KEY");
  const from = process.env.EMAIL_FROM || "Is It Down India <onboarding@resend.dev>";

  if (!apiKey) {
    console.log(`[email] (RESEND_API_KEY not set) verification code for ${to}: ${code}`);
    return { ok: true, detail: "logged locally · RESEND_API_KEY not set" };
  }

  try {
    const res = await fetch(RESEND_API, {
      method: "POST",
      headers: {
        authorization: `Bearer ${apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        from,
        to,
        subject: "Your verification code",
        text: `Your Is It Down, India? verification code is ${code}.\nIt expires in 10 minutes. If you didn't request this, ignore this email.`,
      }),
      signal: AbortSignal.timeout(8000),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok) return { ok: true };
    return { ok: false, detail: data?.message ?? `Resend HTTP ${res.status}` };
  } catch (err) {
    return { ok: false, detail: err instanceof Error ? err.message : "network error" };
  }
}
