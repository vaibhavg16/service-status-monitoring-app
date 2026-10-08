#!/usr/bin/env python3
"""
One Telegram chat <-> one website account.

Run from the project root:   python3 apply_one_chat.py

  * schema: unique index users_telegram_id_uq on users.telegram_id
  * bot /start: moves the chat to the account that owns the link
    (clears it from any other account first, inside one transaction)

Safe to run twice. Changed files are backed up as <file>.pre-chat.bak
"""
import pathlib, shutil, sys

ROOT = pathlib.Path.cwd()
failed = False


def edit(rel, old, new, marker):
    global failed
    p = ROOT / rel
    if not p.exists():
        print(f"  !! {rel}: not found (run from the project root)"); failed = True; return
    s = p.read_text()
    if marker in s:
        print(f"  = {rel}: already patched"); return
    if s.count(old) != 1:
        print(f"  !! {rel}: anchor not found exactly once ({s.count(old)}x): {old[:60]!r}"); failed = True; return
    bak = p.with_name(p.name + ".pre-chat.bak")
    if not bak.exists():
        shutil.copy(p, bak)
    p.write_text(s.replace(old, new))
    print(f"  + {rel}: patched")


edit(
    "src/db/schema.ts",
    '  (t) => [index("users_role_idx").on(t.role)],',
    '''  (t) => [
    index("users_role_idx").on(t.role),
    uniqueIndex("users_telegram_id_uq").on(t.telegramId),
  ],''',
    "users_telegram_id_uq",
)

edit(
    "src/lib/telegram-bot.ts",
    'import { eq } from "drizzle-orm";',
    'import { and, eq, ne } from "drizzle-orm";',
    'import { and, eq, ne } from "drizzle-orm";',
)

edit(
    "src/lib/telegram-bot.ts",
    '''    if (userId) {
      const patch: Record<string, unknown> = { telegramId: String(chatId) };
      if (from.username) patch.telegramHandle = from.username;
      await db.update(users).set(patch).where(eq(users.id, userId));
      await sendMessage(''',
    '''    if (userId) {
      const [target] = await db
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
      await sendMessage(''',
    "one Telegram chat <-> one account",
)

print()
if failed:
    print("Some edits did NOT apply (see !! lines). Send them to me."); sys.exit(1)
print("All edits applied.")
