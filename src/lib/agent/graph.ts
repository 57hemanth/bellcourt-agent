/**
 * Bell agent — a LangGraph state graph.
 *
 *   START ─┬─▶ receipt ─▶ read_document ─┬─▶ intake_handoff ─▶ END        (unreadable → manual keying)
 *          │                             └─▶ verify_member
 *          ├─▶ verify_member  (re-evaluation after the provider supplies information)
 *          └─▶ human_review   (decision on a case whose run is no longer in memory)
 *
 *   verify_member ─▶ resolve_rules ─▶ check_criteria ─┬─▶ request_info ──┐
 *                                                     └─▶ queue_review ──┴─▶ human_review ⏸ interrupt()
 *   human_review ─▶ apply_decision ─┬─▶ END            (approve / deny — final)
 *                                   └─▶ human_review   (request info / route to physician — still open)
 *
 * Design rules (Riverbend addendum §5):
 *  - Every node is deterministic code. Gemini is only called inside read_document / resolve_rules to READ
 *    the fax and notes; it never chooses an edge, a rule or an outcome.
 *  - There is no path to a decision that does not pass through human_review: the graph literally pauses
 *    (interrupt) until a nurse or physician resumes it, and the API authorizes them before it resumes.
 *  - Each node persists the case and writes its inputs/outputs to the audit trail.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { Annotation, Command, END, interrupt, MemorySaver, START, StateGraph, type LangGraphRunnableConfig } from "@langchain/langgraph";
import { evaluate, slaHours } from "../engine";
import { parseFacts, type Facts } from "../facts";
import { cachedFax } from "../fixtures/faxes";
import { geminiEnabled, geminiExtractFacts, geminiExtractFax, geminiModel } from "../gemini";
import { serviceByCode, serviceByName } from "../kb/data";
import { findMember } from "../seed";
import { getCase, saveCase, UPLOAD_DIR } from "../store";
import { personaById, type Action } from "../access";
import type { AuditEvent, CaseRecord, CaseStatus, IntakeFields, Recommendation, Urgency } from "../types";

export type StepId = "received" | "read" | "member" | "rules" | "criteria" | "outreach";
export interface StepEvent { step: StepId; status: "active" | "done" | "warn"; label: string; detail?: string; data?: unknown }
export type Emit = (e: StepEvent) => void;
export interface Decision { action: Action; note?: string; personaId: string }

/* ------------------------------------------------------------------ state */

const BellState = Annotation.Root({
  caseId: Annotation<string>(),
  entry: Annotation<"process" | "reevaluate" | "review">(),
  readable: Annotation<boolean>({ reducer: (_a, b) => b, default: () => true }),
  recommendation: Annotation<Recommendation | null>({ reducer: (_a, b) => b, default: () => null }),
  lastAction: Annotation<Action | null>({ reducer: (_a, b) => b, default: () => null }),
  decision: Annotation<Decision | null>({ reducer: (_a, b) => b, default: () => null }),
});
type S = typeof BellState.State;
type Cfg = LangGraphRunnableConfig;

/* ------------------------------------------------------------------ helpers */

const now = () => new Date().toISOString();
const audit = (actor: string, action: string, detail?: string, data?: unknown): AuditEvent => ({ at: now(), actor, action, detail, data });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const emitOf = (cfg: Cfg): Emit => (cfg.configurable?.emit as Emit | undefined) ?? (() => {});
const paceOf = (cfg: Cfg): number => (cfg.configurable?.pace as number | undefined) ?? 0;
function load(id: string): CaseRecord {
  const c = getCase(id);
  if (!c) throw new Error(`Case ${id} not found`);
  return c;
}
export const statusFor = (rec: Recommendation): CaseStatus =>
  rec === "PEND_FOR_INFO" ? "PENDED_INFO_REQUESTED" : rec === "ELIGIBILITY_HOLD" ? "ELIGIBILITY_HOLD" : "AWAITING_NURSE_REVIEW";
export const emptyFields = (): IntakeFields => ({ patientName: null, patientDob: null, memberId: null, planOrEmployer: null, requestingProvider: null, npi: null, serviceRequested: null, serviceCode: null, dateOfService: null, diagnosisCode: null, clinicalNotes: null, urgency: null, signatureDate: null, faxHeader: null });

async function extractFacts(serviceCode: string | null, fields: IntakeFields): Promise<{ facts: Facts; method: "gemini" | "rules"; disagreements: string[] }> {
  if (!serviceCode || !fields.clinicalNotes) return { facts: {}, method: "rules", disagreements: [] };
  const rules = parseFacts(serviceCode, fields.clinicalNotes, { requestingProvider: fields.requestingProvider });
  if (!geminiEnabled()) return { facts: rules, method: "rules", disagreements: [] };
  try {
    const llm = await geminiExtractFacts(serviceCode, fields.clinicalNotes);
    const disagreements = Object.keys(llm).filter((k) => rules[k] !== undefined && rules[k] !== null && llm[k] !== null && JSON.stringify(rules[k]) !== JSON.stringify(llm[k]));
    const merged: Facts = { ...llm };
    for (const [k, v] of Object.entries(rules)) if (v !== null && v !== undefined) merged[k] = v; // rule-based value wins
    return { facts: merged, method: "gemini", disagreements };
  } catch (e) {
    return { facts: rules, method: "rules", disagreements: [`AI reading unavailable: ${(e as Error).message}`] };
  }
}

/* ------------------------------------------------------------------ nodes */

async function receipt(s: S, cfg: Cfg) {
  const c = load(s.caseId);
  emitOf(cfg)({ step: "received", status: "done", label: `Received ${new Date(c.receivedAt).toLocaleString("en-US", { timeZone: "UTC" })} UTC`, detail: `Case ${c.id} · clock started at receipt`, data: { id: c.id, receivedAt: c.receivedAt } });
  c.audit.push(audit("bell-agent", "AGENT_RUN_STARTED", `LangGraph thread ${cfg.configurable?.thread_id}`));
  await saveCase(c);
  await sleep(paceOf(cfg) / 2);
  return {};
}

async function readDocument(s: S, cfg: Cfg) {
  const c = load(s.caseId);
  const emit = emitOf(cfg);
  emit({ step: "read", status: "active", label: c.file ? "Reading the fax" : "Reading structured submission" });
  if (c.file && !c.extraction) {
    const data = fs.readFileSync(path.join(UPLOAD_DIR, path.basename(c.file)));
    const cached = cachedFax(crypto.createHash("sha256").update(data).digest("hex").slice(0, 16));
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
    if (!c.extraction) c.extraction = { method: "manual", fields: emptyFields(), confidence: 0 };
  }
  await sleep(paceOf(cfg));
  const f = c.extraction!.fields;
  const readable = c.extraction!.method !== "manual";
  c.audit.push(audit("bell", "FIELDS_EXTRACTED", c.extraction!.method === "structured" ? "Request details received from the submission" : readable ? "Request details read from the fax" : "Document could not be read; sent to intake", { fields: f }));

  // Clock: the stricter of the form's urgency and the transmission metadata
  const urgency: Urgency = f.urgency === "URGENT" || c.declaredUrgency === "URGENT" ? "URGENT" : "STANDARD";
  c.slaHours = urgency === "URGENT" ? 72 : 168;
  c.dueAt = new Date(new Date(c.receivedAt).getTime() + c.slaHours * 3600_000).toISOString();
  await saveCase(c);
  emit({ step: "read", status: readable ? "done" : "warn", label: readable ? `Extracted ${Object.values(f).filter(Boolean).length} fields` : "Could not read — sent to intake", data: { fields: f, method: c.extraction!.method } });
  return { readable };
}

async function intakeHandoff(s: S) {
  const c = load(s.caseId);
  c.audit.push(audit("bell", "READ_UNAVAILABLE", "Document could not be read automatically — routed to intake for manual keying"));
  await saveCase(c);
  return {};
}

async function verifyMember(s: S, cfg: Cfg) {
  const c = load(s.caseId);
  const emit = emitOf(cfg);
  const f = c.extraction!.fields;
  const svc = serviceByCode(f.serviceCode) ?? serviceByName(f.serviceRequested);
  if (svc) f.serviceCode = svc.code;
  emit({ step: "member", status: "active", label: "Verifying member eligibility" });
  await sleep(paceOf(cfg));
  const m = f.memberId ? findMember(f.memberId) : undefined;
  emit({ step: "member", status: m ? "done" : "warn", label: m ? `Member ${m.member_id} · ${m.client_id}` : f.memberId ? "Member ID not found" : "Member ID missing", detail: m ? `${m.member_state} · coverage from ${m.coverage_start}${m.coverage_end ? ` to ${m.coverage_end}` : ""}` : "Will request from provider" });
  await saveCase(c);
  return {};
}

async function resolveRules(s: S, cfg: Cfg) {
  const c = load(s.caseId);
  const emit = emitOf(cfg);
  const f = c.extraction!.fields;
  emit({ step: "rules", status: "active", label: "Reading the clinical notes and resolving the governing rules" });
  const facts = await extractFacts(f.serviceCode, f);
  c.facts = facts.facts;
  c.factsMethod = facts.method;
  c.audit.push(audit("bell", "FACTS_EXTRACTED", "Clinical facts taken from the notes and cross-checked", { facts: facts.facts, disagreements: facts.disagreements }));
  const ev = await evaluate({ fields: f, facts: facts.facts, receivedAt: c.receivedAt });
  for (const d of facts.disagreements) ev.flags.push({ code: "EXTRACTION_DISAGREEMENT", severity: "info", message: `Two independent readings disagree on "${d}" — the rule-based value was used; verify against the source.` });
  const formUrg = f.urgency ?? "STANDARD";
  if (c.declaredUrgency && c.declaredUrgency !== formUrg)
    ev.flags.unshift({ code: "URGENCY_MISMATCH", severity: "warning", message: `Form marks ${formUrg.toLowerCase()} but the transmission was logged ${c.declaredUrgency.toLowerCase()}. Clock set to the stricter (72 h) — confirm with the provider.` });
  c.evaluation = ev;
  await sleep(paceOf(cfg));
  emit({ step: "rules", status: "done", label: ev.policy.version ? `Governing: ${ev.rulePath.filter((r) => r.effect === "APPLIES" || r.effect === "OVERRIDES").map((r) => r.docId.split(" §")[0]).slice(-2).join(" → ")}` : "Rules unresolved", detail: ev.rulePath.filter((r) => r.effect === "VOID" || r.effect === "SUPERSEDED").map((r) => `${r.docId} ${r.effect.toLowerCase()}`).join(" · ") || undefined });
  await saveCase(c);
  return {};
}

async function checkCriteria(s: S, cfg: Cfg) {
  const c = load(s.caseId);
  const ev = c.evaluation!;
  const emit = emitOf(cfg);
  emit({ step: "criteria", status: "active", label: "Checking criteria with citations" });
  await sleep(paceOf(cfg));
  const all = [...ev.planProvisions, ...ev.criteria];
  const notMet = all.filter((x) => x.status === "NOT_MET").length, miss = all.filter((x) => x.status === "MISSING").length;
  const label = ev.recommendation === "RECOMMEND_APPROVE" ? `Criteria satisfied (${ev.policy.version}: ${ev.policy.logic})` : ev.recommendation === "PEND_FOR_INFO" ? `${miss || ev.missing.length} item(s) not documented` : ev.recommendation === "ELIGIBILITY_HOLD" ? "Eligibility issue" : `${notMet} rule(s) not met — needs a physician`;
  emit({ step: "criteria", status: ev.recommendation === "RECOMMEND_APPROVE" ? "done" : "warn", label, detail: ev.rationale });

  const f = c.extraction!.fields;
  const urgency: Urgency = f.urgency === "URGENT" || c.slaHours === 72 ? "URGENT" : "STANDARD";
  c.slaHours = slaHours(ev.client.product, urgency);
  c.dueAt = new Date(new Date(c.receivedAt).getTime() + c.slaHours * 3600_000).toISOString();
  c.status = statusFor(ev.recommendation);
  c.audit.push(audit("bell", "EVALUATED", `${ev.recommendation} — ${ev.rationale}`, { evaluation: { ...ev, letterDraft: undefined, outreachMessage: undefined } }));
  await saveCase(c);
  return { recommendation: ev.recommendation };
}

async function requestInfo(s: S, cfg: Cfg) {
  const c = load(s.caseId);
  const ev = c.evaluation!;
  emitOf(cfg)({ step: "outreach", status: "active", label: "Preparing response" });
  await sleep(paceOf(cfg) / 2);
  c.messages.push({ at: now(), from: "bell", body: ev.outreachMessage! });
  c.audit.push(audit("bell", "OUTREACH_SENT", `Info request to ${c.extraction!.fields.requestingProvider ?? "provider"} (clock not paused)`, { missing: ev.missing }));
  await saveCase(c);
  emitOf(cfg)({ step: "outreach", status: "warn", label: `Information requested (${ev.missing.length})`, detail: ev.missing.map((x) => x.item).join(", ") });
  return {};
}

async function queueReview(s: S, cfg: Cfg) {
  const c = load(s.caseId);
  emitOf(cfg)({ step: "outreach", status: "active", label: "Preparing response" });
  await sleep(paceOf(cfg) / 2);
  c.messages.push({ at: now(), from: "bell", body: `Received and complete. Your request is with a Bellcourt clinical reviewer. Decision due by ${new Date(c.dueAt).toUTCString()}.` });
  await saveCase(c);
  emitOf(cfg)({ step: "outreach", status: "done", label: "Complete — sent to clinical review" });
  return {};
}

/** Human-in-the-loop: the graph pauses here until an authorized reviewer resumes it. */
async function humanReview(s: S) {
  const c = load(s.caseId);
  const decision = interrupt({ caseId: c.id, status: c.status, recommendation: c.evaluation?.recommendation ?? null, awaiting: "nurse or physician decision" }) as Decision;
  return { decision };
}

/** Applies the reviewer's decision (already authorized by the API before resume). */
export async function applyDecisionToCase(c: CaseRecord, d: Decision) {
  const persona = personaById(d.personaId)!;
  const ev = c.evaluation;
  const at = now();
  const note = d.note?.trim() || "";
  switch (d.action) {
    case "APPROVE":
      c.status = "APPROVED";
      c.decision = { outcome: "APPROVED", by: persona.name, at, note: note || `Criteria met per ${ev?.policy.version ?? "policy"}.` };
      c.messages.push({ at, from: "bellcourt", body: `APPROVED by ${persona.name}. ${note}`.trim() });
      break;
    case "DENY_MEDICAL_NECESSITY":
    case "DENY_NOT_COVERED":
      c.status = "DENIED";
      c.decision = { outcome: d.action === "DENY_NOT_COVERED" ? "DENIED_NOT_COVERED" : "DENIED_MEDICAL_NECESSITY", by: persona.name, at, note };
      c.messages.push({ at, from: "bellcourt", body: (ev?.letterDraft?.replace("[DRAFT — requires physician signature]", `Signed: ${persona.name}, ${at.slice(0, 10)}`) ?? note) + `\n\nReviewer note: ${note}` });
      break;
    case "ROUTE_TO_PHYSICIAN":
      c.status = "ROUTED_TO_PHYSICIAN";
      c.routedNote = note || ev?.rationale || null;
      break;
    case "PEND":
    case "REQUEST_INFO":
      c.status = "PENDED_INFO_REQUESTED";
      c.messages.push({ at, from: "bellcourt", body: note || ev?.outreachMessage || "Please send additional clinical documentation." });
      break;
  }
  c.audit.push({ at, actor: `${persona.role}:${persona.name}`, action: d.action, detail: note || undefined, data: { recommendation: ev?.recommendation, agreedWithBell: (d.action === "APPROVE") === (ev?.recommendation === "RECOMMEND_APPROVE") } });
  await saveCase(c);
}

async function applyDecision(s: S) {
  if (!s.decision) throw new Error("No decision supplied");
  await applyDecisionToCase(load(s.caseId), s.decision);
  return { lastAction: s.decision.action, decision: null };
}

/* ------------------------------------------------------------------ edges */

const FINAL: Action[] = ["APPROVE", "DENY_MEDICAL_NECESSITY", "DENY_NOT_COVERED"];

const builder = new StateGraph(BellState)
  .addNode("receipt", receipt)
  .addNode("read_document", readDocument)
  .addNode("intake_handoff", intakeHandoff)
  .addNode("verify_member", verifyMember)
  .addNode("resolve_rules", resolveRules)
  .addNode("check_criteria", checkCriteria)
  .addNode("request_info", requestInfo)
  .addNode("queue_review", queueReview)
  .addNode("human_review", humanReview)
  .addNode("apply_decision", applyDecision)
  .addConditionalEdges(START, (s: S) => (s.entry === "reevaluate" ? "verify_member" : s.entry === "review" ? "human_review" : "receipt"), ["receipt", "verify_member", "human_review"])
  .addEdge("receipt", "read_document")
  .addConditionalEdges("read_document", (s: S) => (s.readable ? "verify_member" : "intake_handoff"), ["verify_member", "intake_handoff"])
  .addEdge("intake_handoff", END)
  .addEdge("verify_member", "resolve_rules")
  .addEdge("resolve_rules", "check_criteria")
  .addConditionalEdges("check_criteria", (s: S) => (s.recommendation === "PEND_FOR_INFO" ? "request_info" : "queue_review"), ["request_info", "queue_review"])
  .addEdge("request_info", "human_review")
  .addEdge("queue_review", "human_review")
  .addEdge("human_review", "apply_decision")
  .addConditionalEdges("apply_decision", (s: S) => (s.lastAction && FINAL.includes(s.lastAction) ? END : "human_review"), ["human_review", END]);

// In-process checkpointer: each case's run pauses at human_review and resumes on the reviewer's action.
// Production would use a Postgres checkpointer inside the BAA tenant.
const g = globalThis as unknown as { __bellCheckpointer?: MemorySaver };
const checkpointer = (g.__bellCheckpointer ??= new MemorySaver());
export const bellAgent = builder.compile({ checkpointer });

/* ------------------------------------------------------------------ public API */

const threadCfg = (thread: string, extra: Record<string, unknown> = {}) => ({ configurable: { thread_id: thread, ...extra }, recursionLimit: 50 });

async function ensureThread(c: CaseRecord, kind: string): Promise<string> {
  const n = (c.graphRuns ?? 0) + 1;
  c.graphRuns = n;
  c.graphThread = `${c.id}#${kind}${n}`;
  await saveCase(c);
  return c.graphThread;
}

/** Runs Bell on a newly received case until it pauses for human review. */
export async function runAgent(caseId: string, emit: Emit = () => {}, pace = 0) {
  const thread = await ensureThread(load(caseId), "run");
  await bellAgent.invoke({ caseId, entry: "process" }, threadCfg(thread, { emit, pace }));
  return getCase(caseId);
}

/** Re-runs from member verification after the provider supplied information. */
export async function reevaluate(caseId: string) {
  const thread = await ensureThread(load(caseId), "re");
  await bellAgent.invoke({ caseId, entry: "reevaluate" }, threadCfg(thread));
  return getCase(caseId);
}

/** Resumes the paused run with a reviewer's (already authorized) decision. */
export async function resumeWithDecision(caseId: string, d: Decision) {
  const c = load(caseId);
  let thread = c.graphThread;
  const paused = thread ? (await bellAgent.getState(threadCfg(thread))).next.includes("human_review") : false;
  if (!thread || !paused) {
    // Run state not in memory (e.g. server restart): open a review-only thread that pauses immediately.
    thread = await ensureThread(c, "review");
    await bellAgent.invoke({ caseId, entry: "review" }, threadCfg(thread));
  }
  await bellAgent.invoke(new Command({ resume: d }), threadCfg(thread!));
  return getCase(caseId);
}

/** Mermaid diagram of the agent graph (for docs and the dashboard). */
export async function agentMermaid(): Promise<string> {
  return (await bellAgent.getGraphAsync()).drawMermaid();
}
