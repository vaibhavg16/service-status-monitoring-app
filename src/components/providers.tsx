"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { translate, type Locale } from "@/lib/i18n";

/* ----------------------------- toasts ----------------------------- */

type Tone = "ok" | "warn" | "bad" | "info";
type Toast = { id: number; msg: string; tone: Tone };

const ToastCtx = createContext<{
  toast: (msg: string, tone?: Tone) => void;
}>({ toast: () => {} });

export function useToast() {
  return useContext(ToastCtx);
}

/* ----------------------------- locale ----------------------------- */

const LocaleCtx = createContext<{
  locale: Locale;
  t: (key: string, vars?: Record<string, string | number>) => string;
  setLocale: (l: Locale) => void;
}>({ locale: "en", t: (k) => k, setLocale: () => {} });

export function useI18n() {
  return useContext(LocaleCtx);
}

export function Providers({
  locale: initialLocale,
  children,
}: {
  locale: Locale;
  children: ReactNode;
}) {
  const [locale, setLocaleState] = useState<Locale>(initialLocale);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const seq = useRef(0);

  const toast = useCallback((msg: string, tone: Tone = "info") => {
    const id = ++seq.current;
    setToasts((prev) => [...prev.slice(-3), { id, msg, tone }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 3600);
  }, []);

  const setLocale = useCallback((l: Locale) => {
    setLocaleState(l);
    document.cookie = `iid_locale=${l};path=/;max-age=31536000;samesite=lax`;
    document.documentElement.lang = l === "en" ? "en-IN" : `${l}-IN`;
    fetch("/api/locale", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ locale: l }),
    }).catch(() => {});
  }, []);

  useEffect(() => {
    document.documentElement.lang = locale === "en" ? "en-IN" : `${locale}-IN`;
  }, [locale]);

  const t = useCallback(
    (key: string, vars?: Record<string, string | number>) =>
      translate(locale, key, vars),
    [locale],
  );

  const value = useMemo(() => ({ locale, t, setLocale }), [locale, t, setLocale]);

  const toneClass: Record<Tone, string> = {
    ok: "border-up/40 bg-[#0E6B41] text-white",
    warn: "border-caution/50 bg-[#8F5B00] text-white",
    bad: "border-danger/40 bg-[#A81F15] text-white",
    info: "border-ink/20 bg-board text-paper",
  };

  return (
    <LocaleCtx.Provider value={value}>
      <ToastCtx.Provider value={{ toast }}>
        {children}
        <div
          className="pointer-events-none fixed inset-x-3 bottom-3 z-[70] flex flex-col items-center gap-2 sm:inset-x-auto sm:right-5 sm:bottom-5 sm:items-end"
          role="status"
          aria-live="polite"
        >
          {toasts.map((tw) => (
            <div
              key={tw.id}
              className={`toast-in pointer-events-auto max-w-[min(92vw,26rem)] rounded-sm border px-4 py-2.5 text-sm font-medium shadow-lg ${toneClass[tw.tone]}`}
            >
              {tw.msg}
            </div>
          ))}
        </div>
      </ToastCtx.Provider>
    </LocaleCtx.Provider>
  );
}
