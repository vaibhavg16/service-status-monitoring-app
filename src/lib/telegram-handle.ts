/**
 * Telegram usernames: 5-32 characters, a-z 0-9 and underscore, must start
 * with a letter, case-insensitive. We always store them lowercase so the
 * unique index and the ownership check compare like with like.
 */
const HANDLE_RE = /^[a-z][a-z0-9_]{4,31}$/;

export function normalizeTelegramHandle(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const h = input
    .trim()
    .replace(/^https?:\/\/(t\.me|telegram\.me)\//i, "")
    .replace(/^@/, "")
    .toLowerCase();
  return HANDLE_RE.test(h) ? h : null;
}

/** Postgres unique_violation (drizzle wraps the driver error in `cause`). */
export function isUniqueViolation(err: unknown): boolean {
  const e = err as { code?: string; cause?: { code?: string } } | null;
  return e?.code === "23505" || e?.cause?.code === "23505";
}
