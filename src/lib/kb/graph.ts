/**
 * Knowledge graph over the UM Library.
 *
 *   (Client)-[:BOUND_BY]->(PlanDocument)-[:HAS_PROVISION]->(Provision)-[:APPLIES_TO]->(Service)
 *   (Service)-[:GOVERNED_BY]->(Policy)-[:HAS_VERSION]->(PolicyVersion)-[:HAS_CRITERION]->(Criterion)
 *   (PolicyVersion)-[:SUPERSEDES]->(PolicyVersion)
 *   (Provision {MEDICARE_CRITERIA_OVERRIDE})-[:OVERRIDES]->(Policy)
 *   (Memo)-[:CONFLICTS_WITH]->(PolicyVersion)           // void under GOV-01 §1
 *   (Client)-[:SUBJECT_TO]->(Regulation)
 *
 * "Which rule applies?" is a path query over this graph. It runs in memory by default
 * and in Neo4j when NEO4J_URI is configured (see ./neo4j.ts) — both return the same ids.
 */
import {
  CLIENTS, DOCUMENTS, MEMOS, POLICY_VERSIONS, PROVISIONS, SERVICES,
  type MemoNode, type PolicyVersionNode, type ProvisionNode,
} from "./data";
import type { Product } from "../types";

export interface GNode { id: string; label: string; name: string; props: Record<string, unknown> }
export interface GEdge { source: string; target: string; type: string }

export function buildGraph(): { nodes: GNode[]; edges: GEdge[] } {
  const nodes: GNode[] = [];
  const edges: GEdge[] = [];
  const add = (n: GNode) => nodes.push(n);
  const link = (source: string, type: string, target: string) => edges.push({ source, target, type });

  for (const d of DOCUMENTS.filter((d) => d.kind !== "MEDICAL_POLICY"))
    add({ id: `doc:${d.id}`, label: d.kind === "REGULATION" ? "Regulation" : d.kind === "MEMO" || d.kind === "EMAIL" ? "Memo" : "PlanDocument", name: d.id, props: { title: d.title, kind: d.kind, level: d.level, status: d.status ?? "ACTIVE", pdf: d.pdf } });

  for (const c of CLIENTS.filter((c) => c.planDoc)) {
    add({ id: `client:${c.id}`, label: "Client", name: c.id, props: { name: c.name, product: c.product, state: c.state } });
    link(`client:${c.id}`, "BOUND_BY", `doc:${c.planDoc}`);
    if (c.product === "MA") link(`client:${c.id}`, "SUBJECT_TO", "doc:REG-01");
    if (c.product !== "SELF_FUNDED") link(`client:${c.id}`, "SUBJECT_TO", "doc:REG-02");
    if (c.product === "SELF_FUNDED") link(`client:${c.id}`, "SUBJECT_TO", "doc:REG-03");
  }

  const policies = Array.from(new Set(POLICY_VERSIONS.map((v) => v.policy)));
  for (const p of policies) add({ id: `policy:${p}`, label: "Policy", name: p, props: { title: POLICY_VERSIONS.find((v) => v.policy === p)!.title } });

  for (const v of POLICY_VERSIONS) {
    add({ id: `pv:${v.id}`, label: "PolicyVersion", name: v.id, props: { effectiveFrom: v.effectiveFrom, effectiveTo: v.effectiveTo, status: v.status, logic: v.logic, pdf: v.pdf } });
    link(`policy:${v.policy}`, "HAS_VERSION", `pv:${v.id}`);
    const prev = POLICY_VERSIONS.find((o) => o.policy === v.policy && o.version === v.version - 1);
    if (prev) link(`pv:${v.id}`, "SUPERSEDES", `pv:${prev.id}`);
    for (const cr of v.criteria) {
      add({ id: `crit:${v.id}:${cr.id}`, label: "Criterion", name: cr.label, props: { quote: cr.quote } });
      link(`pv:${v.id}`, "HAS_CRITERION", `crit:${v.id}:${cr.id}`);
    }
  }

  for (const s of SERVICES) {
    add({ id: `svc:${s.code}`, label: "Service", name: s.name, props: { code: s.code } });
    link(`svc:${s.code}`, "GOVERNED_BY", `policy:${s.policy}`);
  }

  for (const pr of PROVISIONS) {
    add({ id: `prov:${pr.id}`, label: "Provision", name: `${pr.doc} ${pr.section.split(" (")[0]}`, props: { kind: pr.kind, section: pr.section, effectiveFrom: pr.effectiveFrom ?? null, effectiveTo: pr.effectiveTo ?? null, product: (pr.params?.product as string) ?? null, quote: pr.quote } });
    link(`doc:${pr.doc}`, "HAS_PROVISION", `prov:${pr.id}`);
    for (const code of pr.services) {
      if (code === "*investigational") link(`prov:${pr.id}`, "REFERENCES", "policy:MP-117");
      else if (code !== "*") link(`prov:${pr.id}`, "APPLIES_TO", `svc:${code}`);
    }
    if (pr.kind === "MEDICARE_CRITERIA_OVERRIDE") {
      const svc = SERVICES.find((s) => s.code === pr.services[0]);
      if (svc) link(`prov:${pr.id}`, "OVERRIDES", `policy:${svc.policy}`);
    }
  }
  link("doc:SPD-KESTREL", "AMENDED_BY", "doc:EMAIL-Kestrel-Amendment");

  for (const m of MEMOS) for (const v of m.conflictsWith) link(`doc:${m.id}`, "CONFLICTS_WITH", `pv:${v}`);
  link("doc:UM-MEMO-2026-04", "REFERENCES", "policy:MP-101");
  link("doc:UM-MEMO-2026-04", "REFERENCES", "policy:MP-103");
  link("doc:UM-MEMO-2026-04", "REFERENCES", "policy:MP-106");

  return { nodes, edges };
}

export interface ResolveInput { clientId: string | null; product: Product | null; serviceCode: string; dos: string }
export interface ResolvedIds { versionId: string | null; supersededIds: string[]; provisionIds: string[]; memoIds: string[]; engine: "memory" | "neo4j" }
export interface Resolved {
  version: PolicyVersionNode | null;
  superseded: PolicyVersionNode[];
  provisions: ProvisionNode[];
  memos: MemoNode[];
  engine: "memory" | "neo4j";
}

const within = (dos: string, from?: string | null, to?: string | null) => (!from || from <= dos) && (!to || to >= dos);

/** In-memory traversal — mirrors the Cypher in neo4j.ts. */
export function resolveIdsInMemory(q: ResolveInput, g = cachedGraph()): ResolvedIds {
  const out = (id: string, type: string) => g.edges.filter((e) => e.source === id && e.type === type).map((e) => e.target);
  const into = (id: string, type: string) => g.edges.filter((e) => e.target === id && e.type === type).map((e) => e.source);
  const node = (id: string) => g.nodes.find((n) => n.id === id)!;

  const svc = `svc:${q.serviceCode}`;
  const policy = out(svc, "GOVERNED_BY")[0];
  const versions = policy ? out(policy, "HAS_VERSION").map(node) : [];
  const current = versions.find((v) => within(q.dos, v.props.effectiveFrom as string, v.props.effectiveTo as string | null));
  const superseded = versions.filter((v) => v !== current).map((v) => v.name);

  const provisionIds: string[] = [];
  if (q.clientId) {
    for (const doc of out(`client:${q.clientId}`, "BOUND_BY")) {
      for (const p of out(doc, "HAS_PROVISION")) {
        const pn = node(p);
        const appliesToSvc = out(p, "APPLIES_TO").includes(svc);
        const productOk = !pn.props.product || pn.props.product === q.product;
        if (appliesToSvc && productOk && within(q.dos, pn.props.effectiveFrom as string | null, pn.props.effectiveTo as string | null))
          provisionIds.push(p.replace(/^prov:/, ""));
      }
    }
  }
  const memoIds = current ? into(current.id, "CONFLICTS_WITH").map((m) => m.replace(/^doc:/, "")) : [];
  return { versionId: current?.name ?? null, supersededIds: superseded, provisionIds, memoIds, engine: "memory" };
}

export function hydrate(ids: ResolvedIds): Resolved {
  return {
    version: POLICY_VERSIONS.find((v) => v.id === ids.versionId) ?? null,
    superseded: POLICY_VERSIONS.filter((v) => ids.supersededIds.includes(v.id)),
    provisions: PROVISIONS.filter((p) => ids.provisionIds.includes(p.id)),
    memos: MEMOS.filter((m) => ids.memoIds.includes(m.id)),
    engine: ids.engine,
  };
}

let _g: ReturnType<typeof buildGraph> | null = null;
export function cachedGraph() {
  if (!_g) _g = buildGraph();
  return _g;
}
