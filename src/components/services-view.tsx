"use client";

import { useState } from "react";
import { useI18n, useToast } from "@/components/providers";
import { EmptyState, Lamp, StatusStamp } from "@/components/ui";
import type { ServiceRow } from "@/lib/queries";
import type { Aspect } from "@/lib/status";

type ProbeInfo = {
  id: number;
  latency: number | null;
  checks24: number;
  uptime24: number;
  reports: number;
};

type FormState = Partial<ServiceRow> & { name: string; url: string };

const BLANK: FormState = {
  name: "",
  url: "",
  shortName: "",
  provider: "Independent",
  category: "payments",
  description: "",
  checkIntervalSec: 30,
  timeoutMs: 5000,
  degradedThresholdMs: 900,
  downThresholdMs: 3000,
  baseLatencyMs: 220,
  sortOrder: 50,
};

export function ServicesView({
  rows,
  aspects,
  forced,
  probeInfo,
}: {
  rows: ServiceRow[];
  aspects: Record<number, Aspect>;
  forced: Partial<Record<string, Aspect>>;
  probeInfo: ProbeInfo[];
}) {
  const { t } = useI18n();
  const { toast } = useToast();
  const [items, setItems] = useState(rows);
  const [form, setForm] = useState<FormState | null>(null);
  const [busy, setBusy] = useState(false);
  const [simSlug, setSimSlug] = useState<string | null>(null);

  const info = new Map(probeInfo.map((p) => [p.id, p]));

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!form) return;
    setBusy(true);
    const isNew = !form.id;
    try {
      const res = await fetch("/api/services", {
        method: isNew ? "POST" : "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || t("common.error"));
      setItems((p) =>
        isNew ? [...p, data.service] : p.map((s) => (s.id === data.service.id ? data.service : s)),
      );
      setForm(null);
      toast(isNew ? t("services.created") : t("services.updated"), "ok");
    } catch (err) {
      toast(err instanceof Error ? err.message : t("common.error"), "bad");
    } finally {
      setBusy(false);
    }
  }

  async function patch(body: Record<string, unknown>, msg: string, revert?: () => void) {
    try {
      const res = await fetch("/api/services", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || t("common.error"));
      setItems((p) => p.map((s) => (s.id === data.service.id ? data.service : s)));
      toast(msg, "ok");
    } catch (err) {
      revert?.();
      toast(err instanceof Error ? err.message : t("common.error"), "bad");
    }
  }

  async function remove(s: ServiceRow) {
    if (!window.confirm(t("services.deleteConfirm"))) return;
    const before = items;
    setItems((p) => p.filter((x) => x.id !== s.id));
    try {
      const res = await fetch("/api/services", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: s.id }),
      });
      if (!res.ok) throw new Error();
      toast(t("services.deleted"), "info");
    } catch {
      setItems(before);
      toast(t("common.error"), "bad");
    }
  }

  async function simulate(slug: string, body: Record<string, unknown>, label: string) {
    setSimSlug(slug);
    try {
      const res = await fetch("/api/simulate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ slug, ...body }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || t("common.error"));
      toast(`${t("sim.done", { s: slug.toUpperCase(), v: label })}`, "ok");
    } catch (err) {
      toast(err instanceof Error ? err.message : t("common.error"), "bad");
    } finally {
      setSimSlug(null);
    }
  }

  async function runProbe() {
    setBusy(true);
    try {
      const res = await fetch("/api/probe", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || t("common.error"));
      toast(`Probed ${data.cycle.checked} services in ${data.cycle.durationMs}ms`, "ok");
    } catch (err) {
      toast(err instanceof Error ? err.message : t("common.error"), "bad");
    } finally {
      setBusy(false);
    }
  }

  const field =
    "w-full border border-rule bg-card px-3 py-2.5 text-sm outline-none focus:border-navy";

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3 border-b border-rule pb-4">
        <div>
          <div className="micro">Admin</div>
          <h1 className="display mt-1 text-[clamp(1.6rem,4vw,2.4rem)]">{t("services.title")}</h1>
          <p className="mt-1.5 max-w-[62ch] text-sm text-ink-2">{t("services.lede")}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void runProbe()}
            disabled={busy}
            className="border border-rule bg-card px-3 py-2 text-xs hover:border-ink/40 disabled:opacity-60"
          >
            ▶ Run probe cycle now
          </button>
          <button
            type="button"
            onClick={() => setForm({ ...BLANK })}
            className="bg-navy px-3.5 py-2 text-xs font-semibold text-white hover:bg-navy-2"
          >
            + {t("services.new")}
          </button>
        </div>
      </header>

      {form && (
        <form onSubmit={save} className="paper-card grid gap-3 p-4 sm:grid-cols-3">
          <label className="block sm:col-span-2">
            <span className="micro mb-1 block">{t("services.name")}</span>
            <input required className={field} value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="UPI via Kotak Bank" />
          </label>
          <label className="block">
            <span className="micro mb-1 block">{t("services.short")}</span>
            <input required className={field} value={form.shortName ?? ""}
              onChange={(e) => setForm({ ...form, shortName: e.target.value })}
              placeholder="KOTAK UPI" maxLength={18} />
          </label>
          <label className="block sm:col-span-3">
            <span className="micro mb-1 block">{t("services.url")}</span>
            <input required type="url" className={field} value={form.url}
              onChange={(e) => setForm({ ...form, url: e.target.value })}
              placeholder="https://upi.kotak.com/health" />
          </label>
          <label className="block">
            <span className="micro mb-1 block">{t("services.provider")}</span>
            <input className={field} value={form.provider ?? ""}
              onChange={(e) => setForm({ ...form, provider: e.target.value })} />
          </label>
          <label className="block">
            <span className="micro mb-1 block">{t("services.category")}</span>
            <input className={field} value={form.category ?? ""}
              onChange={(e) => setForm({ ...form, category: e.target.value })} />
          </label>
          <label className="block">
            <span className="micro mb-1 block">{t("services.interval")}</span>
            <input type="number" min={10} max={3600} className={field}
              value={form.checkIntervalSec ?? 30}
              onChange={(e) => setForm({ ...form, checkIntervalSec: Number(e.target.value) })} />
          </label>
          <label className="block">
            <span className="micro mb-1 block">{t("services.timeout")}</span>
            <input type="number" min={200} className={field} value={form.timeoutMs ?? 5000}
              onChange={(e) => setForm({ ...form, timeoutMs: Number(e.target.value) })} />
          </label>
          <label className="block">
            <span className="micro mb-1 block">{t("services.degraded")}</span>
            <input type="number" min={50} className={field}
              value={form.degradedThresholdMs ?? 900}
              onChange={(e) => setForm({ ...form, degradedThresholdMs: Number(e.target.value) })} />
          </label>
          <label className="block">
            <span className="micro mb-1 block">{t("services.down")}</span>
            <input type="number" min={100} className={field} value={form.downThresholdMs ?? 3000}
              onChange={(e) => setForm({ ...form, downThresholdMs: Number(e.target.value) })} />
          </label>
          <label className="block sm:col-span-3">
            <span className="micro mb-1 block">Description</span>
            <input className={field} value={form.description ?? ""}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="Shown under the row on the board" />
          </label>
          <div className="flex gap-2 sm:col-span-3">
            <button type="submit" disabled={busy}
              className="bg-board px-4 py-2 text-xs font-semibold text-paper disabled:opacity-60">
              {busy ? t("common.loading") : t("services.save")}
            </button>
            <button type="button" onClick={() => setForm(null)}
              className="border border-rule bg-card px-4 py-2 text-xs">
              {t("common.cancel")}
            </button>
          </div>
        </form>
      )}

      {items.length === 0 ? (
        <EmptyState title={t("services.empty")} body="Each service is one endpoint with an interval and two thresholds." />
      ) : (
        <div className="paper-card overflow-x-auto">
          <table className="w-full min-w-[760px] border-collapse text-left">
            <thead>
              <tr className="border-b border-rule">
                <th className="px-4 py-2"><span className="micro">Service</span></th>
                <th className="px-3 py-2"><span className="micro">{t("board.status")}</span></th>
                <th className="px-3 py-2 text-right"><span className="micro">ms</span></th>
                <th className="px-3 py-2 text-right"><span className="micro">24h</span></th>
                <th className="px-3 py-2 text-right"><span className="micro">{t("services.interval")}</span></th>
                <th className="px-4 py-2 text-right"><span className="micro">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {items.map((s) => {
                const aspect = aspects[s.id] ?? "up";
                const pi = info.get(s.id);
                return (
                  <tr key={s.id} className="border-b border-rule last:border-0 align-top">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold">{s.name}</span>
                        {forced[s.slug] && <span className="stamp !text-saffron">{t("sim.active")}</span>}
                      </div>
                      <div className="micro mt-1">{s.slug}</div>
                      <a href={s.url} target="_blank" rel="noreferrer noopener"
                        className="mt-1 block max-w-[280px] truncate font-mono text-[11px] text-navy">
                        {s.url}
                      </a>
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-2">
                        <Lamp aspect={aspect} paused={s.paused} size={18} />
                        <StatusStamp aspect={aspect} paused={s.paused} />
                      </div>
                    </td>
                    <td className="tnum px-3 py-3 text-right text-sm">{pi?.latency ?? "—"}</td>
                    <td className="tnum px-3 py-3 text-right text-sm">{pi?.uptime24 ?? "—"}%</td>
                    <td className="tnum px-3 py-3 text-right text-sm">{s.checkIntervalSec}s</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap justify-end gap-1.5">
                        <button type="button" onClick={() => setForm({ ...s })}
                          className="border border-rule bg-card px-2 py-1 text-[11px] hover:border-ink/40">
                          {t("services.edit")}
                        </button>
                        <button type="button"
                          onClick={() => void patch({ id: s.id, paused: !s.paused }, s.paused ? "Resumed" : "Paused")}
                          className="border border-rule bg-card px-2 py-1 text-[11px] hover:border-ink/40">
                          {s.paused ? t("services.resume") : t("services.pause")}
                        </button>
                        <button type="button" onClick={() => void remove(s)}
                          className="border border-rule bg-card px-2 py-1 text-[11px] text-[#A81F15] hover:border-danger/50">
                          {t("services.delete")}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ---------------- simulation panel ---------------- */}
      <section id="simulation" className="border border-saffron/45 bg-saffron/6 p-4 sm:p-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <div className="micro !text-saffron">Chaos</div>
            <h2 className="display mt-1 text-xl">{t("sim.title")}</h2>
            <p className="mt-1 max-w-[60ch] text-sm text-ink-2">{t("sim.lede")}</p>
          </div>
          <span className="stamp !text-saffron">Demo only</span>
        </div>

        <div className="mt-4 space-y-2">
          {items.map((s) => (
            <div key={s.id}
              className="flex flex-wrap items-center gap-2 border border-rule bg-card px-3 py-2.5">
              <Lamp aspect={forced[s.slug] ?? (aspects[s.id] ?? "up")} paused={s.paused} size={18} />
              <span className="min-w-0 flex-1 truncate text-sm font-medium">{s.shortName}</span>
              {simSlug === s.slug && <span className="micro">working…</span>}
              {(["up", "degraded", "down"] as Aspect[]).map((a) => (
                <button key={a} type="button"
                  onClick={() => void simulate(s.slug, { aspect: a }, a.toUpperCase())}
                  disabled={simSlug === s.slug}
                  className={`border px-2 py-1 font-mono text-[10px] tracking-[0.12em] uppercase disabled:opacity-50 ${
                    forced[s.slug] === a
                      ? "border-ink bg-board text-paper"
                      : a === "up"
                        ? "border-up/40 text-[#0E6B41] hover:bg-up/10"
                        : a === "degraded"
                          ? "border-caution/50 text-[#8F5B00] hover:bg-caution/10"
                          : "border-danger/40 text-[#A81F15] hover:bg-danger/10"
                  }`}>
                  {a}
                </button>
              ))}
              <button type="button"
                onClick={() => void simulate(s.slug, { action: "clear" }, "probed")}
                disabled={simSlug === s.slug || !forced[s.slug]}
                className="border border-rule px-2 py-1 font-mono text-[10px] uppercase disabled:opacity-40">
                {t("sim.clear")}
              </button>
              <button type="button"
                onClick={() => void simulate(s.slug, { action: "storm", count: 12 }, "+12 reports")}
                disabled={simSlug === s.slug}
                className="border border-danger/40 px-2 py-1 font-mono text-[10px] text-[#A81F15] uppercase disabled:opacity-50">
                {t("sim.storm")}
              </button>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
