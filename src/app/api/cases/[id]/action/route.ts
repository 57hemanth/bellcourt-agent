import { getCase, saveCase } from "@/lib/store";
import { authorize, personaById, project, type Action } from "@/lib/access";

export const runtime = "nodejs";
const ACTIONS: Action[] = ["APPROVE", "PEND", "ROUTE_TO_PHYSICIAN", "DENY_MEDICAL_NECESSITY", "DENY_NOT_COVERED", "REQUEST_INFO"];

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const persona = personaById(req.headers.get("x-bell-persona"));
  if (!persona) return Response.json({ error: "Sign in to the Bell console" }, { status: 401 });
  const c = getCase(id);
  if (!c) return Response.json({ error: "Not found" }, { status: 404 });
  const { action, note } = (await req.json()) as { action: Action; note?: string };
  if (!ACTIONS.includes(action)) return Response.json({ error: "Unknown action" }, { status: 400 });
  const denied = authorize(persona, action, c);
  const at = new Date().toISOString();
  const actor = `${persona.role}:${persona.name}`;
  if (denied) {
    c.audit.push({ at, actor, action: "ACTION_BLOCKED", detail: `${action}: ${denied}` });
    await saveCase(c);
    return Response.json({ error: denied }, { status: 403 });
  }
  if ((action.startsWith("DENY") || (action === "APPROVE" && c.evaluation?.recommendation !== "RECOMMEND_APPROVE")) && !note?.trim())
    return Response.json({ error: "A rationale note is required for this action." }, { status: 400 });

  const ev = c.evaluation;
  switch (action) {
    case "APPROVE":
      c.status = "APPROVED";
      c.decision = { outcome: "APPROVED", by: persona.name, at, note: note || `Criteria met per ${ev?.policy.version ?? "policy"}.` };
      c.messages.push({ at, from: "bellcourt", body: `APPROVED by ${persona.name}. ${note ?? ""}`.trim() });
      break;
    case "DENY_MEDICAL_NECESSITY":
    case "DENY_NOT_COVERED":
      c.status = "DENIED";
      c.decision = { outcome: action === "DENY_NOT_COVERED" ? "DENIED_NOT_COVERED" : "DENIED_MEDICAL_NECESSITY", by: persona.name, at, note: note! };
      c.messages.push({ at, from: "bellcourt", body: (ev?.letterDraft?.replace("[DRAFT — requires physician signature]", `Signed: ${persona.name}, ${at.slice(0, 10)}`) ?? note!) + `\n\nReviewer note: ${note}` });
      break;
    case "ROUTE_TO_PHYSICIAN":
      c.status = "ROUTED_TO_PHYSICIAN";
      c.routedNote = note || ev?.rationale || null;
      break;
    case "PEND":
    case "REQUEST_INFO":
      c.status = "PENDED_INFO_REQUESTED";
      c.messages.push({ at, from: "bellcourt", body: note || ev?.outreachMessage || "Please send additional clinical documentation." });
      break;
  }
  c.audit.push({ at, actor, action, detail: note, data: { recommendation: ev?.recommendation, agreedWithBell: (action === "APPROVE") === (ev?.recommendation === "RECOMMEND_APPROVE") } });
  await saveCase(c);
  return Response.json(project(c, persona.role));
}
