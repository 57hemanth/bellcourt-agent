"use client";
import { motion } from "motion/react";
import { clsx } from "clsx";
import { useEffect, useState } from "react";
import { AlertTriangle, Check, CircleDashed, Clock, X } from "lucide-react";

export const cx = clsx;

export function BellMark({ size = 26 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden>
      <rect width="32" height="32" rx="9" fill="#0b1220" />
      <path d="M16 7.5c-3.6 0-6 2.7-6 6.3v4.4l-1.6 2.6c-.3.5.1 1.2.7 1.2h13.8c.6 0 1-.7.7-1.2L22 18.2v-4.4c0-3.6-2.4-6.3-6-6.3Z" fill="#fff" />
      <circle cx="16" cy="24.6" r="1.9" fill="#2f5bea" />
    </svg>
  );
}

export function Button({ variant = "primary", className, ...p }: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" | "ghost" | "danger" | "success" }) {
  return (
    <button
      {...p}
      className={cx(
        "inline-flex items-center justify-center gap-1.5 rounded-lg px-3.5 py-2 text-[13px] font-medium transition active:scale-[.98] disabled:pointer-events-none disabled:opacity-50",
        variant === "primary" && "bg-ink text-white hover:bg-ink/90",
        variant === "secondary" && "border border-line bg-white text-ink hover:bg-line-2",
        variant === "ghost" && "text-ink-2 hover:bg-line-2",
        variant === "danger" && "bg-fail text-white hover:bg-fail/90",
        variant === "success" && "bg-met text-white hover:bg-met/90",
        className,
      )}
    />
  );
}

type Tone = "neutral" | "brand" | "met" | "miss" | "fail" | "ink";
export function Badge({ tone = "neutral", children, className }: { tone?: Tone; children: React.ReactNode; className?: string }) {
  return (
    <span className={cx("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11.5px] font-medium",
      tone === "neutral" && "bg-line-2 text-ink-2", tone === "brand" && "bg-brand-soft text-brand", tone === "met" && "bg-met-soft text-met",
      tone === "miss" && "bg-miss-soft text-miss", tone === "fail" && "bg-fail-soft text-fail", tone === "ink" && "bg-ink text-white", className)}>
      {children}
    </span>
  );
}

export const REC_META: Record<string, { label: string; tone: Tone }> = {
  RECOMMEND_APPROVE: { label: "Recommend approve", tone: "met" },
  PEND_FOR_INFO: { label: "Info requested", tone: "miss" },
  ROUTE_TO_PHYSICIAN: { label: "Route to physician", tone: "fail" },
  ELIGIBILITY_HOLD: { label: "Eligibility hold", tone: "neutral" },
};
export const STATUS_META: Record<string, { label: string; tone: Tone }> = {
  RECEIVED: { label: "New · unread", tone: "brand" },
  PENDED_INFO_REQUESTED: { label: "Pended · info requested", tone: "miss" },
  AWAITING_NURSE_REVIEW: { label: "Awaiting nurse", tone: "brand" },
  ROUTED_TO_PHYSICIAN: { label: "With physician", tone: "fail" },
  ELIGIBILITY_HOLD: { label: "Eligibility hold", tone: "neutral" },
  APPROVED: { label: "Approved", tone: "met" },
  DENIED: { label: "Denied", tone: "ink" },
};

export function StatusIcon({ status }: { status: "MET" | "NOT_MET" | "MISSING" }) {
  const m = { MET: ["bg-met-soft text-met", <Check key="c" size={12} strokeWidth={3} />], NOT_MET: ["bg-fail-soft text-fail", <X key="x" size={12} strokeWidth={3} />], MISSING: ["bg-miss-soft text-miss", <CircleDashed key="d" size={12} strokeWidth={2.5} />] }[status] as [string, React.ReactNode];
  return <span className={cx("grid h-5 w-5 shrink-0 place-items-center rounded-full", m[0])}>{m[1]}</span>;
}

export function useNow(intervalMs = 30_000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), intervalMs); return () => clearInterval(t); }, [intervalMs]);
  return now;
}

/** Time left on the regulatory clock (counted from receipt). Demo "now" can be pinned via ?asof. */
export function DueClock({ receivedAt, dueAt, slaHours, now, compact }: { receivedAt: string; dueAt: string; slaHours: number; now: number; compact?: boolean }) {
  const total = slaHours * 3600_000;
  const left = new Date(dueAt).getTime() - now;
  const frac = Math.max(0, Math.min(1, left / total));
  const tone = left < 0 ? "text-fail" : frac < 0.25 ? "text-miss" : "text-ink-2";
  const stroke = left < 0 ? "#d92d4b" : frac < 0.25 ? "#c27803" : "#2f5bea";
  const abs = Math.abs(left);
  const label = abs > 48 * 3600_000 ? `${Math.round(abs / 86400_000)}d` : `${Math.round(abs / 3600_000)}h`;
  const r = 8, C = 2 * Math.PI * r;
  return (
    <span className={cx("inline-flex items-center gap-1.5 text-[12px] tabular-nums", tone)} title={`Received ${new Date(receivedAt).toUTCString()} · due ${new Date(dueAt).toUTCString()}`}>
      <svg width="20" height="20" viewBox="0 0 20 20" className="-rotate-90">
        <circle cx="10" cy="10" r={r} fill="none" stroke="#e6e8ee" strokeWidth="2.5" />
        <motion.circle cx="10" cy="10" r={r} fill="none" stroke={stroke} strokeWidth="2.5" strokeLinecap="round" strokeDasharray={C} initial={{ strokeDashoffset: C }} animate={{ strokeDashoffset: C * (1 - frac) }} transition={{ duration: 0.9, ease: "easeOut" }} />
      </svg>
      {left < 0 ? `${label} overdue` : compact ? label : `${label} left`}
    </span>
  );
}

export function Spinner({ className }: { className?: string }) {
  return <motion.span className={cx("inline-block h-3.5 w-3.5 rounded-full border-2 border-brand/25 border-t-brand", className)} animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 0.8, ease: "linear" }} />;
}

export function SeverityIcon({ severity }: { severity: string }) {
  return severity === "critical" ? <AlertTriangle size={15} className="shrink-0 text-fail" /> : severity === "warning" ? <AlertTriangle size={15} className="shrink-0 text-miss" /> : <Clock size={15} className="shrink-0 text-brand" />;
}

export function SectionTitle({ children, right }: { children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div className="mb-3 flex items-center justify-between">
      <h3 className="text-[12px] font-semibold uppercase tracking-[.08em] text-ink-3">{children}</h3>
      {right}
    </div>
  );
}

export function CountUp({ value, className }: { value: number; className?: string }) {
  const [v, setV] = useState(0);
  useEffect(() => {
    let raf = 0; const start = performance.now();
    const tick = (t: number) => { const p = Math.min(1, (t - start) / 700); setV(Math.round(value * (1 - Math.pow(1 - p, 3)))); if (p < 1) raf = requestAnimationFrame(tick); };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value]);
  return <span className={className}>{v}</span>;
}
