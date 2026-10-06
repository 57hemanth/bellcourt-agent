/**
 * Intake pipeline: receipt → read → identify member → resolve rules → evaluate → outreach.
 * Emits step events so the UI can show progress. Every input/output is written to the
 * case audit trail (Riverbend addendum §5: inputs and outputs producible on audit).
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { evaluate, slaHours } from "./engine";
import { parseFacts, type Facts } from "./facts";
import { cachedFax } from "./fixtures/faxes";
import { geminiEnabled, geminiExtractFacts, geminiExtractFax, geminiModel } from "./gemini";
import { serviceByCode, serviceByName } from "./kb/data";
import { findMember, openCases } from "./seed";
import { getCase, nextCaseId, saveCase, UPLOAD_DIR } from "./store";
import type { AuditEvent, CaseRecord, CaseStatus, Channel, IntakeFields, Recommendation, Urgency } from "./types";

export type StepId = "received" | "read" | "member" | "rules" | "criteria" | "outreach";
export interface StepEvent { step: StepId; status: "active" | "done" | "warn"; label: string; detail?: string; data?: unknown }
type Emit = (e: StepEvent) => void;

const now = () => new Date().toISOString();
const audit = (actor: string, action: string, detail?: string, data?: unknown): AuditEvent => ({ at: now(), actor, action, detail, data });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function statusFor(rec: Recommendation): CaseStatus {
  return rec === "PEND_FOR_INFO" ? "PENDED_INFO_REQUESTED" : rec === "ELIGIBILITY_HOLD" ? "ELIGIBILITY_HOLD" : "AWAITING_NURSE_REVIEW";
}

async function extractFacts(serviceCode: string | null, fields: IntakeFields, age: number | null): Promise<{ facts: Facts; method: "gemini" | "rules"; disagreements: string[] }> {
  if (!serviceCode || !fields.clinicalNotes) return { facts: {}, method: "rules", disagreements: [] };
  const rules = parseFacts(serviceCode, fields.clinicalNotes, { ageYears: age, requestingProvider: fields.requestingProvider });
  if (!geminiEnabled()) return { facts: rules, method: "rules", disagreements: [] };
  try {
    const llm = await geminiExtractFacts(serviceCode, fields.clinicalNotes);
    const disagreements = Object.keys(llm).filter((k) => rules[k] !== undefined && rules[k] !== null && llm[k] !== null && JSON.stringify(rules[k]) !== JSON.stringify(llm[k]));
    // Deterministic parser wins where it found a value; LLM fills what the parser could not.
    const merged: Facts = { ...llm };
    for (const [k, v] of Object.entries(rules)) if (v !== null && v !== undefined) merged[k] = v;
    return { facts: merged, method: "gemini", disagreements };
  } catch (e) {
    return { facts: rules, method: "rules", disagreements: [`AI reading unavailable: ${(e as Error).message}`] };
  }
}

/** Core: from intake fields to an evaluated case. */
async function runEvaluation(c: CaseRecord, emit: Emit, pace: number) {
  const f = c.extraction!.fields;
  const svc = serviceByCode(f.serviceCode) ?? serviceByName(f.serviceRequested);
  if (svc) f.serviceCode = svc.code;

  emit({ step: "member", status: "active", label: "Verifying member eligibility" });
  await sleep(pace);
  const m = f.memberId ? findMember(f.memberId) : undefined;
  emit({ step: "member", status: m ? "done" : "warn", label: m ? `Member ${m.member_id} · ${m.client_id}` : f.memberId ? "Member ID not found" : "Member ID missing", detail: m ? `${m.member_state} · coverage from ${m.coverage_start}${m.coverage_end ? ` to ${m.coverage_end}` : ""}` : "Will request from provider" });

  emit({ step: "rules", status: "active", label: "Reading the clinical notes and resolving the governing rules" });
  const ageGuess = null;
  const facts = await extractFacts(f.serviceCode, f, ageGuess);
  c.facts = facts.facts;
  c.factsMethod = facts.method;
  c.audit.push(audit("bell", "FACTS_EXTRACTED", "Clinical facts taken from the notes and cross-checked", { facts: facts.facts, disagreements: facts.disagreements }));
  const ev = await evaluate({ fields: f, facts: facts.facts, receivedAt: c.receivedAt });
  for (const d of facts.disagreements) ev.flags.push({ code: "EXTRACTION_DISAGREEMENT", severity: "info", message: `Two independent readings disagree on "${d}" — the rule-based value was used; verify against the source.` });
  await sleep(pace);
  emit({ step: "rules", status: "done", label: ev.policy.version ? `Governing: ${ev.rulePath.filter((r) => r.effect === "APPLIES" || r.effect === "OVERRIDES").map((r) => r.docId.split(" §")[0]).slice(-2).join(" → ")}` : "Rules unresolved", detail: ev.rulePath.filter((r) => r.effect === "VOID" || r.effect === "SUPERSEDED").map((r) => `${r.docId} ${r.effect.toLowerCase()}`).join(" · ") || undefined });

  emit({ step: "criteria", status: "active", label: "Checking criteria with citations" });
  await sleep(pace);
  const all = [...ev.planProvisions, ...ev.criteria];
  const notMet = all.filter((x) => x.status === "NOT_MET").length, miss = all.filter((x) => x.status === "MISSING").length;
  const label = ev.recommendation === "RECOMMEND_APPROVE" ? `Criteria satisfied (${ev.policy.version}: ${ev.policy.logic})` : ev.recommendation === "PEND_FOR_INFO" ? `${miss || ev.missing.length} item(s) not documented` : ev.recommendation === "ELIGIBILITY_HOLD" ? "Eligibility issue" : `${notMet} rule(s) not met — needs a physician`;
  emit({ step: "criteria", status: ev.recommendation === "RECOMMEND_APPROVE" ? "done" : "warn", label, detail: ev.rationale });

  // Re-derive the clock now that the product is known
  const urgency: Urgency = f.urgency === "URGENT" || c.slaHours === 72 ? "URGENT" : "STANDARD";
  c.slaHours = slaHours(ev.client.product, urgency);
  c.dueAt = new Date(new Date(c.receivedAt).getTime() + c.slaHours * 3600_000).toISOString();

  c.evaluation = ev;
  c.status = statusFor(ev.recommendation);
  c.audit.push(audit("bell", "EVALUATED", `${ev.recommendation} — ${ev.rationale}`, { evaluation: { ...ev, letterDraft: undefined, outreachMessage: undefined } }));

  emit({ step: "outreach", status: "active", label: "Preparing response" });
  await sleep(pace / 2);
  if (ev.outreachMessage) {
    c.messages.push({ at: now(), from: "bell", body: ev.outreachMessage });
    c.audit.push(audit("bell", "OUTREACH_SENT", `Info request to ${f.requestingProvider ?? "provider"} via ${c.channel === "FAX" ? "fax/portal" : "portal"} (clock not paused)`, { missing: ev.missing }));
    emit({ step: "outreach", status: "warn", label: `Information requested (${ev.missing.length})`, detail: ev.missing.map((x) => x.item).join(", ") });
  } else {
    c.messages.push({ at: now(), from: "bell", body: `Received and complete. Your request is with a Bellcourt clinical reviewer. Decision due by ${new Date(c.dueAt).toUTCString()}.` });
    emit({ step: "outreach", status: "done", label: "Complete — sent to clinical review" });
  }
}

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

/** Step 2 — Bell reads the document and evaluates it (run when a reviewer opens the case, or in batch for seeding). */
export function processCase(id: string, emit: Emit = () => {}, pace = 0): Promise<CaseRecord | null> {
  const running = inFlight.get(id);
  if (running) return running;
  const p = doProcess(id, emit, pace).finally(() => inFlight.delete(id));
  inFlight.set(id, p);
  return p;
}

async function doProcess(id: string, emit: Emit, pace: number): Promise<CaseRecord | null> {
  const c = getCase(id);
  if (!c) return null;
  if (c.evaluation) return c;
  emit({ step: "received", status: "done", label: `Received ${new Date(c.receivedAt).toLocaleString("en-US", { timeZone: "UTC" })} UTC`, detail: `Case ${id} · clock started at receipt`, data: { id, receivedAt: c.receivedAt } });
  await sleep(pace / 2);
  emit({ step: "read", status: "active", label: c.file ? "Reading the fax" : "Reading structured submission" });

  if (c.file && !c.extraction) {
    const data = fs.readFileSync(path.join(UPLOAD_DIR, path.basename(c.file)));
    const hash = crypto.createHash("sha256").update(data).digest("hex");
    const cached = cachedFax(hash.slice(0, 16));
    if (cached && c.source === "OPEN_QUEUE") c.extraction = { method: "cache", fields: cached, confidence: 1 };
    else if (geminiEnabled()) {
      try {
        const r = await geminiExtractFax(data, c.fileMime ?? "image/png");
        c.extraction = { method: "gemini", model: geminiModel(), fields: r.fields, confidence: r.confidence };
      } catch (e) {
        c.audit.push(audit("bell", "READ_ERROR", (e as Error).message));
      }
    }
    if (!c.extraction && cached) c.extraction = { method: "cache", fields: cached, confidence: 1 };
    if (!c.extraction) {
      c.extraction = { method: "manual", fields: emptyFields(), confidence: 0 };
      c.audit.push(audit("bell", "READ_UNAVAILABLE", "Document could not be read automatically — routed to intake for manual keying"));
    }
  }
  await sleep(pace);
  const f = c.extraction!.fields;
  c.audit.push(audit("bell", "FIELDS_EXTRACTED", c.extraction!.method === "structured" ? "Request details received from the submission" : c.extraction!.method === "manual" ? "Document could not be read; sent to intake" : "Request details read from the fax", { fields: f }));
  emit({ step: "read", status: c.extraction!.method === "manual" ? "warn" : "done", label: c.extraction!.method === "manual" ? "Could not read — sent to intake" : `Extracted ${Object.values(f).filter(Boolean).length} fields`, data: { fields: f, method: c.extraction!.method } });

  // Urgency: the stricter of the form and the transmission metadata; flag conflicts
  const formUrg = f.urgency ?? "STANDARD";
  const declared = c.declaredUrgency;
  const urgency: Urgency = formUrg === "URGENT" || declared === "URGENT" ? "URGENT" : "STANDARD";
  c.slaHours = urgency === "URGENT" ? 72 : 168;
  c.dueAt = new Date(new Date(c.receivedAt).getTime() + c.slaHours * 3600_000).toISOString();

  if (c.extraction!.method === "manual") {
    await saveCase(c);
    return c;
  }
  await runEvaluation(c, emit, pace);
  if (declared && declared !== formUrg) {
    c.evaluation!.flags.unshift({ code: "URGENCY_MISMATCH", severity: "warning", message: `Form marks ${formUrg.toLowerCase()} but the transmission was logged ${declared.toLowerCase()}. Clock set to the stricter (${urgency.toLowerCase()}, ${c.slaHours} h) — confirm with the provider.` });
  }
  await saveCase(c);
  return c;
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
  await runEvaluation(c, () => {}, 0);
  await saveCase(c);
  return c;
}

const emptyFields = (): IntakeFields => ({ patientName: null, patientDob: null, memberId: null, planOrEmployer: null, requestingProvider: null, npi: null, serviceRequested: null, serviceCode: null, dateOfService: null, diagnosisCode: null, clinicalNotes: null, urgency: null, signatureDate: null, faxHeader: null });

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
