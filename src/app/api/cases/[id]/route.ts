import { getCase } from "@/lib/store";
import { personaById, project } from "@/lib/access";
import { ensureSeeded } from "@/lib/server";

export const runtime = "nodejs";

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  await ensureSeeded();
  const { id } = await ctx.params;
  const c = getCase(id);
  if (!c) return Response.json({ error: "Not found" }, { status: 404 });
  const persona = personaById(req.headers.get("x-bell-persona"));
  if (!persona && c.source !== "PORTAL_UPLOAD") return Response.json({ error: "Not found" }, { status: 404 });
  return Response.json(project(c, persona?.role ?? "provider"));
}
