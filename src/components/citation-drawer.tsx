"use client";
import { createContext, useContext, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ExternalLink, FileText, Quote, X } from "lucide-react";

export interface Citation { docId: string; title: string; section: string; quote: string; pdf: string }
const Ctx = createContext<(c: Citation) => void>(() => {});
export const useCitation = () => useContext(Ctx);

export function CitationDrawerProvider({ children }: { children: React.ReactNode }) {
  const [c, setC] = useState<Citation | null>(null);
  return (
    <Ctx.Provider value={setC}>
      {children}
      <AnimatePresence>
        {c && (
          <>
            <motion.div className="fixed inset-0 z-50 bg-ink/20 backdrop-blur-[2px]" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setC(null)} />
            <motion.aside
              className="fixed inset-y-0 right-0 z-50 flex w-full max-w-[720px] flex-col bg-white shadow-2xl"
              initial={{ x: "100%" }} animate={{ x: 0 }} exit={{ x: "100%" }} transition={{ type: "spring", stiffness: 380, damping: 40 }}
              role="dialog" aria-label={`Source ${c.docId}`}
            >
              <div className="flex items-start gap-3 border-b border-line p-5">
                <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-brand-soft text-brand"><FileText size={17} /></div>
                <div className="min-w-0 flex-1">
                  <div className="text-[15px] font-semibold">{c.docId} · {c.section}</div>
                  <div className="truncate text-[13px] text-ink-3">{c.title}</div>
                </div>
                {c.pdf && <a href={c.pdf} target="_blank" rel="noreferrer" className="rounded-md p-2 text-ink-3 hover:bg-line-2" aria-label="Open PDF"><ExternalLink size={16} /></a>}
                <button onClick={() => setC(null)} className="rounded-md p-2 text-ink-3 hover:bg-line-2" aria-label="Close"><X size={16} /></button>
              </div>
              <motion.blockquote initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.12 }} className="m-5 mb-0 flex gap-3 rounded-xl border border-brand/15 bg-brand-soft/60 p-4 text-[13.5px] leading-relaxed text-ink">
                <Quote size={16} className="mt-0.5 shrink-0 text-brand" />
                <span>{c.quote}</span>
              </motion.blockquote>
              {c.pdf ? <iframe src={`${c.pdf}#view=FitH`} className="m-5 flex-1 rounded-xl border border-line" title={c.docId} /> : <div className="m-5 text-ink-3">No source file.</div>}
            </motion.aside>
          </>
        )}
      </AnimatePresence>
    </Ctx.Provider>
  );
}

export function CiteChip({ c, compact }: { c: Citation; compact?: boolean }) {
  const open = useCitation();
  return (
    <button onClick={() => open(c)} className="group inline-flex max-w-full items-center gap-1 rounded-md border border-line bg-white px-1.5 py-0.5 text-[11.5px] text-ink-2 transition hover:border-brand/40 hover:bg-brand-soft hover:text-brand">
      <FileText size={11} className="shrink-0" />
      <span className="truncate">{c.docId}{compact ? "" : ` · ${c.section.split(" (")[0]}`}</span>
    </button>
  );
}
