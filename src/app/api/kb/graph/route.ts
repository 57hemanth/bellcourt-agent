import { cachedGraph } from "@/lib/kb/graph";
import { DOCUMENTS, POLICY_VERSIONS } from "@/lib/kb/data";
import { neo4jEnabled } from "@/lib/kb/neo4j";

export async function GET() {
  const g = cachedGraph();
  return Response.json({ ...g, documents: DOCUMENTS, versions: POLICY_VERSIONS.map(({ criteria, ...v }) => ({ ...v, criteria: criteria.length })), backend: neo4jEnabled() ? "neo4j" : "memory" });
}
