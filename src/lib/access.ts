/**
 * Role-based projection (PHI minimization) and action guardrails.
 * Demo personas stand in for Entra ID roles; the server enforces every rule below.
 */
import type { CaseRecord, Role } from "./types";

export interface Persona { id: string; name: string; role: Role; title: string; licensedStates: string[] }

export const PERSONAS: Persona[] = [
  { id: "rn-reyes", name: "Anita Reyes, RN", role: "nurse", title: "Senior Nurse Reviewer", licensedStates: ["TN", "AZ", "TX", "GA"] },
  { id: "rn-patel", name: "Marcus Patel, RN", role: "nurse", title: "Nurse Reviewer", licensedStates: ["TN"] },
  { id: "md-vasquez", name: "Dr. Elena Vasquez", role: "physician", title: "Medical Director · AZ, TX licensed", licensedStates: ["AZ", "TX"] },
  { id: "md-okonjo", name: "Dr. Samuel Okonjo", role: "physician", title: "Chief Medical Officer · TN, GA licensed", licensedStates: ["TN", "GA"] },
];
export const personaById = (id: string | null) => PERSONAS.find((p) => p.id === id) ?? null;

const redact = (t: string | null) =>
  t?.replace(/\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}/g, "[phone redacted]").replace(/MRN-\d+/g, "[MRN redacted]") ?? null;

export const PROVIDER_STATUS: Record<CaseRecord["status"], string> = {
  RECEIVED: "Received",
  PENDED_INFO_REQUESTED: "Information needed",
  AWAITING_NURSE_REVIEW: "In clinical review",
  ROUTED_TO_PHYSICIAN: "In physician review",
  ELIGIBILITY_HOLD: "Eligibility check",
  APPROVED: "Approved",
  DENIED: "Decision issued",
};

export function project(c: CaseRecord, role: Role) {
  if (role === "physician") return c;
  if (role === "nurse") {
    const f = c.extraction?.fields;
    return {
      ...c,
      facts: undefined,
      extraction: c.extraction && { ...c.extraction, fields: { ...f!, clinicalNotes: redact(f!.clinicalNotes) } },
      evaluation: c.evaluation && { ...c.evaluation, letterDraft: null },
      audit: c.audit.map((a) => ({ at: a.at, actor: a.actor, action: a.action, detail: a.detail })),
    };
  }
  // provider: their own request status, Bell's messages and what is still needed
  const f = c.extraction?.fields;
  return {
    id: c.id, channel: c.channel, receivedAt: c.receivedAt, dueAt: c.dueAt, slaHours: c.slaHours,
    status: c.status, statusLabel: PROVIDER_STATUS[c.status], file: c.file,
    service: f?.serviceRequested ?? null, patientName: f?.patientName ?? null, dateOfService: f?.dateOfService ?? null,
    requestingProvider: f?.requestingProvider ?? null,
    missing: c.status === "PENDED_INFO_REQUESTED" ? c.evaluation?.missing ?? [] : [],
    messages: c.messages, decision: c.decision && { outcome: c.decision.outcome, at: c.decision.at, note: c.decision.note },
  };
}

export type Action = "APPROVE" | "PEND" | "ROUTE_TO_PHYSICIAN" | "DENY_MEDICAL_NECESSITY" | "DENY_NOT_COVERED" | "REQUEST_INFO";

export function authorize(persona: Persona, action: Action, c: CaseRecord): string | null {
  if (["APPROVED", "DENIED"].includes(c.status)) return "This case already has a final decision.";
  if (persona.role === "nurse") {
    if (action.startsWith("DENY")) return "Nurses may approve but may not deny (Riverbend addendum §4; SPD §5.5). Route to a physician.";
    return null;
  }
  if (persona.role === "physician") {
    if (action === "ROUTE_TO_PHYSICIAN") return "Already with a physician.";
    const ev = c.evaluation;
    if (action.startsWith("DENY") && ev?.requiresAzLicensedReviewer && !persona.licensedStates.includes("AZ"))
      return "Arizona MA member: an Arizona-licensed medical director must personally review and sign this denial (REG-02; Riverbend addendum §4).";
    return null;
  }
  return "Not permitted.";
}
