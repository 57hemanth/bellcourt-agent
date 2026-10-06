import fs from "node:fs";
import path from "node:path";

const SEED_DIR = path.join(process.cwd(), "data", "seed");

export interface MemberRow {
  member_id: string;
  client_id: string;
  plan_id: string;
  coverage_start: string;
  coverage_end: string;
  member_state: string;
  relationship: string;
}

function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let cur: string[] = [], field = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (ch === '"') q = false;
      else field += ch;
    } else if (ch === '"') q = true;
    else if (ch === ",") { cur.push(field); field = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      cur.push(field); field = "";
      if (cur.some((x) => x !== "")) rows.push(cur);
      cur = [];
    } else field += ch;
  }
  if (field || cur.length) { cur.push(field); rows.push(cur); }
  const [head, ...body] = rows;
  return body.map((r) => Object.fromEntries(head.map((h, i) => [h, r[i] ?? ""])));
}

let members: MemberRow[] | null = null;
export function eligibility(): MemberRow[] {
  if (!members) members = parseCsv(fs.readFileSync(path.join(SEED_DIR, "member_eligibility_extract.csv"), "utf8")) as unknown as MemberRow[];
  return members;
}
export const findMember = (id: string) => eligibility().find((m) => m.member_id.toUpperCase() === id.trim().toUpperCase());

export interface OpenCaseJson {
  case_id: string;
  received_ts: string;
  channel: "FAX" | "PORTAL" | "PHONE" | "ELECTRONIC";
  urgency: "STANDARD" | "URGENT";
  client_id: string;
  requesting_provider: string;
  provider_npi: string;
  status: string;
  fax_image?: string;
  member_id: string | null;
  patient_name?: string;
  patient_dob?: string;
  date_of_service: string | null;
  service_code: string | null;
  service_requested?: string;
  clinical_notes: string | null;
}

export function openCases(): OpenCaseJson[] {
  const dir = path.join(SEED_DIR, "open_cases");
  return fs.readdirSync(dir).filter((f) => f.endsWith(".json")).sort().map((f) => JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")));
}

export function qaAudit() {
  return parseCsv(fs.readFileSync(path.join(SEED_DIR, "qa_audit_sample_2026.csv"), "utf8"));
}
