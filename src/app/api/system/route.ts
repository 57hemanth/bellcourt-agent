import { geminiEnabled, geminiModel } from "@/lib/gemini";
import { neo4jEnabled } from "@/lib/kb/neo4j";
import { ENGINE_VERSION } from "@/lib/engine";

export async function GET() {
  return Response.json({ engine: ENGINE_VERSION, gemini: geminiEnabled() ? geminiModel() : null, graph: neo4jEnabled() ? "neo4j" : "in-memory" });
}
