"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { motion } from "motion/react";
import { ExternalLink, Route, X } from "lucide-react";
import { usePersona } from "@/components/providers";
import { PersonaLogin } from "@/components/persona-login";
import { Badge, Button, SectionTitle, cx } from "@/components/ui";

const ForceGraph2D = dynamic(() => import("react-force-graph-2d"), { ssr: false });

interface GNode { id: string; label: string; name: string; props: Record<string, unknown>; x?: number; y?: number }
interface GEdge { source: string | GNode; target: string | GNode; type: string }

const COLORS: Record<string, string> = {
  Client: "#0b1220", PlanDocument: "#2f5bea", Regulation: "#7c3aed", Memo: "#d92d4b",
  Service: "#0e9f6e", Policy: "#0891b2", PolicyVersion: "#06b6d4", Criterion: "#94a3b8", Provision: "#c27803",
};
const CLIENTS = ["RB-MA", "RB-ACA", "HARLAN", "BRIGHT", "KESTREL", "SORREL", "JUNIPER", "OSTR"];
const SERVICES: [string, string][] = [
  ["BHA-IMG-0721", "Lumbar MRI"], ["BHA-SURG-4310", "Bariatric surgery"], ["BHA-DME-2103", "CGM"], ["BHA-DX-9581", "Sleep study"], ["BHA-SURG-2988", "Knee arthroscopy"],
  ["BHA-SURG-2744", "Total knee"], ["BHA-LAB-8162", "BRCA testing"], ["BHA-SURG-1582", "Blepharoplasty"], ["BHA-SURG-3052", "Septoplasty"], ["BHA-SURG-6350", "SCS trial"],
  ["BHA-VASC-3647", "Vein ablation"], ["BHA-THER-1830", "HBOT"], ["BHA-RAD-5205", "Proton beam"], ["BHA-REH-9711", "PT > 12 visits"], ["BHA-IMG-7519", "CCTA"],
  ["BHA-HH-0550", "Home health"], ["BHA-DME-0601", "CPAP"],
];

export default function KnowledgePage() {
  const { persona, ready } = usePersona();
  if (!ready) return null;
  if (!persona) return <PersonaLogin />;
  return <Explorer />;
}

function Explorer() {
  const [data, setData] = useState<{ nodes: GNode[]; edges: GEdge[]; backend: string } | null>(null);
  const [hidden, setHidden] = useState<Set<string>>(new Set(["Criterion"]));
  const [sel, setSel] = useState<GNode | null>(null);
  const [q, setQ] = useState({ client: "KESTREL", service: "BHA-SURG-4310", dos: "2026-03-18" });
  const [path, setPath] = useState<null | { nodeIds: string[]; engine: string; version: { id: string; logic: string } | null; superseded: string[]; provisions: { id: string; kind: string; section: string }[]; memos: { id: string; verdict: string }[] }>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 800, h: 620 });

  useEffect(() => { fetch("/api/kb/graph").then((r) => r.json()).then(setData); }, []);
  useEffect(() => {
    const el = wrap.current; if (!el) return;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: 620 }));
    ro.observe(el); return () => ro.disconnect();
  }, []);

  const graph = useMemo(() => {
    if (!data) return { nodes: [], links: [] };
    const keep = new Set(data.nodes.filter((n) => !hidden.has(n.label) || path?.nodeIds.includes(n.id)).map((n) => n.id));
    return {
      nodes: data.nodes.filter((n) => keep.has(n.id)).map((n) => ({ ...n })),
      links: data.edges.filter((e) => keep.has(e.source as string) && keep.has(e.target as string)).map((e) => ({ ...e })),
    };
  }, [data, hidden, path]);

  const onPath = (id: string) => !path || path.nodeIds.includes(id);
  const counts = useMemo(() => Object.fromEntries(Object.keys(COLORS).map((l) => [l, data?.nodes.filter((n) => n.label === l).length ?? 0])), [data]);

  async function resolve() {
    const r = await fetch(`/api/kb/resolve?client=${q.client}&service=${q.service}&dos=${q.dos}`);
    if (r.ok) setPath(await r.json());
  }

  return (
    <div className="space-y-5">
      <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[26px] font-semibold tracking-tight">Knowledge graph</h1>
          <p className="mt-1 max-w-2xl text-[14px] text-ink-2">The UM Library as a graph: clients, plan documents, provisions, services, versioned policies, memos and regulations. &ldquo;Which rule applies?&rdquo; is a path query over it.</p>
        </div>
        {data && <Badge tone="brand">Backend · {data.backend === "neo4j" ? "Neo4j" : "in-memory graph"} · {data.nodes.length} nodes · {data.edges.length} edges</Badge>}
      </motion.div>

      <div className="grid gap-5 lg:grid-cols-12">
        <div className="card relative overflow-hidden lg:col-span-8" ref={wrap}>
          <div className="absolute left-3 top-3 z-10 flex flex-wrap gap-1.5">
            {Object.entries(COLORS).map(([l, c]) => (
              <button key={l} onClick={() => setHidden((h) => { const n = new Set(h); if (n.has(l)) n.delete(l); else n.add(l); return n; })}
                className={cx("flex items-center gap-1.5 rounded-full border bg-white/90 px-2 py-0.5 text-[11.5px] backdrop-blur transition", hidden.has(l) ? "border-line text-ink-3 opacity-60" : "border-line text-ink-2")}>
                <span className="h-2 w-2 rounded-full" style={{ background: c }} /> {l} <span className="text-ink-3">{counts[l]}</span>
              </button>
            ))}
          </div>
          {data ? (
            <ForceGraph2D
              width={size.w} height={size.h} graphData={graph} cooldownTicks={120}
              linkColor={(l: object) => { const e = l as GEdge; const s = typeof e.source === "string" ? e.source : e.source.id; const t = typeof e.target === "string" ? e.target : e.target.id; return path && onPath(s) && onPath(t) ? "rgba(47,91,234,.85)" : e.type === "CONFLICTS_WITH" ? "rgba(217,45,75,.5)" : "rgba(100,116,139,.18)"; }}
              linkWidth={(l: object) => { const e = l as GEdge; const s = typeof e.source === "string" ? e.source : e.source.id; const t = typeof e.target === "string" ? e.target : e.target.id; return path && onPath(s) && onPath(t) ? 2 : 1; }}
              linkDirectionalArrowLength={3} linkDirectionalArrowRelPos={1}
              onNodeClick={(n: object) => setSel(n as GNode)}
              nodeCanvasObject={(obj: object, ctx: CanvasRenderingContext2D, scale: number) => {
                const n = obj as GNode; const dim = path && !onPath(n.id);
                const r = n.label === "Client" ? 6 : n.label === "Criterion" ? 2.5 : n.label === "Policy" || n.label === "PlanDocument" ? 5 : 4;
                ctx.globalAlpha = dim ? 0.12 : 1;
                ctx.beginPath(); ctx.arc(n.x!, n.y!, r, 0, 2 * Math.PI); ctx.fillStyle = COLORS[n.label] ?? "#999"; ctx.fill();
                if (path && onPath(n.id)) { ctx.lineWidth = 1.5; ctx.strokeStyle = "#2f5bea"; ctx.stroke(); }
                if (scale > 1.4 || (path && onPath(n.id)) || n.label === "Client" || n.label === "PlanDocument") {
                  ctx.font = `${11 / scale}px ui-sans-serif, system-ui`; ctx.fillStyle = "#0b1220"; ctx.textAlign = "center";
                  ctx.fillText(n.name.length > 28 ? n.name.slice(0, 27) + "…" : n.name, n.x!, n.y! + r + 9 / scale);
                }
                ctx.globalAlpha = 1;
              }}
            />
          ) : <div className="shimmer h-[620px]" />}
        </div>

        <div className="space-y-5 lg:col-span-4">
          <div className="card p-4">
            <SectionTitle>Resolve the governing rules</SectionTitle>
            <div className="grid grid-cols-2 gap-2">
              <select value={q.client} onChange={(e) => setQ({ ...q, client: e.target.value })} className="rounded-lg border border-line bg-white px-2 py-1.5 text-[13px]">{CLIENTS.map((c) => <option key={c}>{c}</option>)}</select>
              <input type="date" value={q.dos} onChange={(e) => setQ({ ...q, dos: e.target.value })} className="rounded-lg border border-line bg-white px-2 py-1.5 text-[13px]" />
              <select value={q.service} onChange={(e) => setQ({ ...q, service: e.target.value })} className="col-span-2 rounded-lg border border-line bg-white px-2 py-1.5 text-[13px]">{SERVICES.map(([c, n]) => <option key={c} value={c}>{n}</option>)}</select>
            </div>
            <div className="mt-2 flex gap-2">
              <Button onClick={resolve} className="flex-1"><Route size={14} /> Trace path</Button>
              {path && <Button variant="ghost" onClick={() => setPath(null)}><X size={14} /></Button>}
            </div>
            {path && (
              <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="mt-3 space-y-2 text-[12.5px]">
                <div className="text-ink-3">Resolved by <span className="font-medium text-ink">{path.engine === "neo4j" ? "Neo4j (Cypher)" : "in-memory graph"}</span></div>
                {path.provisions.map((p) => <div key={p.id} className="rounded-md bg-miss-soft/60 px-2 py-1.5"><span className="font-medium">{p.id}</span> · {p.kind.replaceAll("_", " ").toLowerCase()}</div>)}
                {path.version && <div className="rounded-md bg-met-soft/70 px-2 py-1.5"><span className="font-medium">{path.version.id}</span> in effect · {path.version.logic}</div>}
                {path.superseded.map((s) => <div key={s} className="rounded-md bg-line-2 px-2 py-1.5 text-ink-3 line-through">{s} superseded</div>)}
                {path.memos.map((m) => <div key={m.id} className="rounded-md bg-fail-soft/60 px-2 py-1.5"><span className="font-medium">{m.id}</span> void — {m.verdict}</div>)}
              </motion.div>
            )}
          </div>

          <div className="card p-4">
            <SectionTitle>{sel ? sel.label : "Node details"}</SectionTitle>
            {sel ? (
              <motion.div key={sel.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-2 text-[13px]">
                <div className="font-medium">{sel.name}</div>
                {Object.entries(sel.props).filter(([k, v]) => v !== null && k !== "pdf" && k !== "quote").map(([k, v]) => (
                  <div key={k} className="flex justify-between gap-3"><span className="text-ink-3">{k}</span><span className="text-right">{String(v)}</span></div>
                ))}
                {typeof sel.props.quote === "string" && <blockquote className="rounded-md bg-canvas p-2 text-[12.5px] italic text-ink-2">“{sel.props.quote}”</blockquote>}
                {typeof sel.props.pdf === "string" && <a href={sel.props.pdf} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[12.5px] text-brand">Open source PDF <ExternalLink size={12} /></a>}
              </motion.div>
            ) : <div className="text-[12.5px] text-ink-3">Click a node to inspect it. Toggle node types in the legend.</div>}
          </div>
        </div>
      </div>
    </div>
  );
}
