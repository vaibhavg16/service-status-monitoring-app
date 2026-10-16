/**
 * Guards against `.env.example` placeholder values being mistaken for real
 * credentials.
 *
 * `.env.example` ships values like `re_...your-resend-api-key` or
 * `EAAG...permanent-system-user-token` as *documentation* of the expected
 * shape. If someone copies `.env.example` to `.env` without replacing those
 * placeholders, a plain `if (!process.env.WHATSAPP_TOKEN)` check is still
 * truthy — so the app fires a real HTTP request at Resend/Meta with garbage
 * credentials. That fails with a confusing provider-side error ("API key is
 * invalid", "Invalid JSON for postcard" — Meta's cryptic message for a
 * malformed OAuth token) instead of the intended graceful "not configured
 * yet, log the code to the server console" local-dev fallback.
 *
 * `realEnv` treats anything that still looks like example text as unset, so
 * those code paths fall back the same way they do when the variable is
 * genuinely empty.
 */
const PLACEHOLDER_MARKERS = [
  "...",
  "your-",
  "replace-with",
  "change-me",
  "changeme",
  "xxxx",
];

export function realEnv(name: string): string | undefined {
  const value = process.env[name]?.trim();
  if (!value) return undefined;
  const lower = value.toLowerCase();
  if (PLACEHOLDER_MARKERS.some((marker) => lower.includes(marker))) return undefined;
  return value;
}
