import fs from "node:fs";
import path from "node:path";
import { UPLOAD_DIR } from "@/lib/store";

export const runtime = "nodejs";
const TYPES: Record<string, string> = { ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".tif": "image/tiff", ".tiff": "image/tiff", ".pdf": "application/pdf" };

export async function GET(_req: Request, ctx: { params: Promise<{ name: string }> }) {
  const { name } = await ctx.params;
  const safe = path.basename(name);
  const p = path.join(UPLOAD_DIR, safe);
  if (!fs.existsSync(p)) return new Response("Not found", { status: 404 });
  return new Response(fs.readFileSync(p), { headers: { "Content-Type": TYPES[path.extname(safe).toLowerCase()] ?? "application/octet-stream", "Cache-Control": "private, max-age=3600" } });
}
