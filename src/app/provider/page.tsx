"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ArrowRight, CheckCircle2, CircleAlert, FileUp, Inbox, MessageSquareText, RotateCcw, Send, ShieldCheck } from "lucide-react";
import { CiteChip, type Citation } from "@/components/citation-drawer";
import { Badge, Button, DueClock, SectionTitle, cx, useNow } from "@/components/ui";
import { VoiceAgent } from "@/components/voice-agent";

interface ProviderCase {
  id: string; channel: string; receivedAt: string; dueAt: string; slaHours: number; status: string; statusLabel: string; file: string | null;
  service: string | null; patientName: string | null; dateOfService: string | null; requestingProvider: string | null;
  missing: { item: string; why: string; citation?: Citation }[];
  messages: { at: string; from: "bell" | "provider" | "bellcourt"; body: string }[];
  decision: { outcome: string; at: string; note: string } | null;
}

type Phase = "idle" | "uploading" | "uploaded" | "error";

export default function ProviderPortal() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [preview, setPreview] = useState<{ src: string; mime: string; name: string } | null>(null);
  const [result, setResult] = useState<ProviderCase | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cases, setCases] = useState<ProviderCase[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);
  const [drag, setDrag] = useState(false);
  const [tab, setTab] = useState<"submit" | "voice">("submit");
  const input = useRef<HTMLInputElement>(null);
  const now = useNow();

  const refresh = useCallback(() => {
    fetch("/api/cases", { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).then((d) => d && setCases(d));
  }, []);
  // Poll so questions from Bellcourt appear without a reload.
  useEffect(() => {
    const first = setTimeout(refresh, 0);
    const t = setInterval(refresh, 6000);
    return () => { clearTimeout(first); clearInterval(t); };
  }, [refresh]);

  async function submit(file: File) {
    setError(null); setResult(null);
    setPreview({ src: URL.createObjectURL(file), mime: file.type, name: file.name });
    setPhase("uploading");
    const fd = new FormData();
    fd.append("file", file);
    try {
      const [res] = await Promise.all([fetch("/api/intake", { method: "POST", body: fd }), new Promise((r) => setTimeout(r, 900))]);
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? `Upload failed (${res.status})`);
      setResult(j); setPhase("uploaded"); setOpenId(j.id); refresh();
    } catch (e) {
      setError((e as Error).message);
      setPhase("error");
    }
  }

  const reset = () => { setPhase("idle"); setPreview(null); setResult(null); setError(null); };

  return (
    <div className="space-y-6">
      <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[26px] font-semibold tracking-tight">{tab === "submit" ? "Submit a prior authorization" : "Call Bell"}</h1>
          <p className="mt-1 max-w-2xl text-[14px] text-ink-2">{tab === "submit"
            ? "Upload a faxed or scanned request. Bell confirms receipt instantly, checks it against your patient\u2019s plan, and tells you exactly what\u2019s still needed — no phone call required."
            : "Ask about any request by voice. Bell verifies the case number and the patient\u2019s date of birth, then tells you where it stands and what\u2019s still needed."}</p>
        </div>
        <div className="flex flex-col items-end gap-3">
          <nav className="relative flex rounded-full bg-line-2 p-1" aria-label="Provider tools">
            {([["submit", "Submit request"], ["voice", "Voice agent"]] as const).map(([id, label]) => (
              <button key={id} onClick={() => setTab(id)} className="relative px-4 py-1.5 text-[13px] font-medium">
                {tab === id && <motion.span layoutId="provider-tab" className="absolute inset-0 rounded-full bg-white shadow-[0_1px_2px_rgba(16,24,40,.08),0_0_0_1px_rgba(16,24,40,.04)]" transition={{ type: "spring", stiffness: 500, damping: 38 }} />}
                <span className={cx("relative", tab === id ? "text-ink" : "text-ink-3 hover:text-ink-2")}>{label}</span>
              </button>
            ))}
          </nav>
          <div className="flex items-center gap-2 text-[12px] text-ink-3"><ShieldCheck size={15} className="text-met" /> Decisions are always made by Bellcourt clinicians</div>
        </div>
      </motion.div>

      {tab === "voice" ? <VoiceAgent /> : (
      <div className="grid gap-6 lg:grid-cols-12">
        {/* ------------------------------------------------ intake */}
        <section className="card p-5 lg:col-span-8">
          <AnimatePresence mode="wait">
            {phase === "idle" && (
              <motion.div key="idle" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, y: -6 }}>
                <button
                  onClick={() => input.current?.click()}
                  onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
                  onDragLeave={() => setDrag(false)}
                  onDrop={(e) => { e.preventDefault(); setDrag(false); const f = e.dataTransfer.files[0]; if (f) submit(f); }}
                  className={cx("group flex w-full flex-col items-center justify-center rounded-xl border-2 border-dashed px-6 py-14 text-center transition",
                    drag ? "border-brand bg-brand-soft" : "border-line bg-canvas/60 hover:border-brand/40 hover:bg-brand-soft/40")}
                >
                  <motion.div animate={drag ? { y: -4, scale: 1.05 } : { y: 0, scale: 1 }} className="grid h-14 w-14 place-items-center rounded-2xl bg-white shadow-sm ring-1 ring-line">
                    <FileUp size={24} className="text-brand" />
                  </motion.div>
                  <div className="mt-4 text-[15px] font-medium">Drop your fax here, or click to browse</div>
                  <div className="mt-1 text-[12.5px] text-ink-3">PNG, JPEG, TIFF or PDF · up to 10 MB</div>
                </button>
                <input ref={input} type="file" accept="image/png,image/jpeg,image/tiff,application/pdf" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) submit(f); e.target.value = ""; }} />

              </motion.div>
            )}

            {phase !== "idle" && preview && (
              <motion.div key="sent" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col items-center gap-6 py-6 sm:flex-row sm:items-start">
                <motion.div initial={{ rotate: -4, y: 8, opacity: 0 }} animate={{ rotate: 0, y: 0, opacity: 1 }} className="relative w-44 shrink-0 overflow-hidden rounded-lg border border-line bg-white shadow-[0_12px_32px_-14px_rgba(16,24,40,.35)]">
                  {preview.mime.startsWith("image/") ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={preview.src} alt="Your fax" className="aspect-[8.5/11] w-full object-cover object-top" />
                  ) : <div className="grid aspect-[8.5/11] place-items-center text-[12px] text-ink-3">{preview.name}</div>}
                  {phase === "uploading" && (
                    <motion.div className="absolute inset-x-0 bottom-0 h-1 bg-brand" initial={{ width: "0%" }} animate={{ width: "92%" }} transition={{ duration: 0.9, ease: "easeOut" }} />
                  )}
                </motion.div>
                <div className="min-w-0 flex-1">
                  <AnimatePresence mode="wait">
                    {phase === "uploading" && (
                      <motion.div key="u" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="pt-4 text-[15px] font-medium text-ink-2">Sending your fax…</motion.div>
                    )}
                    {phase === "uploaded" && result && (
                      <motion.div key="d" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}>
                        <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: "spring", stiffness: 420, damping: 18 }} className="mb-3 grid h-11 w-11 place-items-center rounded-full bg-met text-white">
                          <CheckCircle2 size={22} />
                        </motion.div>
                        <div className="text-[18px] font-semibold tracking-tight">Fax received</div>
                        <div className="mt-1 text-[13.5px] text-ink-2">Case <span className="mono font-medium text-ink">{result.id}</span> · received {new Date(result.receivedAt).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })}</div>
                        <p className="mt-3 max-w-md text-[13.5px] text-ink-2">It&apos;s in the Bellcourt review queue. If we need anything else, it will appear under <span className="font-medium text-ink">Your requests</span> — or call Bell anytime for a status update.</p>
                        <div className="mt-5 flex gap-2">
                          <Button variant="secondary" onClick={reset}><RotateCcw size={14} /> Upload another</Button>
                          <Button variant="ghost" onClick={() => setTab("voice")}>Call Bell <ArrowRight size={14} /></Button>
                        </div>
                      </motion.div>
                    )}
                    {phase === "error" && (
                      <motion.div key="e" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                        <div className="rounded-lg bg-fail-soft p-3 text-[13px] text-fail">{error}</div>
                        <Button variant="secondary" className="mt-3" onClick={reset}><RotateCcw size={14} /> Try again</Button>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </section>

        {/* ------------------------------------------------ my requests */}
        <aside className="card flex flex-col p-5 lg:col-span-4">
          <SectionTitle right={<Badge>{cases.length}</Badge>}>Your requests</SectionTitle>
          {cases.length === 0 ? (
            <div className="flex flex-1 flex-col items-center justify-center py-12 text-center text-ink-3">
              <Inbox size={28} className="mb-2" />
              <div className="text-[13px]">Requests you submit appear here with live status.</div>
            </div>
          ) : (
            <ul className="-mx-2 space-y-1">
              <AnimatePresence initial={false}>
                {cases.map((c) => (
                  <motion.li key={c.id} layout initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }}>
                    <button onClick={() => setOpenId(openId === c.id ? null : c.id)} className={cx("w-full rounded-lg px-2 py-2.5 text-left transition hover:bg-line-2", openId === c.id && "bg-line-2")}>
                      <div className="flex items-center justify-between gap-2">
                        <span className="mono text-[12px] text-ink-3">{c.id}</span>
                        <ProviderStatus c={c} />
                      </div>
                      <div className="mt-0.5 truncate text-[13.5px] font-medium">{c.service ?? (c.status === "RECEIVED" ? "Fax received · awaiting review" : "Request")}</div>
                      <div className="mt-0.5 flex items-center justify-between text-[12px] text-ink-3">
                        <span>{c.patientName ?? "—"}</span>
                        {!c.decision && <DueClock receivedAt={c.receivedAt} dueAt={c.dueAt} slaHours={c.slaHours} now={now} compact />}
                      </div>
                    </button>
                    <AnimatePresence>
                      {openId === c.id && (
                        <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                          <Thread c={c} onUpdated={refresh} />
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </motion.li>
                ))}
              </AnimatePresence>
            </ul>
          )}
        </aside>
      </div>
      )}
    </div>
  );
}

function ProviderStatus({ c }: { c: ProviderCase }) {
  const tone = c.status === "APPROVED" ? "met" : c.status === "PENDED_INFO_REQUESTED" ? "miss" : c.status === "DENIED" ? "ink" : "brand";
  return <Badge tone={tone}>{c.statusLabel}</Badge>;
}

function Reply({ c, onUpdated }: { c: ProviderCase; onUpdated: (c: ProviderCase) => void }) {
  const [text, setText] = useState("");
  const [memberId, setMemberId] = useState("");
  const [dx, setDx] = useState("");
  const [busy, setBusy] = useState(false);
  const needId = c.missing.some((m) => m.item === "Member ID");
  const needDx = c.missing.some((m) => m.item.startsWith("Diagnosis code"));
  async function send() {
    setBusy(true);
    const r = await fetch(`/api/cases/${c.id}/supplement`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text, memberId, diagnosisCode: dx }) });
    setBusy(false);
    if (r.ok) { onUpdated(await r.json()); setText(""); setMemberId(""); setDx(""); }
  }
  return (
    <div className="mt-3 space-y-2">
      {(needId || needDx) && (
        <div className="grid grid-cols-2 gap-2">
          {needId && <input value={memberId} onChange={(e) => setMemberId(e.target.value)} placeholder="Member ID" className="rounded-lg border border-line bg-white px-3 py-2 text-[13px] outline-none focus:border-brand" />}
          {needDx && <input value={dx} onChange={(e) => setDx(e.target.value)} placeholder="ICD-10 code" className="rounded-lg border border-line bg-white px-3 py-2 text-[13px] outline-none focus:border-brand" />}
        </div>
      )}
      <textarea value={text} onChange={(e) => setText(e.target.value)} rows={3} placeholder="Add the requested information (e.g. 'Second opinion by Dr. Lee, board-certified pain specialist, documented 9/18: concurs with SCS trial.')" className="w-full resize-none rounded-lg border border-line bg-white px-3 py-2 text-[13px] outline-none focus:border-brand" />
      <div className="flex justify-end">
        <Button onClick={send} disabled={busy || (!text && !memberId && !dx)}><Send size={14} /> {busy ? "Sending…" : "Send to Bellcourt"}</Button>
      </div>
    </div>
  );
}

function Thread({ c, onUpdated }: { c: ProviderCase; onUpdated: () => void }) {
  return (
    <div className="mx-2 mb-2 space-y-2 border-l-2 border-line pl-3 pt-1">
      {c.messages.map((m, i) => (
        <div key={i} className="text-[12.5px]">
          <div className="flex items-center gap-1.5 text-[11px] text-ink-3">
            <MessageSquareText size={11} /> {m.from === "bell" ? "Bell (automated)" : m.from === "provider" ? "You" : "Bellcourt reviewer"} · {new Date(m.at).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })}
          </div>
          <div className="whitespace-pre-wrap text-ink-2">{m.body}</div>
        </div>
      ))}
      {c.status === "PENDED_INFO_REQUESTED" && c.missing.length > 0 && (
        <div className="rounded-lg border border-miss/30 bg-miss-soft/50 p-3">
          <div className="flex items-center gap-1.5 text-[13px] font-semibold text-ink"><CircleAlert size={15} className="text-miss" /> We need {c.missing.length} more item{c.missing.length > 1 ? "s" : ""}</div>
          <ul className="mt-2 space-y-1.5">
            {c.missing.map((m) => (
              <li key={m.item} className="rounded-md bg-white/80 p-2 ring-1 ring-line">
                <div className="text-[12.5px] font-medium">{m.item}</div>
                <div className="text-[12px] text-ink-2">{m.why}</div>
                {m.citation && <div className="mt-1"><CiteChip c={m.citation} /></div>}
              </li>
            ))}
          </ul>
          <Reply c={c} onUpdated={() => onUpdated()} />
        </div>
      )}
      {c.decision && <div className="flex items-center gap-1 text-[12px] font-medium text-ink"><ArrowRight size={12} /> {c.decision.outcome.replaceAll("_", " ").toLowerCase()}</div>}
    </div>
  );
}
