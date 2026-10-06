"use client";
import { motion } from "motion/react";
import { ArrowRight, ShieldCheck, Stethoscope, UserRound } from "lucide-react";
import { PERSONAS, usePersona } from "./providers";
import { BellMark } from "./ui";

export function PersonaLogin() {
  const { setPersona } = usePersona();
  return (
    <div className="mx-auto max-w-3xl py-10">
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="mb-8 text-center">
        <div className="mx-auto mb-4 w-fit"><BellMark size={44} /></div>
        <h1 className="text-[26px] font-semibold tracking-tight">Bell clinical console</h1>
        <p className="mt-1 text-[14px] text-ink-2">Sign in as a reviewer. What you see and what you can do follows your role.</p>
      </motion.div>
      <div className="grid gap-6 sm:grid-cols-2">
        {(["nurse", "physician"] as const).map((role, gi) => (
          <div key={role}>
            <div className="mb-2 flex items-center gap-2 text-[12px] font-semibold uppercase tracking-[.08em] text-ink-3">
              {role === "nurse" ? <UserRound size={14} /> : <Stethoscope size={14} />} {role === "nurse" ? "Nurse reviewers" : "Physician reviewers"}
            </div>
            <div className="space-y-2">
              {PERSONAS.filter((p) => p.role === role).map((p, i) => (
                <motion.button key={p.id} onClick={() => setPersona(p)} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.08 * (gi * 2 + i) }} whileHover={{ y: -2 }}
                  className="card group flex w-full items-center gap-3 p-4 text-left transition hover:border-brand/40 hover:shadow-[0_8px_24px_-12px_rgba(47,91,234,.35)]">
                  <div className="grid h-10 w-10 place-items-center rounded-full bg-ink text-[13px] font-semibold text-white">{p.name.replace("Dr. ", "").split(" ").map((x) => x[0]).slice(0, 2).join("")}</div>
                  <div className="min-w-0 flex-1">
                    <div className="text-[14px] font-medium">{p.name}</div>
                    <div className="text-[12px] text-ink-3">{p.title}</div>
                  </div>
                  <ArrowRight size={16} className="text-ink-3 transition group-hover:translate-x-0.5 group-hover:text-brand" />
                </motion.button>
              ))}
            </div>
            <ul className="mt-3 space-y-1 text-[12px] text-ink-3">
              {role === "nurse" ? (
                <><li>• Sees the fax, extracted fields and cited criteria</li><li>• Can approve, request information or route to a physician</li><li>• Cannot deny (Riverbend §4)</li></>
              ) : (
                <><li>• Sees the full record, facts, audit trail and letter draft</li><li>• Can approve or deny with a rationale</li><li>• Arizona MA denials need an AZ licence</li></>
              )}
            </ul>
          </div>
        ))}
      </div>
      <div className="mt-8 flex items-center justify-center gap-2 text-[12px] text-ink-3"><ShieldCheck size={14} /> Demo sign-in. Production uses Entra ID roles; every action is written to the audit trail.</div>
    </div>
  );
}
