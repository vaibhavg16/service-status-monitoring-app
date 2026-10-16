"use client";

import { useState } from "react";
import { useI18n, useToast } from "@/components/providers";
import { EmptyState, Lamp, Pill, StatusStamp } from "@/components/ui";
import { formatDuration, ist, type Aspect } from "@/lib/status";

type Event = {
  id: number;
  incidentId: number;
  at: string | Date;
  kind: string;
  body: string;
  author: string;
};

type Incident = {
  id: number;
  serviceId: number;
  title: string;
  severity: Aspect;
  state: "investigating" | "identified" | "resolved";
  startedAt: string | Date;
  resolvedAt: string | Date | null;
  cause: string;
  origin: string;
  autoClosed: boolean;
};

type Row = {
  incident: Incident;
  service: { id: number; name: string; shortName: string };
  events: Event[];
};

const STATE_TONE = { investigating: "caution", identified: "danger", resolved: "up" } as const;

export function IncidentsView({
  rows,
  isAdmin,
}: {
  rows: Row[];
  isAdmin: boolean;
}) {
  const { t } = useI18n();
  const { toast } = useToast();
  const [items, setItems] = useState<Row[]>(rows);
  const [open, setOpen] = useState<number | null>(rows[0]?.incident.id ?? null);
  const [note, setNote] = useState("");
  const [editingCause, setEditingCause] = useState<number | null>(null);
  const [causeDraft, setCauseDraft] = useState("");

  const openCount = items.filter((i) => i.incident.state !== "resolved").length;

  async function action(row: Row, body: Record<string, unknown>, okMsg: string) {
    const before = items;
    // optimistic state flip
    if (body.state) {
      setItems((p) =>
        p.map((i) =>
          i.incident.id === row.incident.id
            ? {
                ...i,
                incident: {
                  ...i.incident,
                  state: body.state as Incident["state"],
                  resolvedAt: body.state === "resolved" ? new Date() : null,
                },
              }
            : i,
        ),
      );
    }
    try {
      const res = await fetch("/api/incidents", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: row.incident.id, ...body }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || t("common.error"));
      if (data.event) {
        setItems((p) =>
          p.map((i) =>
            i.incident.id === row.incident.id
              ? {
                  ...i,
                  events: [
                    ...i.events,
                    {
                      ...data.event,
                      at: new Date(data.event.at ?? Date.now()),
                    },
                  ],
                }
              : i,
          ),
        );
      }
      toast(okMsg, "ok");
    } catch (err) {
      setItems(before);
      toast(err instanceof Error ? err.message : t("common.error"), "bad");
    }
  }

  const field =
    "w-full border border-rule bg-card px-3 py-2.5 text-sm outline-none focus:border-navy";

  return (
    <div className="space-y-5">
      <header className="relative -mx-3 overflow-hidden bg-board px-4 py-7 text-paper sm:-mx-5 sm:px-5 lg:-mx-7 lg:px-7">
        <img
          src="/images/ledger.jpg"
          alt=""
          aria-hidden="true"
          className="absolute inset-0 h-full w-full object-cover object-[60%_45%] opacity-40"
        />
        <div className="absolute inset-0 bg-gradient-to-r from-board via-board/88 to-board/40" />
        <div className="relative flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="micro !text-saffron">Log · IST</div>
            <h1 className="display mt-2 text-[clamp(1.7rem,5vw,3rem)] leading-none">
              {t("incidents.title")}
            </h1>
            <p className="mt-3 max-w-[62ch] text-sm text-paper/65">{t("incidents.lede")}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Pill tone={openCount ? "danger" : "up"}>
              {t("incidents.open")}: {openCount}
            </Pill>
            <span className="stamp !text-paper/70">Auto + manual</span>
          </div>
        </div>
      </header>

      {items.length === 0 ? (
        <EmptyState title={t("incidents.empty")} body="Every probe transition, crowd escalation and manual report lands here automatically." />
      ) : (
        <div className="space-y-3">
          {items.map((row) => {
            const ended = row.incident.resolvedAt
              ? new Date(row.incident.resolvedAt)
              : new Date();
            const duration = Math.max(
              1,
              Math.round(
                (ended.getTime() - new Date(row.incident.startedAt).getTime()) / 60000,
              ),
            );
            const isOpen = open === row.incident.id;
            return (
              <article key={row.incident.id} className="paper-card">
                <button
                  type="button"
                  onClick={() => setOpen(isOpen ? null : row.incident.id)}
                  aria-expanded={isOpen}
                  className="flex w-full flex-wrap items-start gap-x-4 gap-y-3 px-4 py-4 text-left sm:px-5"
                >
                  <Lamp
                    aspect={row.incident.severity}
                    paused={row.incident.state === "resolved"}
                    size={20}
                  />
                  <div className="min-w-0 flex-1 basis-[240px]">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-[15px] font-semibold">{row.incident.title}</h2>
                      <Pill tone={STATE_TONE[row.incident.state]}>
                        {t(`incidents.state.${row.incident.state}`)}
                      </Pill>
                      <Pill tone="neutral">
                        {row.incident.origin === "probe" ? t("incidents.auto") : t("incidents.manual")}
                      </Pill>
                    </div>
                    <div className="micro mt-2">
                      {row.service.name} · {ist(new Date(row.incident.startedAt))} IST ·{" "}
                      {t("incidents.duration")}{" "}
                      <span className="tnum">
                        {row.incident.state === "resolved" ? `${duration} ${t("common.min")}` : "ongoing"}
                      </span>
                    </div>
                    <p className="mt-2 text-[13px] leading-snug text-ink-2">
                      <span className="micro">{t("incidents.cause")}</span>{" "}
                      {row.incident.cause}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <StatusStamp aspect={row.incident.severity} paused={row.incident.state === "resolved"} />
                    <span className="micro">{isOpen ? "−" : "+"}</span>
                  </div>
                </button>

                {isOpen && (
                  <div className="border-t border-rule px-4 py-4 sm:px-5">
                    <div className="micro mb-3">Timeline</div>
                    <ol className="relative ml-1 space-y-4 border-l border-rule pl-4">
                      <li className="relative">
                        <span className="absolute -left-[21px] top-1 h-2.5 w-2.5 rounded-full bg-danger" />
                        <div className="tnum text-[11px] text-ink-3">
                          {ist(new Date(row.incident.startedAt), true)} IST · start
                        </div>
                        <div className="text-[13px]">
                          Detected {row.incident.severity.toUpperCase()} —{" "}
                          {row.incident.title}
                        </div>
                      </li>
                      {row.events.map((ev) => (
                        <li key={ev.id} className="relative">
                          <span className="absolute -left-[21px] top-1 h-2.5 w-2.5 rounded-full bg-navy" />
                          <div className="tnum text-[11px] text-ink-3">
                            {ist(new Date(ev.at), true)} IST · {ev.kind}
                          </div>
                          <div className="text-[13px] leading-snug">{ev.body}</div>
                          <div className="micro mt-0.5">
                            {ev.author === "probe-worker" || ev.author === "system"
                              ? "system"
                              : `${t("common.by")} ${ev.author}`}
                          </div>
                        </li>
                      ))}
                      {row.incident.resolvedAt && (
                        <li className="relative">
                          <span className="absolute -left-[21px] top-1 h-2.5 w-2.5 rounded-full bg-up" />
                          <div className="tnum text-[11px] text-ink-3">
                            {ist(new Date(row.incident.resolvedAt), true)} IST · resolve
                          </div>
                          <div className="text-[13px]">
                            Resolved after {duration} {t("common.min")}
                            {row.incident.autoClosed ? " (automatic recovery)" : ""}
                          </div>
                        </li>
                      )}
                    </ol>

                    <form
                      className="mt-4 flex flex-wrap gap-2"
                      onSubmit={(e) => {
                        e.preventDefault();
                        if (!note.trim()) return;
                        void action(row, { action: "event", body: note.trim() }, "Note added");
                        setNote("");
                      }}
                    >
                      <input
                        className={`${field} min-w-[200px] flex-1`}
                        value={note}
                        placeholder={t("incidents.annotate")}
                        onChange={(e) => setNote(e.target.value)}
                      />
                      <button
                        type="submit"
                        className="bg-board px-3.5 py-2 text-xs font-semibold text-paper"
                      >
                        {t("incidents.annotate")}
                      </button>
                    </form>

                    {isAdmin && (
                      <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-dashed border-rule pt-4">
                        <span className="micro">Admin</span>
                        {row.incident.state !== "resolved" ? (
                          <button
                            type="button"
                            onClick={() =>
                              void action(row, { action: "resolve", state: "resolved" }, "Incident resolved")
                            }
                            className="border border-up/40 bg-up/10 px-3 py-1.5 text-xs font-medium text-[#0E6B41] hover:bg-up/20"
                          >
                            {t("incidents.resolve")}
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() =>
                              void action(row, { action: "reopen", state: "investigating" }, "Incident reopened")
                            }
                            className="border border-rule bg-card px-3 py-1.5 text-xs hover:border-ink/40"
                          >
                            {t("incidents.reopen")}
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => {
                            setEditingCause(editingCause === row.incident.id ? null : row.incident.id);
                            setCauseDraft(row.incident.cause);
                          }}
                          className="border border-rule bg-card px-3 py-1.5 text-xs hover:border-ink/40"
                        >
                          Edit cause
                        </button>
                        <span className="tnum ml-auto text-[11px] text-ink-3">
                          #{row.incident.id} · {formatDuration(0) && `${duration}m logged`}
                        </span>
                      </div>
                    )}

                    {isAdmin && editingCause === row.incident.id && (
                      <form
                        className="mt-3 flex flex-wrap gap-2"
                        onSubmit={(e) => {
                          e.preventDefault();
                          void action(row, { action: "update", cause: causeDraft }, "Cause updated");
                          setEditingCause(null);
                        }}
                      >
                        <input
                          className={`${field} min-w-[200px] flex-1`}
                          value={causeDraft}
                          onChange={(e) => setCauseDraft(e.target.value)}
                        />
                        <button
                          type="submit"
                          className="bg-navy px-3.5 py-2 text-xs font-semibold text-white"
                        >
                          {t("common.save")}
                        </button>
                      </form>
                    )}
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
