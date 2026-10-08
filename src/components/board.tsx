"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Bell, ChevronDown, RefreshCw, TriangleAlert } from "lucide-react";
import { useI18n, useToast } from "@/components/providers";
import { Lamp, Micro, Sparkline, StatusStamp } from "@/components/ui";
import type { BoardEntry } from "@/lib/queries";
import { adviceFor, ist, RAIL_LEGEND, type Aspect } from "@/lib/status";

type Props = {
  entries: BoardEntry[];
  totals: { up: number; degraded: number; down: number; paused: number };
  checks24: number;
  generatedAt: string;
  backend: string;
  subscribed: string[];
  reportedIds: number[];
  signedIn: boolean;
  isAdmin: boolean;
};

const POLL_MS = 15_000;
const PROBE_MS = 30_000;

export function Board(initial: Props) {
  const { locale, t } = useI18n();
  const { toast } = useToast();
  const { signedIn, isAdmin, backend } = initial;

  const [isClient, setIsClient] = useState(false);
  useEffect(() => {
    setIsClient(true);
  }, []);

  const [entries, setEntries] = useState<BoardEntry[]>(initial.entries);
  const [totals, setTotals] = useState(initial.totals);
  const [checks24, setChecks24] = useState(initial.checks24);
  const [subscribed, setSubscribed] = useState<Set<string>>(new Set(initial.subscribed));
  const [reported, setReported] = useState<Set<number>>(new Set(initial.reportedIds));
  const [busy, setBusy] = useState(false);
  const [seconds, setSeconds] = useState(Math.round(PROBE_MS / 1000));
  const lastGood = useRef({ entries: initial.entries, totals: initial.totals, checks24: initial.checks24 });

  /* countdown + polling */
  useEffect(() => {
    const id = setInterval(() => {
      setSeconds((s) => (s <= 1 ? Math.round(PROBE_MS / 1000) : s - 1));
    }, 1000);
    return () => clearInterval(id);
  }, []);

  const refresh = useCallback(async () => {
    setBusy(true);
    try {
      const res = await fetch("/api/board", { cache: "no-store" });
      if (!res.ok) throw new Error("bad status");
      const data = await res.json();
      setEntries(data.entries);
      setTotals(data.totals);
      setChecks24(data.checks24);
      lastGood.current = { entries: data.entries, totals: data.totals, checks24: data.checks24 };
      setSeconds(Math.round(PROBE_MS / 1000));
    } catch {
      toast(t("common.offline"), "warn");
    } finally {
      setBusy(false);
    }
  }, [t, toast]);

  useEffect(() => {
    const id = setInterval(() => void refresh(), POLL_MS);
    return () => clearInterval(id);
  }, [refresh]);

  /* ------------------------- actions ------------------------- */

  const report = async (entry: BoardEntry) => {
    if (!signedIn) {
      toast("Sign in to report a failure", "warn");
      window.location.href = "/login?next=/";
      return;
    }
    const slug = entry.service.slug;
    if (reported.has(entry.service.id)) return;
    setReported((p) => new Set(p).add(entry.service.id));
    setEntries((prev) =>
      prev.map((e) =>
        e.service.id === entry.service.id
          ? {
              ...e,
              reportCount: e.reportCount + 1,
              crowdAspect: e.reportCount + 1 >= 10 ? "down" : e.reportCount + 1 >= 3 ? "degraded" : e.crowdAspect,
              aspect: e.reportCount + 1 >= 10 ? "down" : e.aspect,
            }
          : e,
      ),
    );
    try {
      const res = await fetch("/api/reports", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ serviceId: entry.service.id }),
      });
      if (!res.ok) throw new Error();
      toast(t("reports.submitted"), "ok");
      void refresh();
    } catch {
      setReported((p) => {
        const n = new Set(p);
        n.delete(entry.service.id);
        return n;
      });
      setEntries((prev) =>
        prev.map((e) =>
          e.service.id === entry.service.id
            ? { ...e, reportCount: Math.max(0, e.reportCount - 1), aspect: e.probeAspect }
            : e,
        ),
      );
      toast(t("common.error"), "bad");
    }
    void slug;
  };

  const subscribe = async (entry: BoardEntry) => {
    if (!signedIn) {
      toast("Sign in to subscribe to alerts", "warn");
      window.location.href = "/login?next=/";
      return;
    }
    const slug = entry.service.slug;
    const was = subscribed.has(slug);
    setSubscribed((prev) => {
      const n = new Set(prev);
      if (was) n.delete(slug);
      else n.add(slug);
      return n;
    });
    try {
      const res = await fetch("/api/subscriptions", {
        method: was ? "DELETE" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ serviceId: entry.service.id, channel: "telegram" }),
      });
      if (!res.ok) throw new Error();
      toast(was ? t("subs.deleted") : `${t("subs.created")} · ${entry.service.shortName}`, was ? "info" : "ok");
    } catch {
      setSubscribed((prev) => {
        const n = new Set(prev);
        if (was) n.add(slug);
        else n.delete(slug);
        return n;
      });
      toast(t("common.error"), "bad");
    }
  };

  /* ------------------------- derived ------------------------- */

  const worst = useMemo<Aspect>(() => {
    if (totals.down > 0) return "down";
    if (totals.degraded > 0) return "degraded";
    return "up";
  }, [totals]);

  const heat = useMemo(() => entries.reduce((a, e) => a + e.reportCount, 0), [entries]);
  const topHeat = useMemo(
    () => [...entries].sort((a, b) => b.reportCount - a.reportCount)[0],
    [entries],
  );

  return (
    <div className="space-y-6">
      {/* ---------------- indicator band ---------------- */}
      <section className="relative -mx-3 overflow-hidden bg-board text-paper sm:-mx-5 lg:-mx-7">
        <img
          src="/images/board.jpg"
          alt=""
          aria-hidden="true"
          className="absolute inset-0 h-full w-full object-cover object-[70%_50%] opacity-45"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-board/95 via-board/80 to-board" />
        <div className="relative px-4 pt-7 pb-5 sm:px-7 lg:px-8 lg:pt-9">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="mb-3 flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-saffron blink" />
                <span className="font-mono text-[10px] tracking-[0.22em] text-saffron uppercase">
                  {t("board.live")} · IST {isClient ? ist(new Date(), true) : "--:--:--"}
                </span>
              </div>
              <h1 className="display max-w-[16ch] text-[clamp(2.1rem,6.4vw,4.4rem)] leading-[0.92] text-paper">
                {t("board.headline")}
              </h1>
              <p className="mt-3 max-w-[52ch] text-sm leading-relaxed text-paper/65">
                {t("board.lede")}
              </p>
            </div>

            <div className="flex flex-col gap-1.5 border border-paper/15 bg-board-2/70 px-4 py-3">
              <Micro className="!text-paper/45">{t("board.nextProbe")}</Micro>
              <div className="tnum text-2xl font-medium text-saffron">
                00:{String(seconds).padStart(2, "0")}
              </div>
              <Micro className="!text-paper/40">
                {t("board.checks")} · {checks24.toLocaleString("en-IN")}
              </Micro>
            </div>
          </div>

          {/* the twelve lamps */}
          <div className="mt-7 grid grid-cols-4 gap-x-2 gap-y-4 border-t border-paper/12 pt-5 sm:grid-cols-6 lg:grid-cols-12">
            {entries.map((e, i) => (
              <div
                key={e.service.id}
                className="rise flex flex-col items-center gap-2 text-center"
                style={{ animationDelay: `${i * 40}ms` }}
              >
                <Lamp
                  aspect={e.aspect}
                  paused={e.service.paused}
                  size={26}
                  pulse={e.aspect !== "up"}
                />
                <span
                  className={`font-mono text-[9.5px] leading-tight tracking-[0.08em] uppercase ${
                    e.aspect === "up" ? "text-paper/55" : "text-paper"
                  }`}
                >
                  {e.service.shortName}
                </span>
              </div>
            ))}
          </div>

          <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-paper/12 pt-4">
            {RAIL_LEGEND.map(({ aspect, key }) => (
              <span key={aspect} className="flex items-center gap-2">
                <Lamp aspect={aspect} size={15} />
                <span className="font-mono text-[10px] tracking-[0.12em] text-paper/60 uppercase">
                  {ASPECT_GLYPH[aspect]} {t(key)}
                </span>
              </span>
            ))}
            <span className="font-mono text-[10px] tracking-[0.1em] text-paper/35 uppercase">
              {t("board.legendNote")}
            </span>
          </div>
        </div>
      </section>

      {/* ---------------- ledger + rail ---------------- */}
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_276px]">
        <section>
          <div className="mb-2 flex items-end justify-between gap-3">
            <div>
              <Micro>{t("board.service")} · {t("board.status")}</Micro>
              <div className="mt-1 flex items-center gap-2 text-sm text-ink-2">
                <span className="tnum font-medium text-ink">
                  {totals.up}/{entries.length}
                </span>{" "}
                clear
                {totals.degraded > 0 && (
                  <span className="tnum text-[#8F5B00]">· {totals.degraded} caution</span>
                )}
                {totals.down > 0 && (
                  <span className="tnum text-[#A81F15]">· {totals.down} danger</span>
                )}
                {totals.paused > 0 && <span>· {totals.paused} paused</span>}
              </div>
            </div>
            <button
              type="button"
              onClick={() => void refresh()}
              className="flex items-center gap-1.5 border border-rule bg-card px-2.5 py-1.5 text-xs hover:border-ink/40"
            >
              <RefreshCw size={13} className={busy ? "animate-spin" : ""} />
              <span className="micro !text-ink-2">{t("board.refresh")}</span>
            </button>
          </div>

          <div className="paper-card">
            <div className="hidden items-center gap-4 border-b border-rule px-5 py-2 lg:flex">
              <div className="flex-1">
                <Micro>{t("board.service")}</Micro>
              </div>
              <div className="w-[150px]">
                <Micro>{t("board.status")}</Micro>
              </div>
              <div className="w-[74px] text-right">
                <Micro>{t("board.latency")}</Micro>
              </div>
              <div className="w-[70px] text-right">
                <Micro>{t("board.uptime24")}</Micro>
              </div>
              <div className="w-[108px]">
                <Micro>{t("board.trend")}</Micro>
              </div>
              <div className="w-[172px] text-right">
                <Micro>Actions</Micro>
              </div>
            </div>
            {entries.map((e, i) => (
              <Row
                key={e.service.id}
                entry={e}
                index={i}
                locale={locale}
                subscribed={subscribed.has(e.service.slug)}
                reported={reported.has(e.service.id)}
                signedIn={signedIn}
                onReport={() => void report(e)}
                onSubscribe={() => void subscribe(e)}
              />
            ))}
          </div>
        </section>

        {/* sticky rail */}
        <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start">
          <div className="paper-card p-4">
            <Micro>{t("board.probeClock")}</Micro>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="tnum text-3xl font-medium">00:{String(seconds).padStart(2, "0")}</span>
              <span className="text-xs text-ink-2">/ 30s</span>
            </div>
            <div className="mt-3 h-1.5 w-full overflow-hidden bg-paper-2">
              <div
                className="h-full bg-saffron transition-[width] duration-1000 ease-linear"
                style={{ width: `${(seconds / 30) * 100}%` }}
              />
            </div>
            <div className="mt-3 flex items-center justify-between">
              <Micro>{t("board.probeEngine")}</Micro>
              <span className="flex items-center gap-1.5 font-mono text-[10px] uppercase">
                <span className="h-1.5 w-1.5 rounded-full bg-up blink" />
                {t("board.probeRunning")}
              </span>
            </div>
            <div className="mt-2 flex items-center justify-between">
              <Micro>Cache</Micro>
              <span className="font-mono text-[10px] uppercase">{backend}</span>
            </div>
          </div>

          <div className="paper-card p-4">
            <Micro>{t("board.crowdHeat")}</Micro>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="tnum text-3xl font-medium">{heat}</span>
              <span className="text-xs text-ink-2">reports · last 15 min</span>
            </div>
            <div className="micro mt-1">3 flags a problem · 10 turns it red</div>
            <div className="mt-3 flex gap-1" aria-hidden="true">
              {Array.from({ length: 14 }).map((_, i) => (
                <span
                  key={i}
                  className="h-6 flex-1"
                  style={{
                    background:
                      i < Math.min(14, heat)
                        ? i >= 10
                          ? "#C0271C"
                          : i >= 3
                            ? "#C07A00"
                            : "#127A4A"
                        : "#E7DFD0",
                  }}
                />
              ))}
            </div>
            {topHeat && topHeat.reportCount > 0 && (
              <p className="mt-3 flex gap-2 text-xs leading-relaxed text-ink-2">
                <TriangleAlert size={14} className="mt-0.5 flex-none text-caution" />
                <span>
                  <strong className="font-semibold text-ink">
                    {topHeat.service.shortName}
                  </strong>{" "}
                  {t("board.escalation", { n: topHeat.reportCount })}
                </span>
              </p>
            )}
            <p className="mt-3 border-t border-rule pt-3 text-[11px] leading-relaxed text-ink-3">
              3 reports raise a flag. 10 turn the row red — even if the site
              answers our probes fine.
            </p>
          </div>

          <div className="paper-card p-4">
            <Micro>{t("board.railAdvice")}</Micro>
            <p className="mt-2 text-xs leading-relaxed text-ink-2">
              {t("board.railAdviceNote")}
            </p>
            <div className="mt-3 grid grid-cols-4 gap-1">
              {(["en", "hi", "mr", "ta"] as const).map((l) => (
                <button
                  key={l}
                  type="button"
                  onClick={() => {
                    document.cookie = `iid_locale=${l};path=/;max-age=31536000;samesite=lax`;
                    window.location.reload();
                  }}
                  className={`border px-1 py-1.5 font-mono text-[10px] uppercase transition-colors ${
                    l === locale
                      ? "border-ink bg-board text-paper"
                      : "border-rule bg-card hover:border-ink/40"
                  }`}
                >
                  {l}
                </button>
              ))}
            </div>
          </div>

          {isAdmin && (
            <Link
              href="/services#simulation"
              className="block border border-saffron/50 bg-saffron/8 p-4 text-sm font-medium hover:bg-saffron/15"
            >
              <Micro className="!text-saffron">Admin</Micro>
              <div className="mt-1">{t("sim.title")} →</div>
            </Link>
          )}
        </aside>
      </div>
    </div>
  );
}

const ASPECT_GLYPH: Record<Aspect, string> = { up: "✓", degraded: "!", down: "✕" };

/* ------------------------------ row ------------------------------ */

function Row({
  entry,
  index,
  locale,
  subscribed,
  reported,
  signedIn,
  onReport,
  onSubscribe,
}: {
  entry: BoardEntry;
  index: number;
  locale: "en" | "hi" | "mr" | "ta";
  subscribed: boolean;
  reported: boolean;
  signedIn: boolean;
  onReport: () => void;
  onSubscribe: () => void;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const s = entry.service;
  const advice = adviceFor(locale, s.name, entry.aspect, {
    paused: s.paused,
    suspect: entry.crowdAspect !== null && entry.probeAspect === "up",
  });

  return (
    <article
      className="rule-row rise px-4 py-4 sm:px-5"
      style={{ animationDelay: `${Math.min(index, 12) * 40}ms` }}
    >
      <div className="flex flex-wrap items-start gap-x-4 gap-y-3">
        <div className="flex min-w-0 flex-1 basis-[240px] gap-3">
          <Lamp aspect={entry.aspect} paused={s.paused} pulse={entry.aspect !== "up"} />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="truncate text-[15px] leading-tight font-semibold">{s.name}</h3>
              <StatusStamp aspect={entry.aspect} paused={s.paused} />
              {entry.forced && (
                <span className="stamp !text-saffron">{t("sim.active")}</span>
              )}
            </div>
            <div className="micro mt-1.5">{s.provider} · {s.category}</div>
            <p className="mt-2 text-[13px] leading-snug text-ink-2">{advice}</p>
            {entry.reportCount > 0 && (
              <div className="mt-2 flex items-center gap-1.5 text-[12px] font-medium text-[#8F5B00]">
                <TriangleAlert size={13} />
                {entry.reportCount >= 10
                  ? t("board.escalationRed", { n: entry.reportCount })
                  : t("board.escalation", { n: entry.reportCount })}
              </div>
            )}
          </div>
        </div>

        <div className="basis-[70px] lg:w-[74px] lg:basis-auto lg:text-right">
          <Micro className="lg:text-right">ms</Micro>
          <div className="tnum mt-1 text-lg leading-none font-medium">
            {entry.latency ?? "—"}
          </div>
          <div className="tnum mt-1 text-[10px] text-ink-3">
            p50 {entry.p50} · p95 {entry.p95}
          </div>
        </div>

        <div className="basis-[70px] lg:w-[70px] lg:basis-auto lg:text-right">
          <Micro className="lg:text-right">24h</Micro>
          <div
            className={`tnum mt-1 text-lg leading-none font-medium ${
              entry.uptime24 < 99 ? "text-[#8F5B00]" : ""
            }`}
          >
            {entry.uptime24}%
          </div>
          <div className="tnum mt-1 text-[10px] text-ink-3">{entry.checks24} chk</div>
        </div>

        <div className="basis-[108px] lg:w-[108px] lg:basis-auto">
          <Micro>{t("board.trend")}</Micro>
          <div className="mt-1">
            <Sparkline values={entry.series} aspect={entry.aspect} />
          </div>
        </div>

        <div className="flex w-full flex-wrap items-center gap-2 lg:w-[172px] lg:justify-end lg:basis-auto">
          <button
            type="button"
            onClick={onReport}
            disabled={reported}
            className={`flex flex-1 items-center justify-center gap-1.5 border px-3 py-2 text-xs font-medium transition-colors lg:flex-none ${
              reported
                ? "border-up/40 bg-up/10 text-[#0E6B41]"
                : "border-rule bg-card hover:border-danger/50 hover:text-[#A81F15]"
            }`}
          >
            <span aria-hidden="true">{reported ? "✓" : "!"}</span>
            {reported ? t("act.failingDone") : t("act.failing")}
          </button>
          <button
            type="button"
            onClick={onSubscribe}
            aria-pressed={subscribed}
            title={subscribed ? t("act.subscribed") : t("act.subscribe")}
            className={`grid h-[34px] w-[34px] flex-none place-items-center border transition-colors ${
              subscribed
                ? "border-navy bg-navy text-white"
                : "border-rule bg-card hover:border-ink/40"
            }`}
          >
            <Bell size={14} fill={subscribed ? "currentColor" : "none"} />
          </button>
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            aria-label="Details"
            className="grid h-[34px] w-[34px] flex-none place-items-center border border-rule bg-card hover:border-ink/40"
          >
            <ChevronDown size={14} className={open ? "rotate-180 transition-transform" : "transition-transform"} />
          </button>
        </div>
      </div>

      {open && (
        <div className="mt-4 grid gap-4 border-t border-dashed border-rule pt-4 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <Micro>Endpoint</Micro>
            <a
              href={s.url}
              target="_blank"
              rel="noreferrer noopener"
              className="mt-1 block truncate font-mono text-[11px] text-navy underline decoration-rule underline-offset-2"
            >
              {s.url}
            </a>
            <div className="mt-2 text-[11px] text-ink-3">{s.description}</div>
          </div>
          <div>
            <Micro>{t("board.lastProbe")}</Micro>
            <div className="tnum mt-1 text-xs">
              {entry.lastProbeAt ? ist(new Date(entry.lastProbeAt), true) : "—"} IST
            </div>
            <div className="mt-1 text-[11px] text-ink-3">
              every {s.checkIntervalSec}s · timeout {s.timeoutMs}ms
            </div>
          </div>
          <div>
            <Micro>Thresholds</Micro>
            <div className="tnum mt-1 text-xs">
              caution ≥ {s.degradedThresholdMs}ms · down ≥ {s.downThresholdMs}ms
            </div>
            <div className="mt-1 text-[11px] text-ink-3">
              probe reads: {entry.probeAspect.toUpperCase()} · crowd:{" "}
              {entry.crowdAspect ? entry.crowdAspect.toUpperCase() : "clear"}
            </div>
          </div>
          <div>
            <Micro>Crowd reports (15m)</Micro>
            <div className="tnum mt-1 text-xs">{entry.reportCount}</div>
            {!signedIn && (
              <div className="mt-1 text-[11px] text-ink-3">
                <Link href="/login" className="text-navy underline underline-offset-2">
                  Sign in
                </Link>{" "}
                to report or subscribe.
              </div>
            )}
          </div>
        </div>
      )}
    </article>
  );
}
