import { NextResponse } from "next/server";
import { getSessionUser, LOCALE_COOKIE } from "@/lib/auth";
import { isLocale } from "@/lib/i18n";

export async function POST(req: Request) {
  let locale: unknown;
  try {
    locale = (await req.json()).locale;
  } catch {
    /* ignore */
  }
  if (!isLocale(locale))
    return NextResponse.json({ error: "Unsupported locale" }, { status: 400 });

  const user = await getSessionUser();
  if (user) {
    const { db } = await import("@/db");
    const { users } = await import("@/db/schema");
    const { eq } = await import("drizzle-orm");
    await db.update(users).set({ locale }).where(eq(users.id, user.id));
  }

  const res = NextResponse.json({ ok: true, locale });
  res.cookies.set(LOCALE_COOKIE, locale, {
    path: "/",
    maxAge: 31536000,
    sameSite: "lax",
  });
  return res;
}
