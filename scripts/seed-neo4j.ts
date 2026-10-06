/**
 * Loads the knowledge graph into Neo4j and checks that Cypher resolution matches the
 * in-memory resolver for every client × service × date-of-service combination.
 * Usage: NEO4J_URI=bolt://localhost:7687 NEO4J_USER=neo4j NEO4J_PASSWORD=... npx tsx scripts/seed-neo4j.ts
 */
import { seedNeo4j, resolveIdsNeo4j, neo4jEnabled } from "../src/lib/kb/neo4j";
import { resolveIdsInMemory } from "../src/lib/kb/graph";
import { CLIENTS, SERVICES } from "../src/lib/kb/data";

(async () => {
  if (!neo4jEnabled()) { console.error("Set NEO4J_URI, NEO4J_USER and NEO4J_PASSWORD"); process.exit(1); }
  const { nodes, edges } = await seedNeo4j();
  console.log(`Seeded ${nodes} nodes and ${edges} relationships.`);
  let checked = 0, mismatches = 0;
  for (const c of CLIENTS.filter((c) => c.planDoc)) for (const s of SERVICES) for (const dos of ["2025-03-01", "2025-08-15", "2025-11-01", "2026-03-18"]) {
    const q = { clientId: c.id, product: c.product, serviceCode: s.code, dos };
    const a = resolveIdsInMemory(q), b = await resolveIdsNeo4j(q);
    const norm = (x: typeof a) => JSON.stringify([x.versionId, [...x.supersededIds].sort(), [...x.provisionIds].sort(), [...x.memoIds].sort()]);
    checked++;
    if (norm(a) !== norm(b)) { mismatches++; console.log("MISMATCH", q, norm(a), norm(b)); }
  }
  console.log(`Parity check: ${checked - mismatches}/${checked} queries identical between Neo4j and in-memory.`);
  process.exit(mismatches ? 1 : 0);
})();
