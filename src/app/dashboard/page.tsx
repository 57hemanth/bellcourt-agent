"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import { AlertTriangle, ChevronRight, Cpu, FileImage, Globe, Network, Phone, RefreshCw, Search } from "lucide-react";
import { bellFetch, usePersona } from "@/components/providers";
import { PersonaLogin } from "@/components/persona-login";
import type { BellCase } from "@/components/bell-types";
import { Badge, Button, CountUp, DueClock, REC_META, STATUS_META, cx, useNow } from "@/components/ui";

const CHANNEL_ICON: Record<string, React.ReactNode> = { FAX: <FileImage size={14} />, PORTAL: <Globe size={14} />, PHONE: <Phone size={14} />, ELECTRONIC: <Cpu size={14} /> };
const governing = (path?: { docId: string; effect: string }[]) =>
  Array.from(new Set((path ?? []).filter((r) => (r.effect === "APPLIES" || r.effect === "OVERRIDES") && !r.docId.startsWith("REG")).map((r) => r.docId.replace(" Section ", " §").replace("RIVERBEND-ADDENDUM", "RB addendum"))))
    .filter((d, _i, arr) => !arr.some((o) => o !== d && o.startsWith(d + " §"))).slice(0, 3).join(" → ");
const OPEN = ["RECEIVED", "PENDED_INFO_REQUESTED", "AWAITING_NURSE_REVIEW", "ROUTED_TO_PHYSICIAN", "ELIGIBILITY_HOLD"];

export default function BellConsole() {
  const { persona, ready } = usePersona();
  if (!ready) return null;
  if (!persona) return <PersonaLogin />;
  return <Queue />;
}

function Queue() {
  const { persona } = usePersona();
  const [cases, setCases] = useState<BellCase[] | null>(null);
  const [system, setSystem] = useState<{ engine: string; gemini: string | null; graph: string } | null>(null);
  const isMd = persona!.role === "physician";
  const tabs = isMd
    ? [{ id: "mine", label: "Routed to physician" }, { id: "open", label: "All open" }, { id: "done", label: "Decided" }]
    : [{ id: "open", label: "All open" }, { id: "approve", label: "Ready to approve" }, { id: "review", label: "Needs physician" }, { id: "info", label: "Info requested" }, { id: "done", label: "Decided" }];
  const [tab, setTab] = useState(tabs[0].id);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const now = useNow();

  const load = useCallback(() => {
    bellFetch(persona, "/api/cases").then((r) => (r.ok ? r.json() : null)).then((d) => d && setCases(d));
    fetch("/api/system").then((r) => (r.ok ? r.json() : null)).then((d) => d && setSystem(d));
  }, [persona]);
  useEffect(() => {
    const t = setInterval(load, 15000);
    const first = setTimeout(load, 0);
    return () => { clearInterval(t); clearTimeout(first); };
  }, [load]);

  const open = (cases ?? []).filter((c) => OPEN.includes(c.status));
  const stats = [
    { label: "Open cases", value: open.length },
    { label: "Due within 24 h", value: open.filter((c) => new Date(c.dueAt).getTime() - now < 24 * 3600_000).length, tone: "text-fail" },
    { label: isMd ? "Routed to physician" : "Ready to approve", value: isMd ? open.filter((c) => c.status === "ROUTED_TO_PHYSICIAN").length : open.filter((c) => c.status === "AWAITING_NURSE_REVIEW" && c.evaluation?.recommendation === "RECOMMEND_APPROVE").length, tone: isMd ? "" : "text-met" },
    { label: "Info requested", value: open.filter((c) => c.status === "PENDED_INFO_REQUESTED").length, tone: "text-miss" },
  ];

  const isNew = (c: BellCase) => c.status === "RECEIVED" && !c.evaluation;
  const rows = useMemo(() => {
    let r = [...(cases ?? [])].sort((a, b) => (isNew(a) === isNew(b) ? (isNew(a) ? b.receivedAt.localeCompare(a.receivedAt) : 0) : isNew(a) ? -1 : 1));
    if (tab === "open") r = r.filter((c) => OPEN.includes(c.status));
    if (tab === "mine") r = r.filter((c) => c.status === "ROUTED_TO_PHYSICIAN");
    if (tab === "approve") r = r.filter((c) => c.status === "AWAITING_NURSE_REVIEW" && c.evaluation?.recommendation === "RECOMMEND_APPROVE");
    if (tab === "review") r = r.filter((c) => OPEN.includes(c.status) && c.evaluation?.recommendation === "ROUTE_TO_PHYSICIAN");
    if (tab === "info") r = r.filter((c) => c.status === "PENDED_INFO_REQUESTED" || c.status === "ELIGIBILITY_HOLD");
    if (tab === "done") r = r.filter((c) => !OPEN.includes(c.status));
    if (q) { const s = q.toLowerCase(); r = r.filter((c) => [c.id, c.extraction?.fields.patientName, c.extraction?.fields.serviceRequested, c.evaluation?.client.id].some((x) => x?.toLowerCase().includes(s))); }
    return r;
  }, [cases, tab, q]);

  const greet = new Date().getHours() < 12 ? "Good morning" : new Date().getHours() < 18 ? "Good afternoon" : "Good evening";

  return (
    <div className="space-y-6">
      <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[26px] font-semibold tracking-tight">{greet}, {persona!.name.startsWith("Dr.") ? `Dr. ${persona!.name.split(" ").at(-1)}` : persona!.name.split(" ")[0]}</h1>
          <p className="mt-1 text-[14px] text-ink-2">{isMd ? "Physician review queue" : "Clinical review queue"} · sorted by regulatory deadline, counted from receipt</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {system && (
            <>
              <Badge tone={system.gemini ? "brand" : "neutral"}><Cpu size={12} /> {system.gemini ? "Fax reading" : "Fax reading · offline"}</Badge>
              <Badge tone="neutral"><Network size={12} /> Graph · {system.graph}</Badge>
            </>
          )}
          <Button variant="secondary" disabled={busy} onClick={async () => { setBusy(true); await fetch("/api/admin/reset", { method: "POST" }); load(); setBusy(false); }}>
            <RefreshCw size={14} className={busy ? "animate-spin" : ""} /> Reset demo
          </Button>
        </div>
      </motion.div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {stats.map((s, i) => (
          <motion.div key={s.label} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }} className="card p-4">
            <div className="text-[12px] text-ink-3">{s.label}</div>
            <CountUp value={s.value} className={cx("mt-1 block text-[28px] font-semibold tabular-nums tracking-tight", s.tone)} />
          </motion.div>
        ))}
      </div>

      <div className="card overflow-hidden">
        <div className="flex flex-wrap items-center gap-3 border-b border-line px-4 py-2.5">
          <div className="relative flex gap-1">
            {tabs.map((t) => (
              <button key={t.id} onClick={() => setTab(t.id)} className="relative rounded-md px-3 py-1.5 text-[13px] font-medium">
                {tab === t.id && <motion.span layoutId="queue-tab" className="absolute inset-0 rounded-md bg-line-2" transition={{ type: "spring", stiffness: 500, damping: 40 }} />}
                <span className={cx("relative", tab === t.id ? "text-ink" : "text-ink-3 hover:text-ink-2")}>{t.label}</span>
              </button>
            ))}
          </div>
          <div className="relative ml-auto">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-3" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search case, member, service" className="w-60 rounded-lg border border-line bg-white py-1.5 pl-8 pr-3 text-[13px] outline-none focus:border-brand" />
          </div>
        </div>

        <div className="hidden grid-cols-[110px_175px_minmax(0,1.2fr)_minmax(0,1.6fr)_175px_150px_20px] gap-4 border-b border-line bg-canvas/60 px-4 py-2 text-[11.5px] font-medium uppercase tracking-[.06em] text-ink-3 lg:grid">
          <span>Due</span><span>Case</span><span>Member · client</span><span>Service · governing policy</span><span>Bell</span><span>Status</span><span />
        </div>

        {!cases ? (
          <div className="space-y-2 p-4">{Array.from({ length: 6 }).map((_, i) => <div key={i} className="shimmer h-12 rounded-lg" />)}</div>
        ) : rows.length === 0 ? (
          <div className="p-12 text-center text-[13px] text-ink-3">Nothing here.</div>
        ) : (
          <ul>
            <AnimatePresence initial={false}>
              {rows.map((c, i) => {
                const ev = c.evaluation; const f = c.extraction?.fields;
                const crit = ev?.flags.filter((x) => x.severity !== "info").length ?? 0;
                return (
                  <motion.li key={c.id} layout initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0, transition: { delay: Math.min(i, 12) * 0.025 } }} exit={{ opacity: 0 }}>
                    <Link href={`/dashboard/case/${c.id}`} className="group grid grid-cols-1 items-center gap-1 border-b border-line-2 px-4 py-3 transition hover:bg-brand-soft/40 lg:grid-cols-[110px_175px_minmax(0,1.2fr)_minmax(0,1.6fr)_175px_150px_20px] lg:gap-4">
                      <span>{OPEN.includes(c.status) ? <DueClock receivedAt={c.receivedAt} dueAt={c.dueAt} slaHours={c.slaHours} now={now} /> : <span className="text-[12px] text-ink-3">—</span>}</span>
                      <span className="flex items-center gap-2">
                        <span className="text-ink-3">{CHANNEL_ICON[c.channel]}</span>
                        <span className="mono whitespace-nowrap text-[12.5px]">{c.id}</span>
                        {c.slaHours === 72 && <Badge tone="fail">72h</Badge>}
                      </span>
                      {isNew(c) ? (
                        <span className="min-w-0 lg:col-span-2">
                          <span className="block text-[13.5px] font-medium">New fax from the provider portal</span>
                          <span className="block text-[12px] text-ink-3">Not yet read · open to let Bell process it</span>
                        </span>
                      ) : (<>
                      <span className="min-w-0">
                        <span className="block truncate text-[13.5px] font-medium">{f?.patientName ?? "Unidentified member"}</span>
                        <span className="block truncate text-[12px] text-ink-3">{ev?.client.id ?? "client unknown"}{ev?.client.state ? ` · ${ev.client.state}` : ""}{ev?.requiresAzLicensedReviewer ? " · AZ MD sign-off" : ""}</span>
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate text-[13.5px]">{f?.serviceRequested ?? "—"}</span>
                        <span className="block truncate text-[12px] text-ink-3">{governing(ev?.rulePath) || "—"}</span>
                      </span>
                      </>)}
                      <span className="flex items-center gap-1.5">
                        {isNew(c) && <Badge tone="brand"><motion.span className="h-1.5 w-1.5 rounded-full bg-brand" animate={{ opacity: [1, 0.3, 1] }} transition={{ repeat: Infinity, duration: 1.4 }} /> New fax</Badge>}
                        {ev && <Badge tone={REC_META[ev.recommendation]?.tone}>{REC_META[ev.recommendation]?.label}</Badge>}
                        {crit > 0 && <span title={`${crit} flag(s)`} className="flex items-center gap-0.5 text-[12px] text-miss"><AlertTriangle size={13} />{crit}</span>}
                      </span>
                      <span><Badge tone={STATUS_META[c.status]?.tone}>{STATUS_META[c.status]?.label}</Badge></span>
                      <ChevronRight size={16} className="hidden text-ink-3 transition group-hover:translate-x-0.5 group-hover:text-brand lg:block" />
                    </Link>
                  </motion.li>
                );
              })}
            </AnimatePresence>
          </ul>
        )}
      </div>
    </div>
  );
}
