import { voiceLookup } from "@/lib/voice";
import { ensureSeeded } from "@/lib/server";

export const runtime = "nodejs";

/** Tool endpoint for the voice agent's get_case_status call. */
export async function POST(req: Request) {
  await ensureSeeded();
  const { case_id, patient_dob } = (await req.json()) as { case_id?: string; patient_dob?: string };
  return Response.json(await voiceLookup(String(case_id ?? "").slice(0, 40), String(patient_dob ?? "").slice(0, 40)));
}
