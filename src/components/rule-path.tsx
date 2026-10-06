"use client";
import { motion } from "motion/react";
import type { RuleStep } from "./bell-types";
import { CiteChip } from "./citation-drawer";
import { Badge, cx } from "./ui";

const LEVEL = ["", "Law & regulation", "Plan / delegation", "Medical policy", "Memos & job aids"];
const EFFECT: Record<string, { label: string; tone: "met" | "brand" | "neutral" | "fail"; strike?: boolean }> = {
  APPLIES: { label: "Applies", tone: "met" },
  OVERRIDES: { label: "Overrides policy", tone: "brand" },
  NOT_APPLICABLE: { label: "Overridden", tone: "neutral", strike: true },
  SUPERSEDED: { label: "Superseded", tone: "neutral", strike: true },
  VOID: { label: "Void (GOV-01 §1)", tone: "fail", strike: true },
};

/** GOV-01 hierarchy of authority, drawn as the path Bell walked for this case. */
export function RulePath({ steps }: { steps: RuleStep[] }) {
  const levels = [1, 2, 3, 4].filter((l) => steps.some((s) => s.level === l));
  let k = 0;
  return (
    <div className="space-y-3">
      {levels.map((l) => (
        <div key={l} className="relative grid grid-cols-[28px_minmax(0,1fr)] gap-3">
          <div className="flex flex-col items-center">
            <span className="grid h-7 w-7 place-items-center rounded-full border border-line bg-white text-[12px] font-semibold text-ink-2">{l}</span>
            <span className="mt-1 w-px flex-1 bg-line" />
          </div>
          <div className="pb-1">
            <div className="mb-1.5 text-[11.5px] font-semibold uppercase tracking-[.08em] text-ink-3">{LEVEL[l]}</div>
            <div className="space-y-1.5">
              {steps.filter((s) => s.level === l).map((s) => {
                const e = EFFECT[s.effect] ?? EFFECT.APPLIES;
                return (
                  <motion.div key={s.docId + s.summary} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.04 * k++ }}
                    className={cx("rounded-lg border px-3 py-2", e.tone === "fail" ? "border-fail/20 bg-fail-soft/40" : e.strike ? "border-line bg-canvas/60" : "border-line bg-white")}>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={cx("text-[13px] font-medium", e.strike && "text-ink-3 line-through decoration-ink-3/50")}>{s.docId}</span>
                      <Badge tone={e.tone}>{e.label}</Badge>
                      {s.citation && <span className="ml-auto"><CiteChip c={s.citation} compact /></span>}
                    </div>
                    <div className="mt-0.5 text-[12.5px] text-ink-2">{s.summary}</div>
                  </motion.div>
                );
              })}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
