"use client";
import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Scanner } from "./scanner";
import { StepTimeline, type StepId, type StepState } from "./step-timeline";
import { bellFetch, usePersona } from "./providers";
import type { BellCase, Fields } from "./bell-types";
import { SectionTitle } from "./ui";

const FIELD_LABELS: [keyof Fields, string][] = [
  ["patientName", "Patient"], ["patientDob", "Date of birth"], ["memberId", "Member ID"], ["requestingProvider", "Provider"],
  ["npi", "NPI"], ["serviceRequested", "Service"], ["dateOfService", "Date of service"], ["diagnosisCode", "Diagnosis"], ["urgency", "Review type"],
];

/** First open of a new fax: Bell reads it on screen, then hands over to the review workspace. */
export function ProcessingView({ c, onDone }: { c: BellCase; onDone: (c: BellCase) => void }) {
  const { persona } = usePersona();
  const [steps, setSteps] = useState<Record<StepId, StepState | undefined>>({} as Record<StepId, StepState | undefined>);
  const [fields, setFields] = useState<Fields | null>(null);
  const [phase, setPhase] = useState<"scanning" | "done" | "error">("scanning");
  const [error, setError] = useState<string | null>(null);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return; // StrictMode double-invoke guard: process once per open
    started.current = true;
    (async () => {
      try {
        const res = await bellFetch(persona, `/api/cases/${c.id}/process`, { method: "POST" });
        if (!res.ok || !res.body) throw new Error((await res.json().catch(() => ({}))).error ?? "Processing failed");
        const reader = res.body.getReader();
        const dec = new TextDecoder();
        let buf = "";
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          buf += dec.decode(value, { stream: true });
          const lines = buf.split("\n");
          buf = lines.pop() ?? "";
          for (const line of lines.filter(Boolean)) {
            const ev = JSON.parse(line);
            if (ev.type === "step") {
              setSteps((s) => ({ ...s, [ev.step]: { step: ev.step, status: ev.status, label: ev.label, detail: ev.detail } }));
              if (ev.step === "read" && ev.data?.fields) setFields(ev.data.fields);
            }
            if (ev.type === "case" && ev.case) { setPhase("done"); setTimeout(() => onDone(ev.case), 1400); }
            if (ev.type === "error") throw new Error(ev.error);
          }
        }
      } catch (e) {
        setError((e as Error).message); setPhase("error");
      }
    })();
  }, [c.id, persona, onDone]);

  return (
    <div className="grid gap-6 lg:grid-cols-12">
      <section className="card p-5 lg:col-span-5">
        <SectionTitle>Incoming fax</SectionTitle>
        <Scanner src={c.file!} mime={c.fileMime} scanning={phase === "scanning"} done={phase === "done"} />
      </section>
      <section className="space-y-5 lg:col-span-7">
        <div className="card p-5">
          <SectionTitle>Bell is processing this fax</SectionTitle>
          <StepTimeline steps={steps} />
          {error && <div className="mt-2 rounded-lg bg-fail-soft p-3 text-[13px] text-fail">{error}</div>}
        </div>
        <AnimatePresence>
          {fields && (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="card p-5">
              <SectionTitle>Read from the fax</SectionTitle>
              <dl className="grid grid-cols-1 gap-x-6 gap-y-2 text-[13px] sm:grid-cols-2">
                {FIELD_LABELS.map(([k, label], i) => (
                  <motion.div key={k} initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.06 * i }} className="flex justify-between gap-3 border-b border-line-2 pb-1.5">
                    <dt className="text-ink-3">{label}</dt>
                    <dd className={fields[k] ? "text-right font-medium" : "text-right text-miss"}>{fields[k] ?? "missing"}</dd>
                  </motion.div>
                ))}
              </dl>
            </motion.div>
          )}
        </AnimatePresence>
      </section>
    </div>
  );
}
