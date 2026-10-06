import { clearStore } from "@/lib/store";
import { seedOpenQueue } from "@/lib/pipeline";

export const runtime = "nodejs";

export async function POST() {
  await clearStore();
  await seedOpenQueue();
  return Response.json({ ok: true });
}
