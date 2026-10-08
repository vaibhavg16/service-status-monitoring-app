"use client";

import { useMemo, useState } from "react";
import { useI18n, useToast } from "@/components/providers";
import { EmptyState, Lamp, Pill, StatusStamp } from "@/components/ui";
import { ist, minutesAgo, type Aspect } from "@/lib/status";

type Row = {
  report: {
    id: number;
    serviceId: number;
    userId: number | null;
    city: string;
    note: string;
    state: "open" | "confirmed" | "withdrawn" | "dismissed";
    createdAt: string | Date;
    withdrawnAt: string | Date | null;
  };
  service: { id: number; name: string; shortName: string; slug: string };
  author: { id: number; name: string; role: string } | null;
  aspect: Aspect;
};

const STATE_TONE = {
  open: "caution",
  confirmed: "danger",
  withdrawn: "neutral",
  dismissed: "neutral",
} as const;

export function ReportsView({
  rows,
  currentUserId,
  isAdmin,
  city,
  services,
}: {
  rows: Row[];
  currentUserId: number;
  isAdmin: boolean;
  city: string;
  services: { id: number; name: string }[];
}) {
  const { t } = useI18n();
  const { toast } = useToast();
  const [items, setItems] = useState<Row[]>(rows);
  const [tab, setTab] = useState<"mine" | "all">("all");
  const [composing, setComposing] = useState(false);
  const [form, setForm] = useState({ serviceId: services[0]?.id ?? 0, note: "", city });
  const [busy, setBusy] = useState(false);

  const mine = useMemo(
    () => items.filter((i) => i.report.userId === currentUserId),
    [items, currentUserId],
  );
  const list = tab === "mine" ? mine : items;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const optimistic: Row = {
      report: {
        id: -Date.now(),
        serviceId: form.serviceId,
        userId: currentUserId,
        city: form.city,
        note: form.note,
        state: "open",
        createdAt: new Date().toISOString(),
        withdrawnAt: null,
      },
      service: {
        id: form.serviceId,
        name: services.find((s) => s.id === form.serviceId)?.name ?? "Service",
        shortName: "",
        slug: "",
      },
      author: { id: currentUserId, name: "You", role: "merchant" },
      aspect: "degraded",
    };
    setItems((p) => [optimistic, ...p]);
    setComposing(false);
    try {
      const res = await fetch("/api/reports", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || t("common.error"));
      setItems((p) =>
        p.map((i) =>
          i.report.id === optimistic.report.id
            ? { ...i, report: { ...i.report, id: data.report.id } }
            : i,
        ),
      );
      toast(t("reports.submitted"), "ok");
    } catch (err) {
      setItems((p) => p.filter((i) => i.report.id !== optimistic.report.id));
      setComposing(true);
      toast(err instanceof Error ? err.message : t("common.error"), "bad");
    } finally {
      setBusy(false);
    }
  }

  async function withdraw(id: number) {
    const before = items;
    setItems((p) =>
      p.map((i) =>
        i.report.id === id
          ? { ...i, report: { ...i.report, state: "withdrawn" } }
          : i,
      ),
    );
    try {
      const res = await fetch("/api/reports", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id }),
      });
      if (!res.ok) throw new Error();
      toast(t("reports.withdrawn"), "info");
    } catch {
      setItems(before);
      toast(t("common.error"), "bad");
    }
  }

  async function moderate(id: number, action: "confirmed" | "dismissed") {
    const before = items;
    setItems((p) =>
      p.map((i) =>
        i.report.id === id ? { ...i, report: { ...i.report, state: action } } : i,
      ),
    );
    try {
      const res = await fetch("/api/reports", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id, action }),
      });
      if (!res.ok) throw new Error();
      toast(action === "confirmed" ? t("reports.confirm") : t("reports.dismiss"), "ok");
    } catch {
      setItems(before);
      toast(t("common.error"), "bad");
    }
  }

  const field =
    "w-full border border-rule bg-card px-3 py-2.5 text-sm outline-none focus:border-navy";

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3 border-b border-rule pb-4">
        <div>
          <div className="micro">Crowd</div>
          <h1 className="display mt-1 text-[clamp(1.6rem,4vw,2.4rem)]">{t("reports.title")}</h1>
          <p className="mt-1.5 max-w-[64ch] text-sm text-ink-2">{t("reports.lede")}</p>
        </div>
        <button
          type="button"
          onClick={() => setComposing((v) => !v)}
          className="bg-danger px-3.5 py-2 text-xs font-semibold text-white hover:bg-[#A81F15]"
        >
          + {t("act.failing")}
        </button>
      </header>

      {composing && (
        <form onSubmit={submit} className="paper-card grid gap-3 p-4 sm:grid-cols-[1fr_1fr_auto]">
          <label className="block">
            <span className="micro mb-1 block">{t("board.service")}</span>
            <select
              className={field}
              value={form.serviceId}
              onChange={(e) => setForm({ ...form, serviceId: Number(e.target.value) })}
            >
              {services.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="micro mb-1 block">
              {t("reports.note")} <span className="lowercase">({t("common.optional")})</span>
            </span>
            <input
              className={field}
              value={form.note}
              maxLength={200}
              placeholder="Collect request timed out after 8s"
              onChange={(e) => setForm({ ...form, note: e.target.value })}
            />
          </label>
          <label className="block">
            <span className="micro mb-1 block">{t("reports.city")}</span>
            <input
              className={field}
              value={form.city}
              onChange={(e) => setForm({ ...form, city: e.target.value })}
            />
          </label>
          <div className="flex gap-2 sm:col-span-3">
            <button
              type="submit"
              disabled={busy}
              className="bg-board px-4 py-2 text-xs font-semibold text-paper disabled:opacity-60"
            >
              {busy ? t("common.loading") : t("reports.submit")}
            </button>
            <button
              type="button"
              onClick={() => setComposing(false)}
              className="border border-rule bg-card px-4 py-2 text-xs"
            >
              {t("common.cancel")}
            </button>
          </div>
        </form>
      )}

      <div className="flex gap-px border border-rule bg-rule">
        {(["all", "mine"] as const).map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => setTab(k)}
            className={`flex-1 py-2.5 font-mono text-[11px] tracking-[0.14em] uppercase ${
              tab === k ? "bg-board text-paper" : "bg-card text-ink-2 hover:text-ink"
            }`}
          >
            {k === "all" ? t("reports.all") : `${t("reports.mine")} (${mine.length})`}
          </button>
        ))}
      </div>

      {list.length === 0 ? (
        <EmptyState
          title={t("reports.empty")}
          body="Reports from Dhule, Pune, Chennai and Lucknow are what turn a row red when every probe still answers 200 OK."
          action={
            <button
              type="button"
              onClick={() => setComposing(true)}
              className="bg-danger px-4 py-2.5 text-sm font-semibold text-white"
            >
              {t("act.failing")}
            </button>
          }
        />
      ) : (
        <div className="paper-card">
          {list.map((row) => {
            const age = minutesAgo(row.report.createdAt);
            const mineRow = row.report.userId === currentUserId;
            return (
              <div
                key={row.report.id}
                className="rule-row flex flex-wrap items-start gap-x-4 gap-y-2 px-4 py-4 sm:px-5"
              >
                <Lamp aspect={row.aspect} size={18} />
                <div className="min-w-0 flex-1 basis-[220px]">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-semibold">{row.service.name}</span>
                    <Pill tone={STATE_TONE[row.report.state]}>
                      {t(`reports.state.${row.report.state}`)}
                    </Pill>
                    {row.report.state !== "withdrawn" && age <= 15 && (
                      <Pill tone="caution">within 15 min</Pill>
                    )}
                  </div>
                  {row.report.note && (
                    <p className="mt-1.5 text-[13px] leading-snug text-ink-2">
                      “{row.report.note}”
                    </p>
                  )}
                  <div className="micro mt-2">
                    {row.report.city} · {ist(new Date(row.report.createdAt))} IST ·{" "}
                    {age}m ago ·{" "}
                    {row.author
                      ? `${t("common.by")} ${row.author.name}${mineRow ? ` (${t("common.you")})` : ""}`
                      : "anonymous"}
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {row.report.userId === currentUserId &&
                    row.report.state !== "withdrawn" && (
                      <button
                        type="button"
                        onClick={() => void withdraw(row.report.id)}
                        className="border border-rule bg-card px-2.5 py-1.5 text-xs hover:border-ink/40"
                      >
                        {t("reports.withdraw")}
                      </button>
                    )}
                  {isAdmin && row.report.state === "open" && (
                    <>
                      <button
                        type="button"
                        onClick={() => void moderate(row.report.id, "confirmed")}
                        className="border border-danger/40 bg-danger/8 px-2.5 py-1.5 text-xs text-[#A81F15] hover:bg-danger/15"
                      >
                        {t("reports.confirm")}
                      </button>
                      <button
                        type="button"
                        onClick={() => void moderate(row.report.id, "dismissed")}
                        className="border border-rule bg-card px-2.5 py-1.5 text-xs hover:border-ink/40"
                      >
                        {t("reports.dismiss")}
                      </button>
                    </>
                  )}
                  <StatusStamp aspect={row.aspect} />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
