import { GoogleGenAI } from "@google/genai";
import { liveConfig, liveModel } from "@/lib/voice";

export const runtime = "nodejs";
const hits = new Map<string, number[]>();

/** Mints a single-use, 60-second-to-start ephemeral token with the Live config locked server-side. */
export async function POST(req: Request) {
  const key = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  if (!key) return Response.json({ error: "Voice agent needs GEMINI_API_KEY" }, { status: 503 });
  const ip = req.headers.get("x-forwarded-for") ?? "local";
  const recent = (hits.get(ip) ?? []).filter((t) => Date.now() - t < 60_000);
  if (recent.length >= 6) return Response.json({ error: "Too many calls — try again in a minute" }, { status: 429 });
  hits.set(ip, [...recent, Date.now()]);

  const ai = new GoogleGenAI({ apiKey: key, httpOptions: { apiVersion: "v1alpha" } });
  const model = liveModel();
  const token = await ai.authTokens.create({
    config: {
      uses: 1,
      expireTime: new Date(Date.now() + 15 * 60_000).toISOString(),
      newSessionExpireTime: new Date(Date.now() + 60_000).toISOString(),
      liveConnectConstraints: { model, config: liveConfig() },
      httpOptions: { apiVersion: "v1alpha" },
    },
  });
  return Response.json({ token: token.name, model });
}
