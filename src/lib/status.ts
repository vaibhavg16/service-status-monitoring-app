import type { Locale } from "./i18n";
import { translate } from "./i18n";

export type Aspect = "up" | "degraded" | "down";

export const ASPECT_ORDER: Record<Aspect, number> = { up: 0, degraded: 1, down: 2 };

/** Indian Railways signal aspects: clear / caution / danger. */
export const ASPECT: Record<
  Aspect,
  { word: string; glyph: string; hex: string; tailwind: string; rail: string }
> = {
  up: {
    word: "UP",
    glyph: "✓",
    hex: "#127A4A",
    tailwind: "text-[#0E6B41]",
    rail: "Clear",
  },
  degraded: {
    word: "DEGRADED",
    glyph: "!",
    hex: "#C07A00",
    tailwind: "text-[#8F5B00]",
    rail: "Caution",
  },
  down: {
    word: "DOWN",
    glyph: "✕",
    hex: "#C0271C",
    tailwind: "text-[#A81F15]",
    rail: "Danger",
  },
};

export const RAIL_LEGEND: Array<{ aspect: Aspect; key: string }> = [
  { aspect: "up", key: "board.legendClear" },
  { aspect: "degraded", key: "board.legendCaution" },
  { aspect: "down", key: "board.legendDanger" },
];

export function probeAspect(
  latencyMs: number,
  success: boolean,
  degradedThresholdMs: number,
  downThresholdMs: number,
): Aspect {
  if (!success) return "down";
  if (latencyMs >= downThresholdMs) return "down";
  if (latencyMs >= degradedThresholdMs) return "degraded";
  return "up";
}

export const CROWD_WINDOW_MIN = 15;
export const CROWD_SUSPECT_THRESHOLD = 3;
export const CROWD_RED_THRESHOLD = 10;

/** 3+ recent reports flag a problem, 10+ turn the row red regardless of probes. */
export function crowdAspect(reportCount: number): Aspect | null {
  if (reportCount >= CROWD_RED_THRESHOLD) return "down";
  if (reportCount >= CROWD_SUSPECT_THRESHOLD) return "degraded";
  return null;
}

export function mergeAspect(a: Aspect, b: Aspect | null): Aspect {
  if (!b) return a;
  return ASPECT_ORDER[a] >= ASPECT_ORDER[b] ? a : b;
}

export function adviceFor(
  locale: Locale,
  serviceName: string,
  aspect: Aspect,
  opts?: { paused?: boolean; suspect?: boolean },
): string {
  if (opts?.paused) return translate(locale, "advice.paused", { s: serviceName });
  if (opts?.suspect && aspect === "up")
    return translate(locale, "advice.suspect", { s: serviceName });
  return translate(locale, `advice.${aspect}`, { s: serviceName });
}

export function formatDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return "—";
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const rem = s % 60;
  if (m < 60) return `${m}m ${String(rem).padStart(2, "0")}s`;
  const h = Math.floor(m / 60);
  return `${h}h ${String(m % 60).padStart(2, "0")}m`;
}

export function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
  return sorted[idx];
}

export function clockUTC(d: Date = new Date()): string {
  return d.toISOString().slice(11, 19);
}

export function istParts(d: Date = new Date()): { time: string; day: string } {
  const fmt = new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  const day = new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    weekday: "short",
    day: "2-digit",
    month: "short",
  }).format(d);
  return { time: fmt.format(d), day };
}

export function ist(d: Date | string, withSeconds = false): string {
  const date = typeof d === "string" ? new Date(d) : d;
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    hour: "2-digit",
    minute: "2-digit",
    ...(withSeconds ? { second: "2-digit" as const } : {}),
    hour12: false,
    day: "2-digit",
    month: "short",
  }).format(date);
}

export function minutesAgo(d: Date | string): number {
  const date = typeof d === "string" ? new Date(d) : d;
  return Math.max(0, Math.floor((Date.now() - date.getTime()) / 60000));
}
