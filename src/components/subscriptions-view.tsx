"use client";

import Link from "next/link";
import { useState } from "react";
import { useI18n, useToast } from "@/components/providers";
import { EmptyState, Lamp, StatusStamp } from "@/components/ui";
import type { SubscriptionRow, ServiceRow } from "@/lib/queries";
import type { Aspect } from "@/lib/status";

type SubEntry = { sub: SubscriptionRow; service: ServiceRow; aspect: Aspect };
type ServiceOption = {
  id: number;
  slug: string;
  name: string;
  shortName: string;
  provider: string;
  aspect: Aspect;
  paused: boolean;
};

const CHANNELS = ["telegram", "sms", "whatsapp"] as const;

export function SubscriptionsView({
  rows,
  services,
  telegramHandle,
}: {
  rows: SubEntry[];
  services: ServiceOption[];
  telegramHandle: string | null;
}) {
  const { t } = useI18n();
  const { toast } = useToast();
  const [items, setItems] = useState(rows);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({
    serviceId: services[0]?.id ?? 0,
    channel: "telegram" as (typeof CHANNELS)[number],
    minSeverity: "degraded" as "degraded" | "down",
  });

  const subscribedIds = new Set(items.map((i) => i.sub.serviceId));
  const available = services.filter((s) => !subscribedIds.has(s.id));

  async function add(e: React.FormEvent) {
    e.preventDefault();
    const service = services.find((s) => s.id === form.serviceId);
    if (!service) return;
    const optimistic: SubEntry = {
      sub: {
        id: -Date.now(),
        userId: 0,
        serviceId: service.id,
        channel: form.channel,
        minSeverity: form.minSeverity,
        active: true,
        createdAt: new Date(),
      },
      service: {
        id: service.id,
        slug: service.slug,
        name: service.name,
        shortName: service.shortName,
        provider: service.provider,
        paused: service.paused,
      } as unknown as ServiceRow,
      aspect: service.aspect,
    };
    setItems((p) => [...p, optimistic]);
    setAdding(false);
    try {
      const res = await fetch("/api/subscriptions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setItems((p) =>
        p.map((i) =>
          i.sub.id === optimistic.sub.id
            ? { sub: data.sub, service: i.service, aspect: i.aspect }
            : i,
        ),
      );
      toast(t("subs.created"), "ok");
    } catch (err) {
      setItems((p) => p.filter((i) => i.sub.id !== optimistic.sub.id));
      setAdding(true);
      toast(err instanceof Error ? err.message : t("common.error"), "bad");
    }
  }

  async function update(sub: SubscriptionRow, patch: Record<string, unknown>) {
    const before = items;
    setItems((p) =>
      p.map((i) => (i.sub.id === sub.id ? { ...i, sub: { ...i.sub, ...patch } as SubscriptionRow } : i)),
    );
    try {
      const res = await fetch("/api/subscriptions", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: sub.id, ...patch }),
      });
      if (!res.ok) throw new Error();
      toast(t("subs.updated"), "ok");
    } catch {
      setItems(before);
      toast(t("common.error"), "bad");
    }
  }

  async function remove(sub: SubscriptionRow) {
    const before = items;
    setItems((p) => p.filter((i) => i.sub.id !== sub.id));
    try {
      const res = await fetch("/api/subscriptions", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: sub.id }),
      });
      if (!res.ok) throw new Error();
      toast(t("subs.deleted"), "info");
    } catch {
      setItems(before);
      toast(t("common.error"), "bad");
    }
  }

  const field =
    "w-full border border-rule bg-card px-3 py-2.5 text-sm outline-none focus:border-navy";

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_290px]">
      <div>
        <div className="mb-3 flex items-center justify-between gap-3">
          <span className="micro">
            {t("subs.count", { n: items.filter((i) => i.sub.active).length })}
          </span>
          <button
            type="button"
            onClick={() => setAdding((v) => !v)}
            className="bg-navy px-3.5 py-2 text-xs font-semibold text-white hover:bg-navy-2"
          >
            + {t("subs.add")}
          </button>
        </div>

        {adding && (
          <form onSubmit={add} className="paper-card mb-4 grid gap-3 p-4 sm:grid-cols-4">
            <label className="block sm:col-span-2">
              <span className="micro mb-1 block">{t("board.service")}</span>
              <select
                className={field}
                value={form.serviceId}
                onChange={(e) => setForm({ ...form, serviceId: Number(e.target.value) })}
              >
                {(available.length ? available : services).map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="micro mb-1 block">{t("subs.channel")}</span>
              <select
                className={field}
                value={form.channel}
                onChange={(e) =>
                  setForm({ ...form, channel: e.target.value as typeof form.channel })
                }
              >
                {CHANNELS.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="micro mb-1 block">{t("subs.severity")}</span>
              <select
                className={field}
                value={form.minSeverity}
                onChange={(e) =>
                  setForm({
                    ...form,
                    minSeverity: e.target.value as typeof form.minSeverity,
                  })
                }
              >
                <option value="degraded">{t("subs.severity.degraded")}</option>
                <option value="down">{t("subs.severity.down")}</option>
              </select>
            </label>
            <div className="flex gap-2 sm:col-span-4">
              <button
                type="submit"
                className="bg-board px-4 py-2 text-xs font-semibold text-paper hover:bg-board-2"
              >
                {t("common.save")}
              </button>
              <button
                type="button"
                onClick={() => setAdding(false)}
                className="border border-rule bg-card px-4 py-2 text-xs"
              >
                {t("common.cancel")}
              </button>
            </div>
          </form>
        )}

        {items.length === 0 ? (
          <EmptyState
            title={t("subs.empty")}
            body="Alerts go to Telegram the moment a service you care about turns amber or red. Two taps to set up."
            action={
              <Link
                href="/"
                className="bg-navy px-4 py-2.5 text-sm font-semibold text-white hover:bg-navy-2"
              >
                {t("subs.emptyCta")}
              </Link>
            }
          />
        ) : (
          <div className="paper-card">
            {items.map(({ sub, service, aspect }) => (
              <div
                key={sub.id}
                className="rule-row flex flex-wrap items-center gap-x-4 gap-y-3 px-4 py-4 sm:px-5"
              >
                <Lamp aspect={aspect} paused={service.paused} />
                <div className="min-w-0 flex-1 basis-[180px]">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-semibold">{service.name}</span>
                    <StatusStamp aspect={aspect} paused={service.paused} />
                  </div>
                  <div className="micro mt-1">{service.provider}</div>
                </div>

                <label className="flex items-center gap-2">
                  <span className="micro sm:hidden">{t("subs.channel")}</span>
                  <select
                    value={sub.channel}
                    onChange={(e) => update(sub, { channel: e.target.value })}
                    className="border border-rule bg-card px-2 py-1.5 text-xs"
                  >
                    {CHANNELS.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="flex items-center gap-2">
                  <select
                    value={sub.minSeverity}
                    onChange={(e) => update(sub, { minSeverity: e.target.value })}
                    className="border border-rule bg-card px-2 py-1.5 text-xs"
                  >
                    <option value="degraded">{t("subs.severity.degraded")}</option>
                    <option value="down">{t("subs.severity.down")}</option>
                  </select>
                </label>

                <label className="flex items-center gap-2 text-xs text-ink-2">
                  <input
                    type="checkbox"
                    checked={sub.active}
                    onChange={(e) => update(sub, { active: e.target.checked })}
                    className="h-4 w-4 accent-[#123A6B]"
                  />
                  {sub.active ? "Active" : "Paused"}
                </label>

                <button
                  type="button"
                  onClick={() => void remove(sub)}
                  className="ml-auto border border-rule bg-card px-2.5 py-1.5 text-xs text-ink-2 hover:border-danger/50 hover:text-[#A81F15]"
                >
                  {t("services.delete")}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start">
        <div className="paper-card p-4">
          <div className="micro">{t("subs.next")}</div>
          <div className="mt-2 flex items-center gap-2">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="#123A6B" aria-hidden="true">
              <path d="M21.9 4.3 18.6 20c-.2 1.1-.9 1.3-1.8.8l-5-3.7-2.4 2.3c-.3.3-.5.5-1 .5l.4-5.1L18 5.4c.4-.3-.1-.5-.6-.2L6.7 12.1l-4.9-1.5c-1.1-.3-1.1-1 .2-1.5l19.2-7.4c.9-.3 1.7.2 1.4 1.6z" />
            </svg>
            <span className="text-sm font-medium">
              {telegramHandle ? `@${telegramHandle}` : "Telegram"}
            </span>
          </div>
          <p className="mt-2 text-xs leading-relaxed text-ink-2">
            {telegramHandle
              ? "Connected. Alerts land here within seconds of a status change."
              : "Not connected yet — alerts queue in the outbox and appear in your notification bell."}
          </p>
          {!telegramHandle && (
            <Link
              href="/settings"
              className="mt-3 inline-block border border-rule bg-card px-3 py-2 text-xs hover:border-ink/40"
            >
              {t("settings.telegramConnect")}
            </Link>
          )}
        </div>

        <div className="paper-card p-4">
          <div className="micro">How alerts fire</div>
          <ol className="mt-2 space-y-2 text-xs leading-relaxed text-ink-2">
            <li>
              <span className="tnum text-ink">01</span> · Probe or crowd report
              changes a service.
            </li>
            <li>
              <span className="tnum text-ink">02</span> · Fan-out worker matches
              your subscription and severity.
            </li>
            <li>
              <span className="tnum text-ink">03</span> · Message queued to
              Telegram, SMS or WhatsApp.
            </li>
          </ol>
        </div>
      </aside>
    </div>
  );
}
