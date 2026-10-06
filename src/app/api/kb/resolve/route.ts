import { resolveRules } from "@/lib/kb/neo4j";
import { clientById, serviceByCode } from "@/lib/kb/data";

/** "Which rule applies?" as a graph query: client × service × date of service → governing nodes. */
export async function GET(req: Request) {
  const u = new URL(req.url);
  const client = clientById(u.searchParams.get("client"));
  const svc = serviceByCode(u.searchParams.get("service"));
  const dos = u.searchParams.get("dos") ?? new Date().toISOString().slice(0, 10);
  if (!client || !svc || !/^\d{4}-\d{2}-\d{2}$/.test(dos)) return Response.json({ error: "client, service and dos (YYYY-MM-DD) required" }, { status: 400 });
  const r = await resolveRules({ clientId: client.id, product: client.product, serviceCode: svc.code, dos });
  const nodeIds = [
    `client:${client.id}`, client.planDoc ? `doc:${client.planDoc}` : null, `svc:${svc.code}`, `policy:${svc.policy}`,
    r.version ? `pv:${r.version.id}` : null, ...(r.version?.criteria.map((c) => `crit:${r.version!.id}:${c.id}`) ?? []),
    ...r.provisions.map((p) => `prov:${p.id}`), ...r.memos.map((m) => `doc:${m.id}`),
  ].filter(Boolean);
  return Response.json({
    engine: r.engine, nodeIds,
    version: r.version && { id: r.version.id, from: r.version.effectiveFrom, to: r.version.effectiveTo, logic: r.version.logic },
    superseded: r.superseded.map((v) => v.id),
    provisions: r.provisions.map((p) => ({ id: p.id, kind: p.kind, section: p.section, quote: p.quote })),
    memos: r.memos.map((m) => ({ id: m.id, verdict: m.verdict })),
  });
}
