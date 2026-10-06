export type Role = "provider" | "intake" | "nurse" | "physician";

export type Product = "MA" | "ACA" | "SELF_FUNDED";
export type Urgency = "STANDARD" | "URGENT";
export type Channel = "FAX" | "PORTAL" | "PHONE" | "ELECTRONIC";

/** Fields an intake coordinator keys into PACE today (the "14 fields"). */
export interface IntakeFields {
  patientName: string | null;
  patientDob: string | null; // MM/DD/YYYY as written
  memberId: string | null;
  planOrEmployer: string | null;
  requestingProvider: string | null;
  npi: string | null;
  serviceRequested: string | null;
  serviceCode: string | null;
  dateOfService: string | null; // YYYY-MM-DD
  diagnosisCode: string | null;
  clinicalNotes: string | null;
  urgency: Urgency | null;
  signatureDate: string | null;
  faxHeader: string | null; // sender line incl. return fax number
}

export interface Citation {
  docId: string; // e.g. MP-101 v2, SPD-JUNIPER, RIVERBEND-ADDENDUM
  title: string;
  section: string;
  quote: string;
  pdf: string; // /kb/<file>.pdf
}

export type CriterionStatus = "MET" | "NOT_MET" | "MISSING";

export interface CriterionResult {
  id: string;
  label: string;
  status: CriterionStatus;
  evidence: string | null; // quote from the clinical notes
  citation: Citation;
}

export type FlagSeverity = "info" | "warning" | "critical";
export interface Flag {
  code: string;
  severity: FlagSeverity;
  message: string;
  citation?: Citation;
}

export interface MissingItem {
  item: string;
  why: string;
  citation?: Citation;
}

/** Bell never outputs a denial — only these recommendations. */
export type Recommendation =
  | "RECOMMEND_APPROVE"
  | "PEND_FOR_INFO"
  | "ROUTE_TO_PHYSICIAN"
  | "ELIGIBILITY_HOLD";

export interface RulePathStep {
  level: number; // GOV-01 precedence 1..4
  layer: string; // "Plan document", "Delegation addendum", "Medical policy", "Operational memo"
  docId: string;
  summary: string;
  effect: "APPLIES" | "OVERRIDES" | "VOID" | "NOT_APPLICABLE" | "SUPERSEDED";
  citation?: Citation;
}

export interface Evaluation {
  engineVersion: string;
  evaluatedAt: string;
  client: { id: string | null; name: string | null; product: Product | null; state: string | null };
  eligibility: { status: "ELIGIBLE" | "INELIGIBLE" | "UNVERIFIED"; detail: string };
  policy: { id: string | null; version: string | null; title: string | null; logic: string | null };
  rulePath: RulePathStep[];
  criteria: CriterionResult[];
  planProvisions: CriterionResult[];
  missing: MissingItem[];
  flags: Flag[];
  recommendation: Recommendation;
  rationale: string;
  proposedAdverse: null | { type: "MEDICAL_NECESSITY" | "NOT_COVERED"; reason: string };
  requiresAzLicensedReviewer: boolean;
  texasAiDisclosure: boolean;
  outreachMessage: string | null;
  letterDraft: string | null;
  partialApproval?: { approve: number; overLimit: number; note: string };
}

export type CaseStatus =
  | "RECEIVED"
  | "PENDED_INFO_REQUESTED"
  | "AWAITING_NURSE_REVIEW"
  | "ROUTED_TO_PHYSICIAN"
  | "ELIGIBILITY_HOLD"
  | "APPROVED"
  | "DENIED";

export interface AuditEvent {
  at: string;
  actor: string; // "bell", "nurse:RN Anita Reyes", ...
  action: string;
  detail?: string;
  data?: unknown;
}

export interface ProviderMessage {
  at: string;
  from: "bell" | "provider" | "bellcourt";
  body: string;
}

export interface CaseRecord {
  id: string;
  source: "PORTAL_UPLOAD" | "OPEN_QUEUE";
  channel: Channel;
  receivedAt: string; // ISO, clock starts here
  dueAt: string;
  slaHours: number;
  status: CaseStatus;
  file: string | null; // /api/files/<name>
  fileMime: string | null;
  extraction: {
    method: "gemini" | "cache" | "structured" | "manual";
    model?: string;
    fields: IntakeFields;
    confidence: number; // 0..1
  } | null;
  facts: Record<string, unknown>;
  factsMethod: "gemini" | "rules" | null;
  evaluation: Evaluation | null;
  decision: null | {
    outcome: "APPROVED" | "DENIED_MEDICAL_NECESSITY" | "DENIED_NOT_COVERED" | "PARTIAL";
    by: string;
    at: string;
    note: string;
  };
  routedNote: string | null;
  messages: ProviderMessage[];
  audit: AuditEvent[];
  supplements: { at: string; text: string }[];
  declaredUrgency?: Urgency;
  graphThread?: string; // LangGraph thread currently paused at human_review
  graphRuns?: number;
}
