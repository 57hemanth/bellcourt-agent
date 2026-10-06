import { supplement } from "@/lib/pipeline";
import { getCase } from "@/lib/store";
import { project } from "@/lib/access";

export const runtime = "nodejs";

/** Provider replies to an information request; Bell re-evaluates immediately. */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const c0 = getCase(id);
  if (!c0 || c0.source !== "PORTAL_UPLOAD") return Response.json({ error: "Not found" }, { status: 404 });
  const body = (await req.json()) as { text?: string; memberId?: string; diagnosisCode?: string };
  const text = (body.text ?? "").slice(0, 4000);
  const c = await supplement(id, text, { memberId: body.memberId?.trim() || null, diagnosisCode: body.diagnosisCode?.trim() || null });
  return c ? Response.json(project(c, "provider")) : Response.json({ error: "Not found" }, { status: 404 });
}
