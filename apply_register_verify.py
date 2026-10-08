#!/usr/bin/env python3
"""
Registration with a Telegram username + ownership verification.

Run from the project root:   python3 apply_register_verify.py

What it does
  * register form + API: Telegram username is required, validated, unique
  * Settings: shows "Verified" only after the bot confirmed ownership;
    changing the handle unlinks the chat until it is verified again
  * bot /start: the Telegram account pressing START must own the @username
    the website account was registered with, otherwise the link is refused
  * Disconnect keeps the registered handle (only the chat is unlinked)
  * DB: unique index on users.telegram_handle (handles stored lowercase)

Needs the two earlier patches (Telegram-safe link token + one chat per account).
Safe to run twice. Every changed file is backed up as <file>.pre-verify.bak
"""
import pathlib
import shutil
import sys

ROOT = pathlib.Path.cwd()
failed = False


def edit(rel, old, new, marker):
    global failed
    p = ROOT / rel
    if not p.exists():
        print(f"  !! {rel}: file not found (run this from the project root)")
        failed = True
        return
    s = p.read_text()
    if marker in s:
        print(f"  = {rel}: already patched ({marker[:30]}...)")
        return
    if s.count(old) != 1:
        print(f"  !! {rel}: anchor not found exactly once ({s.count(old)}x): {old[:60]!r}")
        failed = True
        return
    bak = p.with_name(p.name + ".pre-verify.bak")
    if not bak.exists():
        shutil.copy(p, bak)
    p.write_text(s.replace(old, new))
    print(f"  + {rel}: patched")


# --------------------------------------------------------------------------
# 1. new helper module
# --------------------------------------------------------------------------
helper = ROOT / "src/lib/telegram-handle.ts"
if helper.exists():
    print("  = src/lib/telegram-handle.ts: already exists")
else:
    helper.write_text('''/**
 * Telegram usernames: 5-32 characters, a-z 0-9 and underscore, must start
 * with a letter, case-insensitive. We always store them lowercase so the
 * unique index and the ownership check compare like with like.
 */
const HANDLE_RE = /^[a-z][a-z0-9_]{4,31}$/;

export function normalizeTelegramHandle(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const h = input
    .trim()
    .replace(/^https?:\\/\\/(t\\.me|telegram\\.me)\\//i, "")
    .replace(/^@/, "")
    .toLowerCase();
  return HANDLE_RE.test(h) ? h : null;
}

/** Postgres unique_violation (drizzle wraps the driver error in `cause`). */
export function isUniqueViolation(err: unknown): boolean {
  const e = err as { code?: string; cause?: { code?: string } } | null;
  return e?.code === "23505" || e?.cause?.code === "23505";
}
''')
    print("  + src/lib/telegram-handle.ts: created")

# --------------------------------------------------------------------------
# 2. schema: unique handle
# --------------------------------------------------------------------------
edit(
    "src/db/schema.ts",
    '    uniqueIndex("users_telegram_id_uq").on(t.telegramId),\n',
    '    uniqueIndex("users_telegram_id_uq").on(t.telegramId),\n'
    '    uniqueIndex("users_telegram_handle_uq").on(t.telegramHandle),\n',
    "users_telegram_handle_uq",
)

# --------------------------------------------------------------------------
# 3. auth API: register + update
# --------------------------------------------------------------------------
edit(
    "src/app/api/auth/route.ts",
    'import { isLocale } from "@/lib/i18n";\n',
    'import { isLocale } from "@/lib/i18n";\n'
    'import { isUniqueViolation, normalizeTelegramHandle } from "@/lib/telegram-handle";\n',
    "normalizeTelegramHandle }",
)

edit(
    "src/app/api/auth/route.ts",
    '''    const existing = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, email))
      .limit(1);
    if (existing.length)
      return NextResponse.json({ error: "That email is already registered" }, { status: 409 });
    const [user] = await db
      .insert(users)
      .values({
        email,
        name,
        city,
        passwordHash: hashPassword(password),
        role: "merchant",
      })
      .returning();
''',
    '''    const telegramHandle = normalizeTelegramHandle(body.telegramHandle);
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
''',
    "handleTaken",
)

edit(
    "src/app/api/auth/route.ts",
    '''    if (typeof body.telegramHandle === "string")
      patch.telegramHandle = body.telegramHandle.replace(/^@/, "").slice(0, 40);
    const [updated] = await db
      .update(users)
      .set(patch)
      .where(eq(users.id, current.id))
      .returning();
''',
    '''    if (typeof body.telegramHandle === "string" && body.telegramHandle.trim()) {
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
''',
    "drop the old chat link",
)

# --------------------------------------------------------------------------
# 4. Telegram bot: verify ownership on /start
# --------------------------------------------------------------------------
edit(
    "src/lib/telegram-bot.ts",
    'import { decodeTelegramLinkToken } from "@/lib/auth";\n',
    'import { decodeTelegramLinkToken } from "@/lib/auth";\n'
    'import { isUniqueViolation } from "@/lib/telegram-handle";\n',
    "isUniqueViolation }",
)

edit(
    "src/lib/telegram-bot.ts",
    '''      const [target] = await db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);
      if (!target) {
        await sendMessage(chatId, t("bot.notLinked"));
        return;
      }
      const chat = String(chatId);
      const patch: Record<string, unknown> = { telegramId: chat };
      if (from.username) patch.telegramHandle = from.username;
      // one Telegram chat <-> one account: free this chat from any other
      // account first, then bind it (unique index enforces the same rule).
      await db.transaction(async (tx) => {
        await tx
          .update(users)
          .set({ telegramId: null })
          .where(and(eq(users.telegramId, chat), ne(users.id, userId)));
        await tx.update(users).set(patch).where(eq(users.id, userId));
      });
''',
    '''      const [target] = await db
        .select({ id: users.id, handle: users.telegramHandle })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);
      if (!target) {
        await sendMessage(chatId, t("bot.notLinked"));
        return;
      }

      // Ownership check: the Telegram account pressing START must own the
      // @username this website account was registered with.
      const tgName =
        typeof from.username === "string" ? from.username.toLowerCase() : "";
      if (!tgName) {
        await sendMessage(chatId, t("bot.needUsername"));
        return;
      }
      if (target.handle && target.handle !== tgName) {
        await sendMessage(
          chatId,
          t("bot.handleMismatch", { got: tgName, want: target.handle }),
        );
        return;
      }

      const chat = String(chatId);
      try {
        // one Telegram chat <-> one account: free this chat from any other
        // account first, then bind it (unique indexes enforce the same rule).
        await db.transaction(async (tx) => {
          await tx
            .update(users)
            .set({ telegramId: null })
            .where(and(eq(users.telegramId, chat), ne(users.id, userId)));
          await tx
            .update(users)
            .set({ telegramId: chat, telegramHandle: tgName })
            .where(eq(users.id, userId));
        });
      } catch (err) {
        if (isUniqueViolation(err)) {
          await sendMessage(chatId, t("bot.handleTaken", { got: tgName }));
          return;
        }
        throw err;
      }
''',
    "bot.handleMismatch",
)

edit(
    "src/lib/bot-i18n.ts",
    '  "bot.linked":\n    "Connected to Is It Down, India?{h}',
    '''  "bot.needUsername":
    "Your Telegram account has no @username. In Telegram open Settings, set a " +
    "Username, register it on the website, then press START again.",
  "bot.handleMismatch":
    "This Telegram account is @{got}, but the website account was registered " +
    "with @{want}. Open the Connect link from your own account, or correct the " +
    "username in Settings.",
  "bot.handleTaken":
    "@{got} is already registered to another account on the website.",
  "bot.linked":
    "Connected to Is It Down, India?{h}''',
    '"bot.handleMismatch"',
)

# --------------------------------------------------------------------------
# 5. Disconnect keeps the registered handle
# --------------------------------------------------------------------------
edit(
    "src/app/api/telegram/link/route.ts",
    ".set({ telegramId: null, telegramHandle: null })",
    ".set({ telegramId: null })",
    ".set({ telegramId: null })",
)

# --------------------------------------------------------------------------
# 6. Register form
# --------------------------------------------------------------------------
edit(
    "src/components/login-form.tsx",
    '    name: "",\n    city: "Pune",\n  });',
    '    name: "",\n    city: "Pune",\n    telegramHandle: "",\n  });',
    'telegramHandle: "",',
)

edit(
    "src/components/login-form.tsx",
    '''        )}
        <label className="block">
          <span className="micro mb-1 block">{t("auth.email")}</span>''',
    '''        )}
        {mode === "register" && (
          <label className="block">
            <span className="micro mb-1 block">Telegram username</span>
            <input
              required
              className={field}
              value={form.telegramHandle}
              onChange={(e) => setForm({ ...form, telegramHandle: e.target.value })}
              placeholder="@vaibhav_godse"
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
            />
            <span className="mt-1 block text-[11px] leading-relaxed text-ink-3">
              You verify it by pressing START in our bot right after sign-up.
            </span>
          </label>
        )}
        <label className="block">
          <span className="micro mb-1 block">{t("auth.email")}</span>''',
    'form.telegramHandle',
)

edit(
    "src/components/login-form.tsx",
    '"Account created",',
    '"Account created. Now verify your Telegram.",',
    "Now verify your Telegram",
)

edit(
    "src/components/login-form.tsx",
    'router.push(data.user.role === "admin" ? "/services" : next);',
    'router.push(\n        mode === "register" ? "/settings" : data.user.role === "admin" ? "/services" : next,\n      );',
    'mode === "register" ? "/settings"',
)

# --------------------------------------------------------------------------
# 7. Settings page
# --------------------------------------------------------------------------
edit(
    "src/components/settings-view.tsx",
    '''                {user.telegramId
                  ? `Linked · chat ${user.telegramId}`
                  : user.telegramHandle
                    ? t("settings.telegramConnected", { h: user.telegramHandle })
                    : t("settings.telegramNot")}''',
    '''                {user.telegramId
                  ? `Verified · @${user.telegramHandle ?? "?"} · chat ${user.telegramId}`
                  : user.telegramHandle
                    ? `@${user.telegramHandle} · not verified yet`
                    : t("settings.telegramNot")}''',
    "not verified yet",
)

edit(
    "src/components/settings-view.tsx",
    '"Press Connect, then START in the Telegram chat. Telegram will not let a bot message a chat that has never opened it."',
    '(user.telegramHandle\n                  ? `Press Connect, then START in the chat. Only the Telegram account @${user.telegramHandle} can verify this website account.`\n                  : "Press Connect, then START in the Telegram chat.")',
    "can verify this website account",
)

edit(
    "src/components/settings-view.tsx",
    '''                onChange={(e) => setForm({ ...form, telegramHandle: e.target.value })} />
            </label>''',
    '''                onChange={(e) => setForm({ ...form, telegramHandle: e.target.value })} />
              <span className="mt-1 block text-[11px] text-ink-3">
                Changing it unlinks your chat until you verify the new one.
              </span>
            </label>''',
    "Changing it unlinks your chat",
)

print()
if failed:
    print("Some edits did NOT apply (see !! lines). Nothing is half-broken: each")
    print("edit is independent and backed up. Send me the !! lines.")
    sys.exit(1)
print("All edits applied.")
