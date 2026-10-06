import { receive } from "@/lib/pipeline";
import { project } from "@/lib/access";
import { ensureSeeded } from "@/lib/server";

export const runtime = "nodejs";
const MAX_BYTES = 10 * 1024 * 1024;
const ALLOWED = ["image/png", "image/jpeg", "image/tiff", "application/pdf"];

/** Provider upload: store the fax and stamp receipt. Bell processes it when a reviewer opens it. */
export async function POST(req: Request) {
  await ensureSeeded();
  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return Response.json({ error: "No file uploaded" }, { status: 400 });
  if (file.size > MAX_BYTES) return Response.json({ error: "File exceeds 10 MB" }, { status: 413 });
  if (!ALLOWED.includes(file.type)) return Response.json({ error: `Unsupported file type. Upload PNG, JPEG, TIFF or PDF.` }, { status: 415 });
  const c = await receive({ source: "PORTAL_UPLOAD", channel: "FAX", file: { data: Buffer.from(await file.arrayBuffer()), mime: file.type, name: file.name } });
  return Response.json(project(c, "provider"));
}
