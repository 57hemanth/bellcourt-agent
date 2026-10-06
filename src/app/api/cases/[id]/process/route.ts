import { processCase, type StepEvent } from "@/lib/pipeline";
import { getCase, saveCase } from "@/lib/store";
import { personaById, project } from "@/lib/access";

export const runtime = "nodejs";

/** A reviewer opened a new fax: Bell reads and evaluates it, streaming each step (NDJSON). */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const persona = personaById(req.headers.get("x-bell-persona"));
  if (!persona) return Response.json({ error: "Sign in to the dashboard" }, { status: 401 });
  if (!getCase(id)) return Response.json({ error: "Not found" }, { status: 404 });
  const enc = new TextEncoder();
  const stream = new ReadableStream({
    async start(ctrl) {
      const send = (o: unknown) => ctrl.enqueue(enc.encode(JSON.stringify(o) + "\n"));
      try {
        const c = await processCase(id, (e: StepEvent) => send({ type: "step", ...e }), 700);
        if (c) c.audit.push({ at: new Date().toISOString(), actor: `${persona.role}:${persona.name}`, action: "OPENED_NEW_FAX", detail: "Reviewer opened the case; Bell processed the document" });
        if (c) await saveCase(c);
        send({ type: "case", case: c && project(c, persona.role) });
      } catch (e) {
        send({ type: "error", error: (e as Error).message });
      } finally {
        ctrl.close();
      }
    },
  });
  return new Response(stream, { headers: { "Content-Type": "application/x-ndjson", "Cache-Control": "no-store" } });
}
