"use client";
import { AnimatePresence, motion } from "motion/react";
import { AlertCircle, Check } from "lucide-react";
import { Spinner, cx } from "./ui";

export type StepId = "received" | "read" | "member" | "rules" | "criteria" | "outreach";
export interface StepState { step: StepId; status: "pending" | "active" | "done" | "warn"; label: string; detail?: string }

export const STEP_ORDER: { id: StepId; title: string }[] = [
  { id: "received", title: "Receipt confirmed" },
  { id: "read", title: "Read document" },
  { id: "member", title: "Member & eligibility" },
  { id: "rules", title: "Governing rules" },
  { id: "criteria", title: "Criteria check" },
  { id: "outreach", title: "Response" },
];

export function StepTimeline({ steps }: { steps: Record<StepId, StepState | undefined> }) {
  return (
    <ol className="relative space-y-1">
      {STEP_ORDER.map((s, i) => {
        const st = steps[s.id];
        const status = st?.status ?? "pending";
        return (
          <li key={s.id} className="relative flex gap-3 pb-3">
            {i < STEP_ORDER.length - 1 && (
              <span className="absolute left-[11px] top-7 h-[calc(100%-20px)] w-px bg-line">
                <motion.span className="absolute inset-x-0 top-0 bg-brand" initial={{ height: 0 }} animate={{ height: status === "done" || status === "warn" ? "100%" : 0 }} transition={{ duration: 0.4 }} />
              </span>
            )}
            <span className={cx("relative z-10 mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full border transition-colors",
              status === "pending" && "border-line bg-white", status === "active" && "border-brand/30 bg-brand-soft",
              status === "done" && "border-met bg-met text-white", status === "warn" && "border-miss bg-miss text-white")}>
              <AnimatePresence mode="wait" initial={false}>
                {status === "active" && <motion.span key="a" initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }}><Spinner className="h-3 w-3" /></motion.span>}
                {status === "done" && <motion.span key="d" initial={{ scale: 0, rotate: -45 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: "spring", stiffness: 500, damping: 20 }}><Check size={13} strokeWidth={3} /></motion.span>}
                {status === "warn" && <motion.span key="w" initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: "spring", stiffness: 500, damping: 20 }}><AlertCircle size={13} strokeWidth={2.5} /></motion.span>}
                {status === "pending" && <span key="p" className="h-1.5 w-1.5 rounded-full bg-line" />}
              </AnimatePresence>
            </span>
            <div className="min-w-0 flex-1">
              <div className={cx("text-[13px] font-medium", status === "pending" ? "text-ink-3" : "text-ink")}>{s.title}</div>
              <AnimatePresence>
                {st && st.status !== "pending" && (
                  <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} className="text-[12.5px] text-ink-2">
                    {st.label}
                    {st.detail && <div className="mt-0.5 line-clamp-2 text-[12px] text-ink-3">{st.detail}</div>}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
