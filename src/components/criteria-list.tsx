"use client";
import { motion } from "motion/react";
import type { Crit } from "./bell-types";
import { CiteChip } from "./citation-drawer";
import { StatusIcon, cx } from "./ui";

export function CriteriaList({ items, logic }: { items: Crit[]; logic?: string | null }) {
  const orSatisfied = !!logic && logic.includes("OR") && items.some((c) => c.status === "MET");
  return (
    <div className="space-y-2">
      {logic && <div className="text-[12px] text-ink-3">Combine as <span className="mono rounded bg-line-2 px-1.5 py-0.5 text-ink-2">{logic}</span>{orSatisfied && " — one branch is enough"}</div>}
      {items.map((c, i) => {
        const muted = orSatisfied && c.status !== "MET";
        return (
        <motion.div key={c.id + i} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 * i }}
          className={cx("rounded-lg border p-3", muted ? "border-line bg-canvas/50 opacity-70" : c.status === "MET" ? "border-met/20" : c.status === "NOT_MET" ? "border-fail/25 bg-fail-soft/30" : "border-miss/25 bg-miss-soft/30")}>
          <div className="flex items-start gap-2.5">
            {muted ? <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-line-2 text-[10px] text-ink-3">or</span> : <StatusIcon status={c.status} />}
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[13.5px] font-medium">{c.label}</span>
                <span className={cx("text-[11px] font-semibold uppercase tracking-wide", muted ? "text-ink-3" : c.status === "MET" ? "text-met" : c.status === "NOT_MET" ? "text-fail" : "text-miss")}>{muted ? "Not needed" : c.status.replace("_", " ")}</span>
                <span className="ml-auto"><CiteChip c={c.citation} /></span>
              </div>
              <div className="mt-1 text-[12.5px] italic text-ink-3">“{c.citation.quote}”</div>
              {c.evidence ? (
                <div className="mt-1.5 rounded-md bg-canvas px-2 py-1.5 text-[12.5px] text-ink-2"><span className="mr-1 font-medium not-italic text-ink">Evidence:</span>{c.evidence}</div>
              ) : c.status === "MISSING" && !muted ? (
                <div className="mt-1.5 text-[12px] text-miss">Not documented in the request.</div>
              ) : null}
            </div>
          </div>
        </motion.div>
        );
      })}
    </div>
  );
}
