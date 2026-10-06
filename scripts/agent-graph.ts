/** Prints the Bell LangGraph agent as a Mermaid diagram: npx tsx scripts/agent-graph.ts */
import { agentMermaid } from "../src/lib/agent/graph";
agentMermaid().then((m) => { console.log(m); process.exit(0); });
