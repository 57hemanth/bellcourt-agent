import type { Citation } from "./citation-drawer";

export interface Crit { id: string; label: string; status: "MET" | "NOT_MET" | "MISSING"; evidence: string | null; citation: Citation }
export interface Flag { code: string; severity: "info" | "warning" | "critical"; message: string; citation?: Citation }
export interface RuleStep { level: number; layer: string; docId: string; summary: string; effect: string; citation?: Citation }
export interface Evaluation {
  engineVersion: string; evaluatedAt: string;
  client: { id: string | null; name: string | null; product: string | null; state: string | null };
  eligibility: { status: string; detail: string };
  policy: { id: string | null; version: string | null; title: string | null; logic: string | null };
  rulePath: RuleStep[]; criteria: Crit[]; planProvisions: Crit[];
  missing: { item: string; why: string; citation?: Citation }[]; flags: Flag[];
  recommendation: string; rationale: string;
  proposedAdverse: null | { type: string; reason: string };
  requiresAzLicensedReviewer: boolean; texasAiDisclosure: boolean;
  outreachMessage: string | null; letterDraft: string | null;
  partialApproval?: { approve: number; overLimit: number; note: string };
}
export interface Fields {
  patientName: string | null; patientDob: string | null; memberId: string | null; planOrEmployer: string | null; requestingProvider: string | null; npi: string | null;
  serviceRequested: string | null; serviceCode: string | null; dateOfService: string | null; diagnosisCode: string | null; clinicalNotes: string | null;
  urgency: string | null; signatureDate: string | null; faxHeader: string | null;
}
export interface BellCase {
  id: string; source: string; channel: string; receivedAt: string; dueAt: string; slaHours: number; status: string;
  file: string | null; fileMime: string | null;
  extraction: { method: string; model?: string; fields: Fields; confidence: number } | null;
  facts?: Record<string, unknown>; factsMethod: string | null;
  evaluation: Evaluation | null;
  decision: null | { outcome: string; by: string; at: string; note: string };
  routedNote: string | null;
  messages: { at: string; from: string; body: string }[];
  audit: { at: string; actor: string; action: string; detail?: string; data?: unknown }[];
}
