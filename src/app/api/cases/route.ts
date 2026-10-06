import { listCases } from "@/lib/store";
import { personaById, project } from "@/lib/access";
import { ensureSeeded } from "@/lib/server";

export const runtime = "nodejs";

export async function GET(req: Request) {
  await ensureSeeded();
  const persona = personaById(req.headers.get("x-bell-persona"));
  const all = listCases();
  if (!persona) return Response.json(all.filter((c) => c.source === "PORTAL_UPLOAD").map((c) => project(c, "provider")).reverse());
  return Response.json(all.map((c) => project(c, persona.role)));
}
