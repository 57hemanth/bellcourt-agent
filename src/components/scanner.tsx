"use client";
import { AnimatePresence, motion } from "motion/react";
import { FileText } from "lucide-react";

/** Fax preview with a sweeping scan beam while Bell reads the document. */
export function Scanner({ src, mime, scanning, done }: { src: string; mime?: string | null; scanning: boolean; done: boolean }) {
  const isPdf = mime === "application/pdf";
  return (
    <div className="relative mx-auto aspect-[8.5/11] w-full max-w-[460px] overflow-hidden rounded-xl border border-line bg-white shadow-[0_1px_2px_rgba(16,24,40,.05),0_12px_32px_-12px_rgba(16,24,40,.18)]">
      {isPdf ? (
        <div className="grid h-full place-items-center text-ink-3"><div className="flex flex-col items-center gap-2"><FileText size={40} /><span className="text-[13px]">PDF document</span></div></div>
      ) : (
        <motion.img src={src} alt="Uploaded fax" className="h-full w-full object-contain" initial={{ opacity: 0, scale: 1.02, filter: "blur(4px)" }} animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }} transition={{ duration: 0.5 }} />
      )}

      <AnimatePresence>
        {scanning && (
          <motion.div className="pointer-events-none absolute inset-0" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, transition: { duration: 0.4 } }}>
            <div className="scan-grid absolute inset-0" />
            <div className="absolute inset-0 bg-brand/[.03]" />
            <motion.div className="scan-beam absolute inset-x-0 h-24" initial={{ top: "-12%" }} animate={{ top: ["-12%", "100%"] }} transition={{ duration: 1.9, repeat: Infinity, ease: [0.45, 0, 0.55, 1] }} />
            {[["left-3 top-3", "border-l-2 border-t-2"], ["right-3 top-3", "border-r-2 border-t-2"], ["left-3 bottom-3", "border-l-2 border-b-2"], ["right-3 bottom-3", "border-r-2 border-b-2"]].map(([pos, b]) => (
              <motion.span key={pos} className={`absolute h-6 w-6 rounded-[3px] border-brand ${pos} ${b}`} animate={{ opacity: [0.4, 1, 0.4] }} transition={{ duration: 1.6, repeat: Infinity }} />
            ))}
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full bg-ink/85 px-3 py-1 text-[11.5px] font-medium text-white backdrop-blur">
              <motion.span animate={{ opacity: [1, 0.5, 1] }} transition={{ duration: 1.2, repeat: Infinity }}>Bell is reading this fax…</motion.span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {done && (
          <motion.div className="pointer-events-none absolute inset-0 ring-2 ring-inset ring-met/50" initial={{ opacity: 0 }} animate={{ opacity: [0, 1, 0] }} transition={{ duration: 1.2 }} />
        )}
      </AnimatePresence>
    </div>
  );
}
