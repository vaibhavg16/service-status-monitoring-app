"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  Activity,
  Bell,
  ChevronLeft,
  FileWarning,
  Gauge,
  HeartPulse,
  LogOut,
  Menu,
  Radio,
  Server,
  Settings as SettingsIcon,
  Siren,
  X,
} from "lucide-react";
import { useI18n } from "@/components/providers";
import { Lamp, StatusStamp } from "@/components/ui";
import { LOCALES, LOCALE_LABEL, LOCALE_SHORT } from "@/lib/i18n";
import type { SessionUser } from "@/lib/auth";

type NavItem = {
  href: string;
  labelKey: string;
  icon: typeof Gauge;
  badge?: number;
};

function useNav(role: "merchant" | "admin") {
  const t = (k: string) => k;
  const observe: NavItem[] = [
    { href: "/", labelKey: "nav.board", icon: Gauge },
    { href: "/status", labelKey: "nav.selfhealth", icon: HeartPulse },
  ];
  const yours: NavItem[] = [
    { href: "/subscriptions", labelKey: "nav.subs", icon: Radio },
    { href: "/reports", labelKey: "nav.reports", icon: FileWarning },
    { href: "/incidents", labelKey: "nav.incidents", icon: Siren },
    { href: "/settings", labelKey: "nav.settings", icon: SettingsIcon },
  ];
  const admin: NavItem[] =
    role === "admin" ? [{ href: "/services", labelKey: "nav.services", icon: Server }] : [];
  void t;
  return { observe, yours, admin };
}

/* ---------------------------- language ---------------------------- */

function LanguageSwitcher() {
  const { locale, setLocale, t } = useI18n();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={t("top.language")}
        aria-expanded={open}
        className="flex h-9 items-center gap-1.5 border border-rule bg-card px-2.5 text-xs font-medium hover:border-ink/40 sm:px-3"
      >
        <span className="micro !text-ink-2">{t("top.language")}</span>
        <span className="font-mono text-xs font-semibold">{LOCALE_SHORT[locale]}</span>
      </button>
      {open && (
        <div className="absolute right-0 z-50 mt-1 w-44 border border-rule bg-card py-1 shadow-lg">
          {LOCALES.map((l) => (
            <button
              key={l}
              type="button"
              onClick={() => {
                setLocale(l);
                setOpen(false);
              }}
              className={`flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-paper-2 ${
                l === locale ? "font-semibold text-navy" : "text-ink"
              }`}
            >
              <span>{LOCALE_LABEL[l]}</span>
              <span className="micro">{LOCALE_SHORT[l]}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ------------------------------- bell ------------------------------ */

type BellAlert = {
  id: number;
  title: string;
  body: string;
  severity: "up" | "degraded" | "down";
  createdAt: string;
  state: string;
};

function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<BellAlert[] | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  useEffect(() => {
    if (!open) return;
    if (items) return;
    fetch("/api/notifications")
      .then((r) => r.json())
      .then((d) => setItems(d.alerts ?? []))
      .catch(() => setItems([]));
  }, [open, items]);

  const unread = (items ?? []).filter((i) => i.state === "queued" || i.state === "sent").length;

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Notifications"
        className="relative grid h-9 w-9 place-items-center border border-rule bg-card hover:border-ink/40"
      >
        <Bell size={16} strokeWidth={1.9} />
        {unread > 0 && (
          <span className="absolute -top-1.5 -right-1.5 grid h-4 min-w-4 place-items-center rounded-full bg-danger px-1 font-mono text-[9px] font-bold text-white">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>
      {open && (
        <div className="absolute right-0 z-50 mt-1 w-[min(88vw,22rem)] border border-rule bg-card shadow-xl">
          <div className="border-b border-rule px-3 py-2">
            <span className="micro">Notification log</span>
          </div>
          <div className="max-h-72 overflow-y-auto">
            {items === null && (
              <div className="space-y-2 p-3">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="skeleton h-8 rounded-sm" />
                ))}
              </div>
            )}
            {items?.length === 0 && (
              <p className="px-3 py-5 text-center text-sm text-ink-2">
                No alerts yet. Subscribe to a service to get notified.
              </p>
            )}
            {items?.map((a) => (
              <div key={a.id} className="flex gap-2.5 border-b border-rule/70 px-3 py-2.5 last:border-0">
                <Lamp aspect={a.severity} size={16} />
                <div className="min-w-0">
                  <div className="truncate text-xs font-semibold">{a.title}</div>
                  <div className="mt-0.5 line-clamp-2 text-xs text-ink-2">{a.body}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ------------------------------ nav body --------------------------- */

function NavBody({
  user,
  collapsed,
  onNavigate,
}: {
  user: SessionUser | null;
  collapsed: boolean;
  onNavigate?: () => void;
}) {
  const { observe, yours, admin } = useNav(user?.role ?? "merchant");
  const pathname = usePathname();
  const { t } = useI18n();

  const section = (label: string, items: NavItem[]) => {
    if (!items.length) return null;
    return (
      <div className="mb-4">
        {!collapsed && <div className="micro mb-2 px-3">{label}</div>}
        <ul>
          {items.map((item) => {
            const active =
              item.href === "/"
                ? pathname === "/"
                : pathname.startsWith(item.href);
            const Icon = item.icon;
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  onClick={onNavigate}
                  aria-current={active ? "page" : undefined}
                  title={collapsed ? t(item.labelKey) : undefined}
                  className={`group flex items-center gap-3 px-3 py-2.5 text-sm transition-colors ${
                    active
                      ? "bg-board text-paper font-medium"
                      : "text-ink hover:bg-paper-2"
                  }`}
                >
                  <Icon
                    size={17}
                    strokeWidth={1.8}
                    className={active ? "text-saffron" : "text-ink-2 group-hover:text-ink"}
                  />
                  {!collapsed && <span className="truncate">{t(item.labelKey)}</span>}
                  {active && !collapsed && (
                    <span className="ml-auto h-1.5 w-1.5 rounded-full bg-saffron" />
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    );
  };

  return (
    <nav className="flex-1 overflow-y-auto py-4">
      {section(t("nav.section.observe"), observe)}
      {section(t("nav.section.yours"), yours)}
      {user?.role === "admin" && section(t("nav.section.admin"), admin)}
      {!user && !collapsed && (
        <div className="mx-3 mt-6 border border-rule bg-card p-3 text-xs text-ink-2">
          <div className="micro mb-1.5">Read-only</div>
          Sign in to report a failure or subscribe to alerts.
          <Link
            href="/login"
            onClick={onNavigate}
            className="mt-2 block bg-navy px-3 py-2 text-center font-medium text-white hover:bg-navy-2"
          >
            {t("top.signIn")}
          </Link>
        </div>
      )}
    </nav>
  );
}

/* ------------------------------- shell ----------------------------- */

export function Shell({
  user,
  children,
  pageTitle,
}: {
  user: SessionUser | null;
  children: ReactNode;
  pageTitle?: string;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const [drawer, setDrawer] = useState(false);
  const { t, locale } = useI18n();
  const router = useRouter();
  const pathname = usePathname();

  const titleKey = [
    ["/subscriptions", "nav.subs"],
    ["/reports", "nav.reports"],
    ["/incidents", "nav.incidents"],
    ["/services", "nav.services"],
    ["/settings", "nav.settings"],
    ["/status", "nav.selfhealth"],
  ].reduce<string>((found, [path, key]) => {
    if (found) return found;
    if (path === "/" ? pathname === "/" : pathname.startsWith(path as string)) return key as string;
    return found;
  }, "");

  useEffect(() => {
    const saved = window.localStorage.getItem("iid_sidebar");
    if (saved === "1") setCollapsed(true);
  }, []);

  useEffect(() => setDrawer(false), [pathname]);

  const toggle = () => {
    setCollapsed((v) => {
      window.localStorage.setItem("iid_sidebar", v ? "0" : "1");
      return !v;
    });
  };

  return (
    <div className="relative z-10 min-h-dvh">
      {/* desktop rail */}
      <aside
        className={`fixed inset-y-0 left-0 z-40 hidden border-r border-rule bg-paper transition-[width] duration-200 lg:flex lg:flex-col ${
          collapsed ? "w-[72px]" : "w-[248px]"
        }`}
      >
        <div className="flex h-16 items-center gap-2 border-b border-rule px-3">
          <Mark />
          {!collapsed && (
            <div className="min-w-0 leading-tight">
              <div className="truncate text-[13px] font-semibold">{t("app.name")}</div>
              <div className="micro !text-[9px]">IN · {locale.toUpperCase()}</div>
            </div>
          )}
          <button
            type="button"
            onClick={toggle}
            aria-label="Collapse sidebar"
            className="ml-auto grid h-7 w-7 place-items-center border border-rule text-ink-2 hover:border-ink/40 hover:text-ink"
          >
            <ChevronLeft
              size={14}
              className={`transition-transform ${collapsed ? "rotate-180" : ""}`}
            />
          </button>
        </div>
        <NavBody user={user} collapsed={collapsed} />
        <div className="border-t border-rule px-3 py-3">
          <SessionFooter user={user} collapsed={collapsed} />
        </div>
      </aside>

      {/* mobile drawer */}
      {drawer && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            aria-label="Close menu"
            className="absolute inset-0 bg-board/55"
            onClick={() => setDrawer(false)}
          />
          <div className="absolute inset-y-0 left-0 flex w-[82vw] max-w-[300px] flex-col border-r border-rule bg-paper">
            <div className="flex h-16 items-center gap-2 border-b border-rule px-3">
              <Mark />
              <div className="min-w-0 leading-tight">
                <div className="truncate text-[13px] font-semibold">{t("app.name")}</div>
                <div className="micro !text-[9px]">IN · {locale.toUpperCase()}</div>
              </div>
              <button
                type="button"
                onClick={() => setDrawer(false)}
                aria-label="Close"
                className="ml-auto grid h-8 w-8 place-items-center border border-rule"
              >
                <X size={15} />
              </button>
            </div>
            <NavBody user={user} collapsed={false} onNavigate={() => setDrawer(false)} />
            <div className="border-t border-rule px-3 py-3">
              <SessionFooter user={user} collapsed={false} />
            </div>
          </div>
        </div>
      )}

      <div className={`transition-[padding] ${collapsed ? "lg:pl-[72px]" : "lg:pl-[248px]"}`}>
        <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b border-rule bg-paper/92 px-3 backdrop-blur sm:px-5 lg:h-16">
          <button
            type="button"
            onClick={() => setDrawer(true)}
            aria-label="Open menu"
            className="grid h-9 w-9 place-items-center border border-rule bg-card lg:hidden"
          >
            <Menu size={17} />
          </button>
          <div className="min-w-0">
            <div className="micro hidden sm:block">Is It Down, India?</div>
            <div className="truncate text-sm font-semibold sm:text-base">
              {pageTitle ?? t(titleKey || "nav.board")}
            </div>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <div className="hidden items-center gap-1.5 border border-rule bg-card px-2.5 py-1.5 sm:flex">
              <span className="h-1.5 w-1.5 rounded-full bg-up blink" />
              <span className="micro !text-ink-2">live · 30s</span>
            </div>
            <LanguageSwitcher />
            <NotificationBell />
          </div>
        </header>
        <main className="mx-auto w-full max-w-[1440px] px-3 pb-24 pt-5 sm:px-5 lg:px-7 lg:pb-14">
          {children}
        </main>
      </div>
    </div>
  );
}

/**
 * Nudges signed-in users to bind their Telegram chat. Without it the bot is
 * not allowed to message them, so their subscriptions would never fire.
 */
function ConnectBanner() {
  const { t } = useI18n();
  const router = useRouter();
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (window.localStorage.getItem("iid_tg_banner") === "1") setDismissed(true);
  }, []);

  if (dismissed) return null;

  const hide = () => {
    window.localStorage.setItem("iid_tg_banner", "1");
    setDismissed(true);
  };

  return (
    <div className="mb-5 flex flex-wrap items-center gap-3 border border-saffron/45 bg-saffron/8 px-4 py-3">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="#123A6B" aria-hidden="true" className="flex-none">
        <path d="M21.9 4.3 18.6 20c-.2 1.1-.9 1.3-1.8.8l-5-3.7-2.4 2.3c-.3.3-.5.5-1 .5l.4-5.1L18 5.4c.4-.3-.1-.5-.6-.2L6.7 12.1l-4.9-1.5c-1.1-.3-1.1-1 .2-1.5l19.2-7.4c.9-.3 1.7.2 1.4 1.6z" />
      </svg>
      <p className="min-w-0 flex-1 text-[13px] leading-snug">
        <strong className="font-semibold">Get alerts on Telegram.</strong>{" "}
        <span className="text-ink-2">
          Connect this account to the bot — then subscribe to a service and get a
          message the moment it goes slow, down, or recovers.
        </span>
      </p>
      <Link
        href="/settings"
        className="bg-navy px-3 py-2 text-xs font-semibold whitespace-nowrap text-white hover:bg-navy-2"
      >
        {t("settings.telegramConnect")}
      </Link>
      <button
        type="button"
        onClick={hide}
        aria-label={t("common.close")}
        className="grid h-7 w-7 flex-none place-items-center border border-rule text-ink-2 hover:text-ink"
      >
        <X size={13} />
      </button>
    </div>
  );
}

function SessionFooter({
  user,
  collapsed,
}: {
  user: SessionUser | null;
  collapsed: boolean;
}) {
  const { t } = useI18n();
  const router = useRouter();
  if (!user) {
    return collapsed ? (
      <Link href="/login" className="grid h-8 w-8 place-items-center bg-navy text-white">
        →
      </Link>
    ) : (
      <Link
        href="/login"
        className="block bg-navy px-3 py-2.5 text-center text-sm font-medium text-white hover:bg-navy-2"
      >
        {t("top.signIn")}
      </Link>
    );
  }
  const initials = user.name
    .split(" ")
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
  return (
    <div className={`flex items-center gap-2.5 ${collapsed ? "justify-center" : ""}`}>
      <span className="grid h-8 w-8 flex-none place-items-center bg-board font-mono text-[11px] font-bold text-saffron">
        {initials}
      </span>
      {!collapsed && (
        <div className="min-w-0 flex-1">
          <div className="truncate text-xs font-semibold">{user.name}</div>
          <div className="micro !text-[9px]">
            {user.role === "admin" ? t("auth.roleAdmin") : t("auth.roleMerchant")}
          </div>
        </div>
      )}
      {!collapsed && (
        <button
          type="button"
          onClick={async () => {
            await fetch("/api/auth/logout", { method: "POST" });
            router.push("/");
            router.refresh();
          }}
          aria-label={t("top.signOut")}
          className="grid h-7 w-7 place-items-center border border-rule text-ink-2 hover:border-ink/40 hover:text-ink"
        >
          <LogOut size={13} />
        </button>
      )}
    </div>
  );
}

export function Mark({ size = 26 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      aria-label="Is It Down India"
      role="img"
      className="flex-none"
    >
      <rect width="32" height="32" rx="3" fill="#16130E" />
      <rect x="4" y="7" width="24" height="2.6" rx="1.3" fill="#DED5C4" opacity="0.35" />
      <circle cx="8.5" cy="16" r="3.1" fill="#127A4A" />
      <circle cx="16" cy="16" r="3.1" fill="#C07A00" />
      <circle cx="23.5" cy="16" r="3.1" fill="#C0271C" />
      <rect x="4" y="22.4" width="24" height="2.6" rx="1.3" fill="#E0702A" />
    </svg>
  );
}

export { StatusStamp, Activity };
