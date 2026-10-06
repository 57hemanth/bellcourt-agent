import { getCase, saveCase } from "@/lib/store";
import { authorize, personaById, project, type Action } from "@/lib/access";
import { resumeWithDecision } from "@/lib/agent/graph";

export const runtime = "nodejs";
const ACTIONS: Action[] = ["APPROVE", "PEND", "ROUTE_TO_PHYSICIAN", "DENY_MEDICAL_NECESSITY", "DENY_NOT_COVERED", "REQUEST_INFO"];

/** Reviewer decision: authorize on the server, then resume the case's paused LangGraph run. */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const persona = personaById(req.headers.get("x-bell-persona"));
  if (!persona) return Response.json({ error: "Sign in to the dashboard" }, { status: 401 });
  const c = getCase(id);
  if (!c) return Response.json({ error: "Not found" }, { status: 404 });
  const { action, note } = (await req.json()) as { action: Action; note?: string };
  if (!ACTIONS.includes(action)) return Response.json({ error: "Unknown action" }, { status: 400 });
  const denied = authorize(persona, action, c);
  if (denied) {
    c.audit.push({ at: new Date().toISOString(), actor: `${persona.role}:${persona.name}`, action: "ACTION_BLOCKED", detail: `${action}: ${denied}` });
    await saveCase(c);
    return Response.json({ error: denied }, { status: 403 });
  }
  if ((action.startsWith("DENY") || (action === "APPROVE" && c.evaluation?.recommendation !== "RECOMMEND_APPROVE")) && !note?.trim())
    return Response.json({ error: "A rationale note is required for this action." }, { status: 400 });

  const updated = await resumeWithDecision(id, { action, note, personaId: persona.id });
  return Response.json(project(updated!, persona.role));
}
