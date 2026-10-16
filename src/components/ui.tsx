import type { CSSProperties, ReactNode } from "react";
import { ASPECT, type Aspect } from "@/lib/status";

/* --------------------------- aspect lamp --------------------------- */

export function Lamp({
  aspect,
  paused,
  pulse,
  size = 22,
}: {
  aspect: Aspect;
  paused?: boolean;
  pulse?: boolean;
  size?: number;
}) {
  const cls = paused ? "lamp-paused" : `lamp-${aspect}`;
  const glyph = paused ? "‖" : ASPECT[aspect].glyph;
  return (
    <span
      aria-hidden="true"
      className={`lamp ${cls} ${pulse ? "lamp-pulse" : ""}`}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.5) }}
    >
      {glyph}
    </span>
  );
}

/** Non-colour status cue: glyph + word + a stamp border. */
export function StatusStamp({
  aspect,
  paused,
  className = "",
}: {
  aspect: Aspect;
  paused?: boolean;
  className?: string;
}) {
  const color = paused
    ? "#6E655A"
    : aspect === "up"
      ? "#0E6B41"
      : aspect === "degraded"
        ? "#8F5B00"
        : "#A81F15";
  const label = paused ? "PAUSED" : ASPECT[aspect].word;
  const glyph = paused ? "‖" : ASPECT[aspect].glyph;
  return (
    <span className={`stamp ${className}`} style={{ color }}>
      <span aria-hidden="true">{glyph}</span>
      {label}
    </span>
  );
}

/* --------------------------- sparkline ----------------------------- */

export function Sparkline({
  values,
  aspect,
  width = 108,
  height = 30,
  animate = true,
}: {
  values: number[];
  aspect: Aspect;
  width?: number;
  height?: number;
  animate?: boolean;
}) {
  const stroke =
    aspect === "up" ? "#127A4A" : aspect === "degraded" ? "#C07A00" : "#C0271C";
  if (!values.length) {
    return (
      <svg width={width} height={height} aria-hidden="true" role="presentation">
        <line
          x1="0"
          y1={height - 4}
          x2={width}
          y2={height - 4}
          stroke="#DED5C4"
          strokeDasharray="3 3"
        />
      </svg>
    );
  }
  const max = Math.max(...values);
  const min = Math.min(...values);
  const span = Math.max(1, max - min);
  const pts = values.map((v, i) => {
    const x = (i / Math.max(1, values.length - 1)) * (width - 2) + 1;
    const y = height - 3 - ((v - min) / span) * (height - 6);
    return [x, y] as const;
  });
  const d = pts
    .map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`)
    .join(" ");
  const area = `${d} L${width - 1},${height} L1,${height} Z`;
  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      aria-hidden="true"
      role="presentation"
      className="overflow-visible"
    >
      <path d={area} fill={stroke} opacity="0.09" />
      <path
        d={d}
        fill="none"
        stroke={stroke}
        strokeWidth="1.5"
        strokeLinejoin="round"
        strokeLinecap="round"
        pathLength={1000}
        className={animate ? "spark-path" : undefined}
        style={{ ["--len" as string]: 1000 } as CSSProperties}
      />
      <circle
        cx={pts[pts.length - 1][0]}
        cy={pts[pts.length - 1][1]}
        r="2"
        fill={stroke}
      />
    </svg>
  );
}

/* --------------------------- primitives ---------------------------- */

export function Micro({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={`micro ${className}`}>{children}</div>;
}

export function EmptyState({
  title,
  body,
  action,
}: {
  title: string;
  body: string;
  action?: ReactNode;
}) {
  return (
    <div className="paper-card flex flex-col items-center gap-3 px-6 py-14 text-center">
      <svg width="46" height="46" viewBox="0 0 46 46" aria-hidden="true">
        <rect
          x="3.5"
          y="8.5"
          width="39"
          height="29"
          rx="2"
          fill="none"
          stroke="#DED5C4"
          strokeWidth="1.5"
        />
        <line x1="9" y1="17" x2="37" y2="17" stroke="#DED5C4" strokeWidth="1.5" />
        <line x1="9" y1="24" x2="28" y2="24" stroke="#DED5C4" strokeWidth="1.5" />
        <line x1="9" y1="31" x2="33" y2="31" stroke="#DED5C4" strokeWidth="1.5" />
        <circle cx="35" cy="31" r="3.5" fill="#E0702A" opacity="0.5" />
      </svg>
      <div className="display text-xl">{title}</div>
      <p className="max-w-sm text-sm text-ink-2">{body}</p>
      {action}
    </div>
  );
}

export function SkeletonRows({ rows = 6 }: { rows?: number }) {
  return (
    <div className="paper-card overflow-hidden">
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          className="flex items-center gap-4 px-4 py-4 sm:px-5"
          style={{ borderTop: i ? "1px solid var(--color-rule)" : undefined }}
        >
          <div className="skeleton h-5 w-5 rounded-full" />
          <div className="flex-1 space-y-2">
            <div
              className="skeleton h-3 rounded-sm"
              style={{ width: `${40 + ((i * 13) % 35)}%` }}
            />
            <div
              className="skeleton h-2.5 rounded-sm"
              style={{ width: `${25 + ((i * 7) % 25)}%` }}
            />
          </div>
          <div className="skeleton hidden h-6 w-20 rounded-sm sm:block" />
        </div>
      ))}
    </div>
  );
}

export function Pill({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "neutral" | "up" | "caution" | "danger" | "navy";
}) {
  const map = {
    neutral: "border-rule text-ink-2 bg-paper-2/60",
    up: "border-up/35 text-[#0E6B41] bg-[#127A4A]/8",
    caution: "border-caution/40 text-[#8F5B00] bg-[#C07A00]/10",
    danger: "border-danger/35 text-[#A81F15] bg-[#C0271C]/8",
    navy: "border-navy/30 text-navy bg-[#123A6B]/8",
  }[tone];
  return (
    <span
      className={`inline-flex items-center gap-1.5 border px-2 py-0.5 font-mono text-[10px] font-medium tracking-[0.12em] uppercase ${map}`}
    >
      {children}
    </span>
  );
}
