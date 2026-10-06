/**
 * Optional Neo4j backend for the knowledge graph.
 * Enabled when NEO4J_URI, NEO4J_USER and NEO4J_PASSWORD are set. The KB contains no PHI —
 * only policies, plan provisions and memos — so case data never enters the graph.
 */
import neo4j, { type Driver } from "neo4j-driver";
import { buildGraph, hydrate, resolveIdsInMemory, type Resolved, type ResolveInput, type ResolvedIds } from "./graph";

let driver: Driver | null = null;

export const neo4jEnabled = () => Boolean(process.env.NEO4J_URI && process.env.NEO4J_USER && process.env.NEO4J_PASSWORD);

function getDriver(): Driver {
  if (!driver) driver = neo4j.driver(process.env.NEO4J_URI!, neo4j.auth.basic(process.env.NEO4J_USER!, process.env.NEO4J_PASSWORD!));
  return driver;
}

const LABELS = ["Client", "PlanDocument", "Regulation", "Memo", "Policy", "PolicyVersion", "Criterion", "Service", "Provision"] as const;
const REL_TYPES = ["BOUND_BY", "SUBJECT_TO", "HAS_PROVISION", "APPLIES_TO", "REFERENCES", "OVERRIDES", "GOVERNED_BY", "HAS_VERSION", "SUPERSEDES", "HAS_CRITERION", "CONFLICTS_WITH", "AMENDED_BY"] as const;

/** Wipes and reloads the KB graph. Labels/types come from fixed allow-lists (never user input). */
export async function seedNeo4j(): Promise<{ nodes: number; edges: number }> {
  const { nodes, edges } = buildGraph();
  const session = getDriver().session();
  try {
    await session.run("MATCH (n:KB) DETACH DELETE n");
    await session.run("CREATE CONSTRAINT kb_id IF NOT EXISTS FOR (n:KB) REQUIRE n.id IS UNIQUE");
    for (const label of LABELS) {
      const rows = nodes.filter((n) => n.label === label).map((n) => ({ ...n.props, displayName: n.props.name ?? n.name, id: n.id, name: n.name }));
      if (rows.length) await session.run(`UNWIND $rows AS r CREATE (n:KB:${label}) SET n = r`, { rows });
    }
    for (const type of REL_TYPES) {
      const rows = edges.filter((e) => e.type === type);
      if (rows.length)
        await session.run(`UNWIND $rows AS r MATCH (a:KB {id: r.source}), (b:KB {id: r.target}) CREATE (a)-[:${type}]->(b)`, { rows });
    }
    return { nodes: nodes.length, edges: edges.length };
  } finally {
    await session.close();
  }
}

const RESOLVE_CYPHER = `
MATCH (s:Service {code: $code})-[:GOVERNED_BY]->(p:Policy)-[:HAS_VERSION]->(v:PolicyVersion)
WITH s, collect(v) AS versions
WITH s, versions,
     [v IN versions WHERE v.effectiveFrom <= $dos AND (v.effectiveTo IS NULL OR v.effectiveTo >= $dos)][0] AS current
OPTIONAL MATCH (:Client {name: $client})-[:BOUND_BY]->(:PlanDocument)-[:HAS_PROVISION]->(pr:Provision)-[:APPLIES_TO]->(s)
  WHERE (pr.effectiveFrom IS NULL OR pr.effectiveFrom <= $dos)
    AND (pr.effectiveTo IS NULL OR pr.effectiveTo >= $dos)
    AND (pr.product IS NULL OR pr.product = $product)
OPTIONAL MATCH (m:Memo)-[:CONFLICTS_WITH]->(current)
RETURN current.name AS version,
       [v IN versions WHERE v <> current | v.name] AS superseded,
       collect(DISTINCT pr.id) AS provisions,
       collect(DISTINCT m.name) AS memos`;

export async function resolveIdsNeo4j(q: ResolveInput): Promise<ResolvedIds> {
  const session = getDriver().session({ defaultAccessMode: neo4j.session.READ });
  try {
    const res = await session.run(RESOLVE_CYPHER, { code: q.serviceCode, dos: q.dos, client: q.clientId ?? "", product: q.product ?? "" });
    const r = res.records[0];
    if (!r) return { versionId: null, supersededIds: [], provisionIds: [], memoIds: [], engine: "neo4j" };
    return {
      versionId: r.get("version"),
      supersededIds: r.get("superseded"),
      provisionIds: (r.get("provisions") as string[]).map((id) => id.replace(/^prov:/, "")),
      memoIds: r.get("memos"),
      engine: "neo4j",
    };
  } finally {
    await session.close();
  }
}

/** Resolve the governing rules — Neo4j when configured, in-memory graph otherwise (same answer). */
export async function resolveRules(q: ResolveInput): Promise<Resolved> {
  if (neo4jEnabled()) {
    try {
      return hydrate(await resolveIdsNeo4j(q));
    } catch (err) {
      console.warn("[bell] Neo4j resolve failed, falling back to in-memory graph:", (err as Error).message);
    }
  }
  return hydrate(resolveIdsInMemory(q));
}
