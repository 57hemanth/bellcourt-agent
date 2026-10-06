/**
 * Bell voice status line (Gemini Live). The browser never sees the API key: the server mints a
 * single-use ephemeral token whose Live config (model, instructions, tools) is locked server-side.
 * Case lookups require the case number AND the patient's date of birth before anything is disclosed.
 */
import { Modality } from "@google/genai";
import { getCase, listCases, saveCase } from "./store";
import { PROVIDER_STATUS } from "./access";

export const liveModel = () => process.env.GEMINI_LIVE_MODEL || "gemini-3.8-live";

export const VOICE_INSTRUCTIONS = `You are Bell, the automated prior-authorization status line for Bellcourt Health Administrators.
Callers are provider-office staff checking on requests they submitted. Be fast and direct — this is a phone call.

1. Greet in one short sentence and ask for the case number and the patient's date of birth together.
   e.g. "Hi, this is Bell from Bellcourt. What's the case number and the patient's date of birth?"
2. Callers may give just the short number ("case two", "case 8113") — that is fine. As soon as you have a case number
   and a date of birth, call get_case_status immediately. Do not read the number back or ask for confirmation first.
3. Answer in ONE short reply using only what the tool returns, leading with the most important news:
   - If decision.outcome is "approved": say clearly that the request is approved, for which service, and on what date,
     e.g. "Good news — the physical therapy request was approved on October sixth by a Bellcourt reviewer."
   - If it was denied: say it was not approved, give the reason exactly as returned, and explain the appeal rights returned.
   - If information is needed: list each missing item and why, then "You can reply in the provider portal or fax
     615-555-0142 with the case number."
   - If it is still in review: say so and when the decision is due.
4. If verification fails, say you couldn't match that case number and date of birth and ask them to try again.
   Reveal nothing about any case.
5. You cannot approve, deny, expedite or change a request, and you give no clinical advice; decisions are made by
   Bellcourt nurses and physicians. Never invent a status, date or requirement. Speak dates as words.`;

export const VOICE_TOOLS = [{
  functionDeclarations: [{
    name: "get_case_status",
    description: "Look up a prior authorization request. Requires the case number and the patient's date of birth for verification.",
    parametersJsonSchema: {
      type: "object",
      properties: {
        case_id: { type: "string", description: "Case number as spoken — full (e.g. 'BC-2610-0002', 'PA 2609 8113') or just the short number (e.g. '2', '8113')" },
        patient_dob: { type: "string", description: "Patient date of birth as spoken, e.g. 'April 9 1982' or '04/09/1982'" },
      },
      required: ["case_id", "patient_dob"],
    },
  }],
}];

export const liveConfig = () => ({
  responseModalities: [Modality.AUDIO],
  systemInstruction: VOICE_INSTRUCTIONS,
  tools: VOICE_TOOLS,
  inputAudioTranscription: {},
  outputAudioTranscription: {},
  speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: process.env.GEMINI_LIVE_VOICE || "Charon" } } },
});

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
/** Spoken or written DOB → YYYY-MM-DD (null if unparseable). */
export function normalizeDob(raw: string): string | null {
  const s = raw.toLowerCase().replace(/(\d)(st|nd|rd|th)\b/g, "$1").replace(/[,]/g, " ").trim();
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
  m = s.match(/^(\d{1,2})[/.\s-](\d{1,2})[/.\s-](\d{4})$/);
  if (m) return `${m[3]}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}`;
  m = s.match(/^([a-z]+)\s+(\d{1,2})\s+(\d{4})$/);
  if (m) { const i = MONTHS.indexOf(m[1].slice(0, 3)); if (i >= 0) return `${m[3]}-${String(i + 1).padStart(2, "0")}-${m[2].padStart(2, "0")}`; }
  m = s.match(/^(\d{1,2})\s+([a-z]+)\s+(\d{4})$/);
  if (m) { const i = MONTHS.indexOf(m[2].slice(0, 3)); if (i >= 0) return `${m[3]}-${String(i + 1).padStart(2, "0")}-${m[1].padStart(2, "0")}`; }
  return null;
}

/**
 * Spoken case number → candidate case ids. Accepts a full id ("B C 2610 0002", "pa-2609-8113") or just the
 * trailing number ("2", "8113"). Short numbers can match several cases; the DOB check then picks the one.
 */
export function caseCandidates(spoken: string): string[] {
  const key = spoken.toUpperCase().replace(/[^A-Z0-9]/g, "");
  const all = listCases();
  const exact = all.find((c) => c.id.replace(/-/g, "") === key);
  if (exact) return [exact.id];
  const digits = key.replace(/[A-Z]/g, "").replace(/^0+(?=\d)/, "");
  if (!digits) return [];
  return all.filter((c) => { const last = c.id.split("-").at(-1)!.replace(/^0+(?=\d)/, ""); return last === digits || c.id.replace(/\D/g, "").endsWith(digits) && digits.length >= 4; }).map((c) => c.id);
}

const failures = new Map<string, number>();

export async function voiceLookup(caseSpoken: string, dobSpoken: string) {
  const dob = normalizeDob(dobSpoken ?? "");
  const nope = { verified: false, message: "No case matched that case number and date of birth." };
  const candidates = caseCandidates(caseSpoken ?? "");
  const dobOf = (cid: string) => { const d = getCase(cid)?.extraction?.fields.patientDob; return d ? normalizeDob(d) : null; };
  const matching = dob ? candidates.filter((cid) => dobOf(cid) === dob) : [];
  // A short number is only accepted when exactly one case with that number matches the DOB.
  const id = matching.length === 1 ? matching[0] : candidates.length === 1 ? candidates[0] : null;
  if (!id || !dob) return nope;
  if ((failures.get(id) ?? 0) >= 5) return { verified: false, message: "Too many unsuccessful attempts for this case. Please use the provider portal." };
  const c = getCase(id)!;
  const f = c.extraction?.fields;
  const caseDob = f?.patientDob ? normalizeDob(f.patientDob) : null;
  const at = new Date().toISOString();
  if (!caseDob || caseDob !== dob) {
    failures.set(id, (failures.get(id) ?? 0) + 1);
    c.audit.push({ at, actor: "bell-voice", action: "VOICE_VERIFICATION_FAILED", detail: "Caller DOB did not match" });
    await saveCase(c);
    return nope;
  }
  failures.delete(id);
  c.audit.push({ at, actor: "bell-voice", action: "VOICE_STATUS_DISCLOSED", detail: "Status read to verified caller (case number + DOB)" });
  await saveCase(c);
  const hoursLeft = Math.round((new Date(c.dueAt).getTime() - Date.now()) / 3600_000);
  return {
    verified: true,
    case_id: c.id,
    service: f?.serviceRequested ?? null,
    status: PROVIDER_STATUS[c.status],
    received: new Date(c.receivedAt).toDateString(),
    decision_due_by: new Date(c.dueAt).toDateString(),
    hours_until_due: hoursLeft,
    information_needed: c.status === "PENDED_INFO_REQUESTED" ? (c.evaluation?.missing ?? []).map((m) => ({ item: m.item, why: m.why })) : [],
    decision: c.decision ? {
      outcome: c.decision.outcome === "APPROVED" ? "approved" : c.decision.outcome === "DENIED_NOT_COVERED" ? "not approved — not covered by the plan" : c.decision.outcome === "DENIED_MEDICAL_NECESSITY" ? "not approved — medical necessity criteria not met" : "partially approved",
      decided_on: new Date(c.decision.at).toDateString(),
      decided_by: c.decision.outcome === "APPROVED" ? "a Bellcourt clinical reviewer" : "a Bellcourt physician reviewer",
      reason: c.decision.outcome === "APPROVED" ? null : c.decision.note,
      appeal_rights: c.decision.outcome === "APPROVED" ? null : "You may appeal within 180 days. A physician not involved in this decision reviews the appeal, and the requesting provider may ask for a peer-to-peer discussion.",
    } : null,
    how_to_respond: "Reply in the Bellcourt provider portal or fax (615) 555-0142 quoting the case number.",
  };
}
