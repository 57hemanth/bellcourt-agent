/**
 * Case intake and lifecycle. Receipt is stamped here; everything after receipt runs inside the
 * Bell LangGraph agent (./agent/graph.ts): read → verify member → resolve rules → check criteria →
 * outreach → human review (interrupt) → apply decision.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { emptyFields, reevaluate, runAgent, statusFor, type Emit, type StepEvent, type StepId } from "./agent/graph";
import { openCases } from "./seed";
import { getCase, nextCaseId, saveCase, UPLOAD_DIR } from "./store";
import type { AuditEvent, CaseRecord, Channel, IntakeFields, Urgency } from "./types";

export { statusFor };
export type { StepEvent, StepId };

const now = () => new Date().toISOString();
const audit = (actor: string, action: string, detail?: string, data?: unknown): AuditEvent => ({ at: now(), actor, action, detail, data });

export interface IntakeInput {
  file?: { data: Buffer; mime: string; name: string };
  structured?: IntakeFields;
  channel: Channel;
  receivedAt?: string;
  declaredUrgency?: Urgency;
  id?: string;
  source: CaseRecord["source"];
  pace?: number; // ms between steps (UI pacing); 0 for batch
  originalReceivedTs?: string;
}

/** Step 1 — receipt only: store the document, stamp the clock, acknowledge the provider. */
export async function receive(input: IntakeInput): Promise<CaseRecord> {
  const receivedAt = input.receivedAt ?? now();
  const id = input.id ?? nextCaseId();
  const c: CaseRecord = {
    id, source: input.source, channel: input.channel, receivedAt, slaHours: input.declaredUrgency === "URGENT" ? 72 : 168, dueAt: receivedAt, status: "RECEIVED",
    file: null, fileMime: null, extraction: null, facts: {}, factsMethod: null, evaluation: null, decision: null, routedNote: null,
    messages: [], audit: [audit("system", "RECEIVED", `Channel ${input.channel}; receipt timestamp recorded${input.originalReceivedTs ? ` (data-pack receipt ${input.originalReceivedTs}; demo clock shifted)` : ""}`)], supplements: [],
    declaredUrgency: input.declaredUrgency,
  };
  c.dueAt = new Date(new Date(receivedAt).getTime() + c.slaHours * 3600_000).toISOString();
  if (input.file) {
    const hash = crypto.createHash("sha256").update(input.file.data).digest("hex");
    const ext = path.extname(input.file.name) || (input.file.mime === "application/pdf" ? ".pdf" : ".png");
    const stored = `${id}${ext}`;
    fs.writeFileSync(path.join(UPLOAD_DIR, stored), input.file.data);
    c.file = `/api/files/${stored}`;
    c.fileMime = input.file.mime;
    c.audit.push(audit("system", "FILE_STORED", `${input.file.name} sha256=${hash.slice(0, 16)}…`));
  } else if (input.structured) {
    c.extraction = { method: "structured", fields: input.structured, confidence: 1 };
  }
  c.messages.push({ at: now(), from: "bell", body: `We received your request on ${new Date(receivedAt).toUTCString()}. Case ${id}. It is in the Bellcourt review queue — you'll see any questions from us here.` });
  await saveCase(c);
  return c;
}

const inFlight = new Map<string, Promise<CaseRecord | null>>();

/** Bell reads and evaluates the case (when a reviewer opens it, or in batch for seeding). */
export function processCase(id: string, emit: Emit = () => {}, pace = 0): Promise<CaseRecord | null> {
  const running = inFlight.get(id);
  if (running) return running;
  const c = getCase(id);
  if (!c) return Promise.resolve(null);
  if (c.evaluation) return Promise.resolve(c);
  const p = runAgent(id, emit, pace).finally(() => inFlight.delete(id));
  inFlight.set(id, p);
  return p;
}

/** Receive + process in one go (seeding the open queue). */
export async function intake(input: IntakeInput, emit: Emit = () => {}): Promise<CaseRecord> {
  const c = await receive(input);
  return (await processCase(c.id, emit, input.pace ?? 0))!;
}

/** Provider supplies missing information → merge and re-evaluate. */
export async function supplement(id: string, text: string, fieldPatch: Partial<IntakeFields> = {}): Promise<CaseRecord | null> {
  const c = getCase(id);
  if (!c || !c.extraction) return null;
  c.supplements.push({ at: now(), text });
  c.messages.push({ at: now(), from: "provider", body: text || "Updated request details." });
  const f = c.extraction.fields;
  for (const [k, v] of Object.entries(fieldPatch)) if (v) (f as unknown as Record<string, unknown>)[k] = v;
  if (text) f.clinicalNotes = `${f.clinicalNotes ?? ""} ${text}`.trim();
  c.audit.push(audit("provider", "INFO_SUPPLIED", text, { fieldPatch }));
  await saveCase(c);
  return reevaluate(id);
}


/** Seeds the Bell queue with the 30 open cases from the data pack. */
export async function seedOpenQueue() {
  const samplesDir = path.join(process.cwd(), "public", "samples");
  const all = openCases();
  const ts = (oc: (typeof all)[number]) => new Date(oc.received_ts.replace(" ", "T") + ":00Z").getTime();
  // Demo clock: shift the pack's receipt times so the newest case arrived 3 h ago (order and gaps preserved).
  const shift = Date.now() - 3 * 3600_000 - Math.max(...all.map(ts));
  for (const oc of all) {
    const receivedAt = new Date(ts(oc) + shift).toISOString();
    if (oc.channel === "FAX" && oc.fax_image) {
      const name = path.basename(oc.fax_image);
      const data = fs.readFileSync(path.join(samplesDir, name));
      await intake({ id: oc.case_id, source: "OPEN_QUEUE", channel: "FAX", receivedAt, originalReceivedTs: oc.received_ts, declaredUrgency: oc.urgency, file: { data, mime: "image/png", name } });
    } else {
      const fields: IntakeFields = {
        ...emptyFields(), patientName: oc.patient_name ?? null, patientDob: oc.patient_dob ?? null, memberId: oc.member_id,
        requestingProvider: oc.requesting_provider, npi: oc.provider_npi, serviceRequested: oc.service_requested ?? null,
        serviceCode: oc.service_code, dateOfService: oc.date_of_service, clinicalNotes: oc.clinical_notes, urgency: oc.urgency,
        diagnosisCode: "on file", planOrEmployer: oc.client_id,
      };
      await intake({ id: oc.case_id, source: "OPEN_QUEUE", channel: oc.channel, receivedAt, originalReceivedTs: oc.received_ts, declaredUrgency: oc.urgency, structured: fields });
    }
  }
}
