"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { ArrowLeft, Ban, Check, FileImage, Lock, MessageSquarePlus, ScrollText, Send, ShieldAlert, Stethoscope, ZoomIn } from "lucide-react";
import { bellFetch, usePersona } from "@/components/providers";
import { PersonaLogin } from "@/components/persona-login";
import type { BellCase } from "@/components/bell-types";
import { RulePath } from "@/components/rule-path";
import { CriteriaList } from "@/components/criteria-list";
import { CiteChip } from "@/components/citation-drawer";
import { ProcessingView } from "@/components/processing-view";
import { Badge, Button, DueClock, REC_META, STATUS_META, SectionTitle, SeverityIcon, cx, useNow } from "@/components/ui";

export default function CasePage() {
  const { persona, ready } = usePersona();
  if (!ready) return null;
  if (!persona) return <PersonaLogin />;
  return <Workspace />;
}

type Tab = "review" | "correspondence" | "facts" | "audit";

function Workspace() {
  const { id } = useParams<{ id: string }>();
  const { persona } = usePersona();
  const isMd = persona!.role === "physician";
  const [c, setC] = useState<BellCase | null>(null);
  const [tab, setTab] = useState<Tab>("review");
  const [zoom, setZoom] = useState(false);
  const [toast, setToast] = useState<{ tone: "ok" | "err"; text: string } | null>(null);
  const now = useNow();

  const load = useCallback(() => {
    bellFetch(persona, `/api/cases/${id}`).then((r) => (r.ok ? r.json() : null)).then((d) => d && setC(d));
  }, [id, persona]);
  useEffect(() => { const t = setTimeout(load, 0); return () => clearTimeout(t); }, [load]);
  useEffect(() => { if (toast) { const t = setTimeout(() => setToast(null), 4200); return () => clearTimeout(t); } }, [toast]);

  async function act(action: string, note: string) {
    const r = await bellFetch(persona, `/api/cases/${id}/action`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, note }) });
    const j = await r.json();
    if (!r.ok) { setToast({ tone: "err", text: j.error }); load(); return false; }
    setC(j); setToast({ tone: "ok", text: `${action.replaceAll("_", " ").toLowerCase()} recorded` }); return true;
  }

  if (!c) return <div className="grid gap-6 lg:grid-cols-12"><div className="shimmer h-[640px] rounded-xl lg:col-span-5" /><div className="shimmer h-[640px] rounded-xl lg:col-span-7" /></div>;
  if (!c.evaluation && c.file && c.extraction?.method !== "manual") {
    return (
      <div className="space-y-5">
        <div className="flex items-center gap-3">
          <Link href="/dashboard" className="rounded-lg p-1.5 text-ink-3 hover:bg-line-2 hover:text-ink" aria-label="Back to queue"><ArrowLeft size={18} /></Link>
          <h1 className="mono text-[20px] font-semibold tracking-tight">{c.id}</h1>
          <Badge tone="brand">New fax</Badge>
          <div className="ml-auto"><DueClock receivedAt={c.receivedAt} dueAt={c.dueAt} slaHours={c.slaHours} now={now} /></div>
        </div>
        <ProcessingView c={c} onDone={setC} />
      </div>
    );
  }
  const ev = c.evaluation; const f = c.extraction?.fields;
  const rec = ev ? REC_META[ev.recommendation] : null;
  const tabs: { id: Tab; label: string; md?: boolean }[] = [{ id: "review", label: "Review" }, { id: "correspondence", label: "Correspondence" }, { id: "facts", label: "Extracted facts", md: true }, { id: "audit", label: "Audit trail" }];

  return (
    <div className="space-y-5 pb-24">
      {/* header */}
      <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="flex flex-wrap items-center gap-3">
        <Link href="/dashboard" className="rounded-lg p-1.5 text-ink-3 hover:bg-line-2 hover:text-ink" aria-label="Back to queue"><ArrowLeft size={18} /></Link>
        <div>
          <div className="flex items-center gap-2">
            <h1 className="mono text-[20px] font-semibold tracking-tight">{c.id}</h1>
            <Badge tone={STATUS_META[c.status]?.tone}>{STATUS_META[c.status]?.label}</Badge>
            {c.slaHours === 72 && <Badge tone="fail">Expedited · 72 h</Badge>}
          </div>
          <div className="text-[12.5px] text-ink-3">{c.channel} · received {new Date(c.receivedAt).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })} · {ev?.client.name ?? "client unknown"}</div>
        </div>
        <div className="ml-auto">{!c.decision && <DueClock receivedAt={c.receivedAt} dueAt={c.dueAt} slaHours={c.slaHours} now={now} />}</div>
      </motion.div>

      {/* recommendation banner */}
      {ev && rec && (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}
          className={cx("flex flex-wrap items-start gap-4 rounded-xl border p-4",
            rec.tone === "met" ? "border-met/25 bg-met-soft/60" : rec.tone === "miss" ? "border-miss/25 bg-miss-soft/60" : rec.tone === "fail" ? "border-fail/20 bg-fail-soft/50" : "border-line bg-white")}>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[12px] font-semibold uppercase tracking-[.08em] text-ink-3">Bell recommends</span>
              <Badge tone={rec.tone}>{rec.label}</Badge>
              {ev.proposedAdverse && <Badge tone="neutral">{ev.proposedAdverse.type === "NOT_COVERED" ? "Coverage (plan) issue" : "Medical necessity"}</Badge>}
              {ev.requiresAzLicensedReviewer && <Badge tone="brand"><ShieldAlert size={12} /> AZ-licensed MD for denial</Badge>}
              {ev.texasAiDisclosure && <Badge tone="brand">TX AI disclosure</Badge>}
            </div>
            <p className="mt-1.5 text-[14px] leading-relaxed text-ink">{ev.rationale}</p>
            {c.routedNote && c.status === "ROUTED_TO_PHYSICIAN" && <p className="mt-1 text-[12.5px] text-ink-2"><span className="font-medium">Nurse note:</span> {c.routedNote}</p>}
          </div>
          <div className="text-right text-[11.5px] text-ink-3">
            <div>{ev.engineVersion}</div>
            <div>Recommendation only — a human decides</div>
          </div>
        </motion.div>
      )}

      {c.decision && (
        <div className="flex items-center gap-3 rounded-xl border border-line bg-white p-4 text-[13.5px]">
          <Lock size={16} className="text-ink-3" />
          <span><span className="font-semibold">{c.decision.outcome.replaceAll("_", " ")}</span> by {c.decision.by} · {new Date(c.decision.at).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })} — {c.decision.note}</span>
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-12">
        {/* ------------------------------------------- document */}
        <section className="space-y-5 lg:col-span-5">
          <div className="card p-4">
            <SectionTitle right={c.extraction && <Badge tone={c.extraction.method === "gemini" ? "brand" : "neutral"}>{c.extraction.method === "structured" ? "Structured submission" : c.extraction.method === "manual" ? "Keyed by intake" : "Read by Bell"}</Badge>}>
              {c.file ? "Received fax" : "Submission"}
            </SectionTitle>
            {c.file ? (
              <button onClick={() => setZoom(true)} className="group relative block w-full overflow-hidden rounded-lg border border-line">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={c.file} alt="Fax" className="w-full" />
                <span className="absolute right-2 top-2 rounded-md bg-ink/70 p-1.5 text-white opacity-0 transition group-hover:opacity-100"><ZoomIn size={14} /></span>
              </button>
            ) : (
              <div className="flex items-center gap-2 rounded-lg bg-canvas p-3 text-[12.5px] text-ink-2"><FileImage size={14} /> {c.channel === "PORTAL" ? "Portal web form" : c.channel === "PHONE" ? "Keyed during phone call" : "X12 278 transaction"}</div>
            )}
          </div>

          {f && (
            <div className="card p-4">
              <SectionTitle>Extracted fields</SectionTitle>
              <dl className="grid grid-cols-[130px_minmax(0,1fr)] gap-x-3 gap-y-1.5 text-[13px]">
                {([["Patient", f.patientName], ["DOB", f.patientDob], ["Member ID", f.memberId], ["Provider", f.requestingProvider], ["NPI", f.npi], ["Service", f.serviceRequested], ["Service code", f.serviceCode], ["Date of service", f.dateOfService], ["Diagnosis", f.diagnosisCode], ["Urgency (form)", f.urgency], ["Return fax", f.faxHeader?.match(/\(\d{3}\)\s*[\d-]+/)?.[0] ?? null]] as [string, string | null][]).map(([k, v]) => (
                  <motion.div key={k} className="contents" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                    <dt className="text-ink-3">{k}</dt>
                    <dd className={cx("truncate", !v && "text-miss")}>{v ?? "missing"}</dd>
                  </motion.div>
                ))}
              </dl>
              <div className="mt-3 border-t border-line pt-3">
                <div className="mb-1 text-[12px] text-ink-3">Clinical information {persona!.role === "nurse" && "· identifiers redacted"}</div>
                <p className="text-[13px] leading-relaxed text-ink-2">{f.clinicalNotes ?? "—"}</p>
              </div>
            </div>
          )}

          {ev && (
            <div className="card p-4">
              <SectionTitle>Member & eligibility</SectionTitle>
              <div className="flex items-start gap-2 text-[13px]">
                <Badge tone={ev.eligibility.status === "ELIGIBLE" ? "met" : ev.eligibility.status === "INELIGIBLE" ? "fail" : "miss"}>{ev.eligibility.status.toLowerCase()}</Badge>
                <span className="text-ink-2">{ev.eligibility.detail}</span>
              </div>
            </div>
          )}
        </section>

        {/* ------------------------------------------- analysis */}
        <section className="card overflow-hidden lg:col-span-7">
          <div className="flex gap-1 border-b border-line px-3 pt-2">
            {tabs.filter((t) => !t.md || isMd).map((t) => (
              <button key={t.id} onClick={() => setTab(t.id)} className="relative px-3 pb-2.5 pt-1.5 text-[13px] font-medium">
                <span className={tab === t.id ? "text-ink" : "text-ink-3 hover:text-ink-2"}>{t.label}</span>
                {tab === t.id && <motion.span layoutId="case-tab" className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-ink" />}
              </button>
            ))}
          </div>
          <div className="p-5">
            <AnimatePresence mode="wait">
              <motion.div key={tab} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.18 }}>
                {tab === "review" && ev && (
                  <div className="space-y-6">
                    {ev.flags.length > 0 && (
                      <div className="space-y-2">
                        {ev.flags.map((fl, i) => (
                          <motion.div key={fl.code + i} initial={{ opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.04 * i }}
                            className={cx("flex items-start gap-2.5 rounded-lg border px-3 py-2 text-[12.5px]", fl.severity === "critical" ? "border-fail/25 bg-fail-soft/50" : fl.severity === "warning" ? "border-miss/25 bg-miss-soft/50" : "border-brand/15 bg-brand-soft/50")}>
                            <SeverityIcon severity={fl.severity} />
                            <span className="flex-1 text-ink-2"><span className="font-semibold text-ink">{fl.code.replaceAll("_", " ").toLowerCase()}</span> — {fl.message}</span>
                            {fl.citation && <CiteChip c={fl.citation} compact />}
                          </motion.div>
                        ))}
                      </div>
                    )}
                    <div><SectionTitle>Which rules apply · GOV-01 order</SectionTitle><RulePath steps={ev.rulePath} /></div>
                    {ev.planProvisions.length > 0 && <div><SectionTitle>Plan provisions</SectionTitle><CriteriaList items={ev.planProvisions} /></div>}
                    {ev.criteria.length > 0 && <div><SectionTitle right={<span className="text-[12px] text-ink-3">{ev.policy.version}</span>}>Clinical criteria</SectionTitle><CriteriaList items={ev.criteria} logic={ev.policy.logic} /></div>}
                    {ev.partialApproval && <div className="rounded-lg border border-brand/20 bg-brand-soft/50 p-3 text-[13px] text-ink-2">{ev.partialApproval.note}</div>}
                  </div>
                )}

                {tab === "correspondence" && (
                  <div className="space-y-5">
                    {ev?.outreachMessage && <Doc title="Information request sent to provider" body={ev.outreachMessage} />}
                    {isMd && ev?.letterDraft && <Doc title="Determination letter draft" body={ev.letterDraft} />}
                    {!isMd && <div className="text-[12.5px] text-ink-3">Determination letter drafts are visible to physician reviewers.</div>}
                    <div>
                      <SectionTitle>Messages</SectionTitle>
                      <div className="space-y-3">
                        {c.messages.map((m, i) => (
                          <div key={i} className="rounded-lg border border-line p-3">
                            <div className="mb-1 text-[11.5px] text-ink-3">{m.from === "bell" ? "Bell → provider" : m.from === "provider" ? "Provider → Bellcourt" : "Bellcourt → provider"} · {new Date(m.at).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })}</div>
                            <div className="whitespace-pre-wrap text-[13px] text-ink-2">{m.body}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {tab === "facts" && isMd && (
                  <div className="space-y-3">
                    <div className="text-[12.5px] text-ink-3">Structured facts used by the deterministic rules ({c.factsMethod === "gemini" ? "AI reading cross-checked by the rule-based parser" : "rule-based parser"}). <span className="mono">null</span> = not documented → pend, never deny.</div>
                    <div className="grid grid-cols-2 gap-2">
                      {Object.entries(c.facts ?? {}).map(([k, v]) => (
                        <div key={k} className="rounded-lg border border-line px-3 py-2">
                          <div className="text-[11.5px] text-ink-3">{k}</div>
                          <div className={cx("mono text-[13px]", v === null && "text-miss")}>{JSON.stringify(v)}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {tab === "audit" && (
                  <ol className="relative space-y-3 border-l border-line pl-4">
                    {c.audit.map((a, i) => (
                      <li key={i} className="relative">
                        <span className="absolute -left-[21px] top-1.5 h-2.5 w-2.5 rounded-full border-2 border-white bg-brand" />
                        <div className="text-[11.5px] text-ink-3">{new Date(a.at).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })} · {a.actor}</div>
                        <div className="text-[13px] font-medium">{a.action.replaceAll("_", " ").toLowerCase()}</div>
                        {a.detail && <div className="text-[12.5px] text-ink-2">{a.detail}</div>}
                        {isMd && a.data !== undefined && (
                          <details className="mt-1"><summary className="cursor-pointer text-[11.5px] text-brand">inputs / outputs</summary><pre className="mono mt-1 max-h-64 overflow-auto rounded-md bg-canvas p-2 text-[11px]">{JSON.stringify(a.data, null, 2)}</pre></details>
                        )}
                      </li>
                    ))}
                  </ol>
                )}
              </motion.div>
            </AnimatePresence>
          </div>
        </section>
      </div>

      {!c.decision && <ActionBar c={c} role={persona!.role} onAct={act} />}

      <AnimatePresence>
        {zoom && c.file && (
          <motion.div className="fixed inset-0 z-50 grid place-items-center bg-ink/60 p-6 backdrop-blur-sm" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setZoom(false)}>
            { }
            <motion.img src={c.file} alt="Fax" className="max-h-full rounded-lg bg-white shadow-2xl" initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }} />
          </motion.div>
        )}
        {toast && (
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 16 }}
            className={cx("fixed top-20 left-1/2 z-50 max-w-lg -translate-x-1/2 rounded-xl px-4 py-3 text-[13px] shadow-xl", toast.tone === "ok" ? "bg-ink text-white" : "bg-fail text-white")}>
            {toast.text}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function Doc({ title, body }: { title: string; body: string }) {
  return (
    <div>
      <SectionTitle>{title}</SectionTitle>
      <pre className="whitespace-pre-wrap rounded-lg border border-line bg-canvas p-4 font-sans text-[13px] leading-relaxed text-ink-2">{body}</pre>
    </div>
  );
}

function ActionBar({ c, role, onAct }: { c: BellCase; role: string; onAct: (a: string, n: string) => Promise<boolean> }) {
  const [mode, setMode] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const ev = c.evaluation;
  const actions = role === "nurse"
    ? [
        { id: "APPROVE", label: "Approve", icon: <Check size={14} />, variant: "success" as const, needsNote: ev?.recommendation !== "RECOMMEND_APPROVE" },
        { id: "PEND", label: "Request info", icon: <MessageSquarePlus size={14} />, variant: "secondary" as const },
        { id: "ROUTE_TO_PHYSICIAN", label: "Route to physician", icon: <Stethoscope size={14} />, variant: "primary" as const },
        { id: "DENY_MEDICAL_NECESSITY", label: "Deny", icon: <Ban size={14} />, variant: "ghost" as const, locked: true },
      ]
    : [
        { id: "APPROVE", label: "Approve", icon: <Check size={14} />, variant: "success" as const, needsNote: ev?.recommendation !== "RECOMMEND_APPROVE" },
        { id: "REQUEST_INFO", label: "Request info", icon: <MessageSquarePlus size={14} />, variant: "secondary" as const },
        { id: "DENY_NOT_COVERED", label: "Deny · not covered", icon: <ScrollText size={14} />, variant: "danger" as const, needsNote: true },
        { id: "DENY_MEDICAL_NECESSITY", label: "Deny · medical necessity", icon: <Ban size={14} />, variant: "danger" as const, needsNote: true },
      ];
  const current = actions.find((a) => a.id === mode);
  const defaultNote = (id: string) => id === "PEND" || id === "REQUEST_INFO" ? ev?.outreachMessage ?? "" : id === "ROUTE_TO_PHYSICIAN" ? ev?.rationale ?? "" : id.startsWith("DENY") ? ev?.proposedAdverse?.reason ?? "" : "";
  return (
    <motion.div initial={{ y: 80 }} animate={{ y: 0 }} transition={{ type: "spring", stiffness: 260, damping: 30, delay: 0.2 }}
      className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-white/90 backdrop-blur-md">
      <div className="mx-auto max-w-[1320px] px-4 py-3 sm:px-6">
        <AnimatePresence>
          {current && (
            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
              <div className="mb-3 flex gap-3">
                <textarea autoFocus value={note} onChange={(e) => setNote(e.target.value)} rows={3}
                  placeholder={current.needsNote ? "Rationale (required) — cite the criterion or plan provision" : "Note (optional)"}
                  className="flex-1 resize-none rounded-lg border border-line px-3 py-2 text-[13px] outline-none focus:border-brand" />
                <div className="flex flex-col gap-2">
                  <Button variant={current.variant === "ghost" ? "primary" : current.variant} disabled={busy || (current.needsNote && !note.trim())}
                    onClick={async () => { setBusy(true); const ok = await onAct(current.id, note); setBusy(false); if (ok) { setMode(null); setNote(""); } }}>
                    <Send size={14} /> Confirm
                  </Button>
                  <Button variant="ghost" onClick={() => { setMode(null); setNote(""); }}>Cancel</Button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
        <div className="flex flex-wrap items-center gap-2">
          <span className="mr-auto text-[12px] text-ink-3">{role === "nurse" ? "Nurses may approve; denials go to a physician." : c.evaluation?.requiresAzLicensedReviewer ? "Arizona MA member — denial requires an AZ-licensed medical director." : "Every action is signed and written to the audit trail."}</span>
          {actions.map((a) => (
            <Button key={a.id} variant={a.variant} title={"locked" in a && a.locked ? "Nurses cannot deny — the server will block this" : undefined}
              className={cx(mode === a.id && "ring-2 ring-brand/40", "locked" in a && a.locked && "text-ink-3")}
              onClick={() => { setMode(mode === a.id ? null : a.id); setNote(defaultNote(a.id)); }}>
              {"locked" in a && a.locked ? <Lock size={13} /> : a.icon} {a.label}
            </Button>
          ))}
        </div>
      </div>
    </motion.div>
  );
}
