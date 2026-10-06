/**
 * Bell decision-support engine.
 * Deterministic: rule selection and criteria logic are code, never model judgement.
 * Output is a RECOMMENDATION only — Bell cannot deny, delay or modify (Riverbend addendum §5).
 */
import {
  clientById, docById, GOV01, MEMOS, POLICY_VERSIONS, serviceByCode, serviceByName,
  type CriterionDef, type PolicyVersionNode, type ProvisionNode,
} from "./kb/data";
import { resolveRules } from "./kb/neo4j";
import { detectDirectives, type Facts } from "./facts";
import { findMember } from "./seed";
import type {
  Citation, CriterionResult, CriterionStatus, Evaluation, Flag, IntakeFields, MissingItem, Product, Recommendation, RulePathStep, Urgency,
} from "./types";

export const ENGINE_VERSION = "bell-engine 1.0.0";
const SCREEN_LAG = ["MP-101", "MP-103", "MP-106", "MP-102", "MP-110"]; // UM-MEMO-2026-04

/* ------------------------------------------------------------------ helpers */

export function slaHours(product: Product | null, urgency: Urgency): number {
  if (urgency === "URGENT") return 72;
  return product === "SELF_FUNDED" || product === "ACA" ? 360 : 168; // unknown → strictest (MA)
}

const cite = (docId: string, section: string, quote: string): Citation => {
  const d = docById(docId);
  return { docId, title: d?.title ?? docId, section, quote, pdf: d?.pdf ?? "" };
};
const citeCrit = (v: PolicyVersionNode, c: CriterionDef): Citation => ({ docId: v.id, title: `${v.id}: ${v.title}`, section: c.section, quote: c.quote, pdf: v.pdf });
const citeProv = (p: ProvisionNode): Citation => cite(p.doc, p.section, p.quote);

export function ageAt(dob: string | null, onIso: string | null): number | null {
  if (!dob) return null;
  const m = dob.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/) ?? dob.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  const [y, mo, d] = dob.includes("/") ? [+m[3], +m[1], +m[2]] : [+m[1], +m[2], +m[3]];
  const on = onIso ? new Date(onIso) : new Date();
  let age = on.getUTCFullYear() - y;
  if (on.getUTCMonth() + 1 < mo || (on.getUTCMonth() + 1 === mo && on.getUTCDate() < d)) age--;
  return age;
}

const s = (ok: boolean | null): CriterionStatus => (ok === null ? "MISSING" : ok ? "MET" : "NOT_MET");
const n = (v: unknown) => (typeof v === "number" ? v : null);
const b = (v: unknown) => (typeof v === "boolean" ? v : null);
const ge = (v: unknown, x: number) => (n(v) === null ? null : (n(v) as number) >= x);

/** Evaluates each criterion of a policy version from the extracted facts. */
function criterionOutcome(versionId: string, id: string, f: Facts, ctx: { age: number | null }): boolean | null {
  const [policy] = versionId.split(" ");
  switch (`${policy}:${id}`) {
    case "MP-101:redflag": return b(f.redFlag) ?? false;
    case "MP-101:radic6": return f.radicular === false ? false : f.radicular === null ? null : ge(f.conservativeWeeks, 6);
    case "MP-101:radic4": return f.radicular === false ? false : f.radicular === null ? null : ge(f.conservativeWeeks, 4);
    case "MP-101:presurg": return b(f.presurgical) ?? false;
    case "MP-102:bmi": {
      const bmi = n(f.bmi); if (bmi === null) return null;
      if (bmi >= 40) return true;
      if (bmi < 35) return false;
      return Array.isArray(f.comorbidities) ? f.comorbidities.length > 0 : null;
    }
    case "MP-102:wmp6": return ge(f.weightProgramMonths, 6);
    case "MP-102:psych": return f.psych === "cleared" ? true : null;
    case "MP-103:dm": return b(f.diabetes);
    case "MP-103:intensive": return b(f.intensiveInsulin) || b(f.problematicHypo) ? !!f.intensiveInsulin : f.insulinAny === null ? null : false;
    case "MP-103:insulin_or_hypo": return f.insulinAny === true || f.problematicHypo === true ? true : f.insulinAny === null ? null : false;
    case "MP-104:hsat_neg": return f.hsat === null ? null : f.hsat === "negative_or_inconclusive";
    case "MP-104:comorbid": return b(f.hsatUnreliableComorbidity) ?? false;
    case "MP-104:non_osa": return b(f.nonOsaSuspected) ?? false;
    case "MP-105:mech": return b(f.mechanicalSymptoms);
    case "MP-105:tear": return b(f.tearOnMri);
    case "MP-105:cons6": return ge(f.conservativeWeeks, 6);
    case "MP-105:no_adv_oa": return n(f.klGrade) === null ? null : (n(f.klGrade) as number) < 3;
    case "MP-106:kl34": return n(f.klGrade) === null ? null : (n(f.klGrade) as number) >= 3;
    case "MP-106:func": return b(f.functionalLimitation);
    case "MP-106:cons3m": return ge(f.conservativeMonths, 3);
    case "MP-106:bmi_lt40": return n(f.bmi) === null ? null : (n(f.bmi) as number) < 40;
    case "MP-106:optim": return n(f.bmi) === null ? null : (n(f.bmi) as number) < 40 ? true : f.optimizationDocumented === true ? true : null;
    case "MP-107:bc45": return n(f.breastCancerAge) === null ? false : (n(f.breastCancerAge) as number) <= 45;
    case "MP-107:ovarian": return b(f.ovarianCancer) ?? false;
    case "MP-107:fdr": return b(f.firstDegreeRelativeBrca) ?? false;
    case "MP-108:vf12": return ge(f.fieldLossDegrees, 12);
    case "MP-108:photos": return b(f.photos);
    case "MP-109:obstruction": return b(f.obstruction);
    case "MP-109:deviation": return b(f.deviation);
    case "MP-109:med4": return ge(f.medicalMgmtWeeks, 4);
    case "MP-110:pain6m": return ge(f.painMonths, 6);
    case "MP-110:pt": return b(f.ptCompleted);
    case "MP-110:meds2": return Array.isArray(f.medicationClasses) ? f.medicationClasses.length >= 2 : null;
    case "MP-110:psych": return f.psych === "cleared" ? true : null;
    case "MP-111:symptomatic": return b(f.symptomatic);
    case "MP-111:reflux500": return ge(f.refluxMs, 500);
    case "MP-111:compress3m": return ge(f.compressionMonths, 3);
    case "MP-112:wagner3": {
      if (f.investigationalIndication) return false;
      const w = n(f.wagnerGrade); if (w === null) return f.radiationNecrosis ? false : null;
      if (w < 3) return false;
      return ge(f.woundCareDays, 30);
    }
    case "MP-112:radnecrosis": return b(f.radiationNecrosis) ?? false;
    case "MP-113:cns_u21": {
      const age = n(f.ageYears) ?? ctx.age;
      return f.indication === "cns_tumor" ? (age === null ? null : age < 21) : f.indication === null ? null : false;
    }
    case "MP-113:uveal": return f.indication === "uveal_melanoma";
    case "MP-113:chordoma": return f.indication === "chordoma";
    case "MP-114:progress_note": return b(f.currentProgressNote);
    case "MP-114:progress": return b(f.measurableProgress);
    case "MP-115:chestpain": return b(f.chestPain);
    case "MP-115:intermediate": return f.pretestProbability === null || f.pretestProbability === undefined ? null : f.pretestProbability === "intermediate";
    case "MP-116:homebound": return b(f.homebound);
    case "MP-116:skilled": return b(f.skilledNeed);
    case "MP-116:poc": return b(f.planOfCareSigned);
    case "MP-118:adherence": return ge(f.adherencePct, 70);
  }
  return null;
}

/** Evidence = the sentence of the notes that carries the fact. */
function evidenceFor(notes: string | null, keys: RegExp): string | null {
  if (!notes) return null;
  const sentence = notes.split(/(?<=\.)\s+/).find((x) => keys.test(x));
  return sentence?.trim() ?? null;
}
const EVIDENCE_KEYS: Record<string, RegExp> = {
  redflag: /cauda|malignan|infection|trauma|deficit/i, radic6: /radiat|weeks|radicul|straight-leg/i, radic4: /radiat|weeks|radicul|straight-leg/i, presurg: /surg/i,
  bmi: /BMI|Comorbid/i, wmp6: /program/i, psych: /psych/i, dm: /diabet|Dx/i, intensive: /insulin|regimen|pump/i, insulin_or_hypo: /insulin|regimen|hypogly|pump/i,
  hsat_neg: /HSAT|sleep testing/i, comorbid: /COPD|heart failure|neuromuscular/i, non_osa: /narcolep|cataplexy|parasomnia/i,
  mech: /mechanical|locking|catching/i, tear: /MRI|tear/i, cons6: /weeks|PT/i, no_adv_oa: /Kellgren|KL/i, kl34: /KL|Kellgren/i, func: /walk|stairs|dressing/i,
  cons3m: /Conservative|months/i, bmi_lt40: /BMI/i, optim: /optimization/i, bc45: /breast cancer/i, ovarian: /ovarian/i, fdr: /BRCA|sister|mother/i,
  vf12: /visual field|degrees/i, photos: /photograph/i, obstruction: /obstruction/i, deviation: /deviation/i, med4: /weeks|fluticasone/i,
  pain6m: /months|pain/i, pt: /PT/i, meds2: /gabapentin|duloxetine|Tried/i, symptomatic: /aching|heaviness|edema/i, reflux500: /reflux|Duplex/i,
  compress3m: /Compression/i, wagner3: /Wagner|wound care/i, radnecrosis: /radiation/i, cns_u21: /y\/o|tumor|medullo/i, uveal: /melanoma/i, chordoma: /chordoma/i,
  progress_note: /progress note/i, progress: /improved|plateau|QuickDASH/i, chestpain: /chest/i, intermediate: /probability/i,
  homebound: /home/i, skilled: /skilled/i, poc: /plan of care/i, adherence: /nights|Download/i, investigational: /autism|sports|covid|cognitive/i,
};

function combine(logic: string, results: CriterionResult[]): CriterionStatus {
  const st = results.map((r) => r.status);
  if (logic.includes("OR") || logic === "definition") {
    if (st.includes("MET")) return "MET";
    return st.includes("MISSING") ? "MISSING" : "NOT_MET";
  }
  if (st.includes("NOT_MET")) return "NOT_MET";
  return st.includes("MISSING") ? "MISSING" : "MET";
}

const REQUIRED: [keyof IntakeFields, string][] = [
  ["memberId", "Member ID"], ["patientName", "Patient name"], ["patientDob", "Date of birth"],
  ["requestingProvider", "Requesting provider"], ["npi", "Provider NPI"], ["serviceRequested", "Service requested"],
  ["dateOfService", "Planned date of service"], ["diagnosisCode", "Diagnosis code (ICD-10)"], ["clinicalNotes", "Clinical information / medical necessity"],
];

/* ------------------------------------------------------------------ main */

export async function evaluate(input: { fields: IntakeFields; facts: Facts; receivedAt: string; clientOverride?: { id: string; state: string | null } }): Promise<Evaluation> {
  const { fields, facts } = input;
  const flags: Flag[] = [];
  const missing: MissingItem[] = [];
  const rulePath: RulePathStep[] = [];
  const planProvisions: CriterionResult[] = [];
  let criteria: CriterionResult[] = [];
  let proposedAdverse: Evaluation["proposedAdverse"] = null;
  let partialApproval: Evaluation["partialApproval"];

  const svc = serviceByCode(fields.serviceCode) ?? serviceByName(fields.serviceRequested);
  const dos = fields.dateOfService;

  // 1. Member & eligibility (nightly eligibility file)
  const member = fields.memberId ? findMember(fields.memberId) : undefined;
  const client = member ? clientById(member.client_id) : input.clientOverride ? clientById(input.clientOverride.id) : undefined;
  const product = client?.product ?? null;
  const state = member?.member_state ?? input.clientOverride?.state ?? null;
  let eligibility: Evaluation["eligibility"] = { status: "UNVERIFIED", detail: "No member ID on the request; eligibility cannot be verified." };
  if (fields.memberId && !member) eligibility = { status: "UNVERIFIED", detail: `Member ID ${fields.memberId} not found in the eligibility file. Search by name and DOB or request the correct ID.` };
  if (!member && input.clientOverride) eligibility = { status: "ELIGIBLE", detail: `Eligibility asserted by caller for ${client?.name}.` };
  if (member) {
    const ended = member.coverage_end && dos && member.coverage_end < dos;
    const notStarted = dos && member.coverage_start > dos;
    eligibility = ended
      ? { status: "INELIGIBLE", detail: `Coverage ended ${member.coverage_end}; date of service ${dos} is after coverage end.` }
      : notStarted
        ? { status: "INELIGIBLE", detail: `Coverage starts ${member.coverage_start}; date of service ${dos} is before coverage start.` }
        : { status: "ELIGIBLE", detail: `Active ${client?.name ?? member.client_id} member (${member.relationship.toLowerCase()}, ${member.member_state}) since ${member.coverage_start}.` };
  }

  // 2. Completeness (minimum dataset)
  for (const [k, label] of REQUIRED) {
    if (!fields[k] || String(fields[k]).trim() === "") missing.push({ item: label, why: k === "memberId" ? "Needed to identify the member, the plan and the rules that apply." : "Required field on a prior authorization request." });
  }
  if (!svc && fields.serviceRequested) missing.push({ item: "Service code", why: `"${fields.serviceRequested}" does not match a Bellcourt service requiring prior authorization.` });

  // 3. Untrusted-content scan
  for (const hit of detectDirectives(fields.clinicalNotes)) {
    flags.push({ code: "UNTRUSTED_INSTRUCTION", severity: "critical", message: `${hit.label} — ignored. Provider-submitted text cannot change criteria or status: "…${hit.excerpt}…"` });
  }

  // Age consistency
  const age = ageAt(fields.patientDob, dos);
  const statedAge = fields.clinicalNotes?.match(/(\d+)\s*y\/?o/i);
  if (statedAge && age !== null && Math.abs(Number(statedAge[1]) - age) > 2)
    flags.push({ code: "AGE_MISMATCH", severity: "warning", message: `Notes state ${statedAge[1]} y/o but DOB ${fields.patientDob} gives age ${age}. Confirm patient identity before acting.` });

  // Level 1 — law/regulation for the product
  if (product === "MA") {
    rulePath.push({ level: 1, layer: "Federal regulation", docId: "REG-01", effect: "APPLIES", summary: "CMS-0057-F: 7-day standard / 72-hour expedited decisions; specific denial reasons.", citation: cite("REG-01", "Decision timeframes", "Standard requests: decision within 7 calendar days … Expedited requests: decision within 72 hours.") });
  }
  if (state === "AZ" && product === "MA") rulePath.push({ level: 1, layer: "State law", docId: "REG-02", effect: "APPLIES", summary: "Arizona: an AZ-licensed medical director must personally review and sign any medical-necessity denial.", citation: cite("REG-02", "Arizona", "A licensed medical director must personally review and sign any denial involving medical necessity; AI cannot be the sole basis.") });
  if (state === "TX" && product === "MA") rulePath.push({ level: 1, layer: "State law", docId: "REG-02", effect: "APPLIES", summary: "Texas: written disclosure when AI is used in connection with the member's care.", citation: cite("REG-02", "Texas", "Written disclosure to patients when AI is used in connection with their health care services; utilization review determinations made by physicians.") });
  if (product === "ACA") rulePath.push({ level: 1, layer: "State law", docId: "REG-02", effect: "APPLIES", summary: "Georgia (from 2027-01-01): coverage decisions may not be based solely on AI; human clinical review before denial.", citation: cite("REG-02", "Georgia", "Coverage decisions may not be based solely on AI or other software tools; human clinical review required before denial.") });
  if (product === "SELF_FUNDED") rulePath.push({ level: 1, layer: "Federal law", docId: "REG-03", effect: "APPLIES", summary: "ERISA: plan document controls coverage; state insurance and AI laws generally pre-empted.", citation: cite("REG-03", "Pre-emption", "ERISA generally pre-empts state insurance laws for self-funded plans … The plan document controls what is covered.") });

  if (client && !client.planDoc) {
    flags.push({ code: "PLAN_DOC_MISSING", severity: "critical", message: `${client.name}'s plan document is not in the indexed library. Nurse must confirm plan provisions manually before approving.` });
  }

  let version: PolicyVersionNode | null = null;
  let engine: "memory" | "neo4j" = "memory";
  if (svc && dos) {
    const resolved = await resolveRules({ clientId: client?.id ?? null, product, serviceCode: svc.code, dos });
    engine = resolved.engine;
    version = resolved.version;

    // Level 2 — plan document / delegation addendum provisions
    if (client?.planDoc) {
      rulePath.push({ level: 2, layer: client.product === "SELF_FUNDED" ? "Plan document (SPD)" : "Delegation addendum", docId: client.planDoc, effect: "APPLIES", summary: client.product === "SELF_FUNDED" ? "Plan document controls; where it conflicts with a Bellcourt policy, the plan controls (§5.1)." : client.product === "MA" ? "Medicare coverage rules take precedence for MA members (§2.1)." : "Bellcourt medical policies apply without modification (§2.2).", citation: client.product === "SELF_FUNDED" ? cite(client.planDoc, "Section 5.1 (Clinical criteria)", "Medical necessity is determined using the Bellcourt medical policy library in effect on the date of service, subject to any stricter or more specific provision of this Plan. Where this Plan and a Bellcourt medical policy conflict, this Plan controls.") : undefined });
    }
    for (const p of resolved.provisions) {
      const res = evaluateProvision(p, facts, { age, svcCode: svc.code, version });
      if (!res) continue;
      planProvisions.push(res.result);
      rulePath.push({ level: 2, layer: docById(p.doc)?.kind === "DELEGATION_ADDENDUM" ? "Delegation addendum" : "Plan document (SPD)", docId: `${p.doc} ${p.section.split(" (")[0]}`, effect: p.kind === "MEDICARE_CRITERIA_OVERRIDE" && !p.params?.same ? "OVERRIDES" : "APPLIES", summary: res.summary, citation: citeProv(p) });
      if (res.adverse) proposedAdverse = res.adverse;
      if (res.partial) partialApproval = res.partial;
      if (res.missing) missing.push(res.missing);
      if (res.flag) flags.push(res.flag);
    }

    // Level 3 — medical policy in effect on the date of service
    if (version) {
      const mcOverride = resolved.provisions.find((p) => p.kind === "MEDICARE_CRITERIA_OVERRIDE" && !p.params?.same);
      rulePath.push({ level: 3, layer: "Medical policy", docId: version.id, effect: mcOverride ? "NOT_APPLICABLE" : "APPLIES", summary: mcOverride ? `Superseded for MA members by ${mcOverride.doc} ${mcOverride.section.split(" (")[0]}.` : `In effect for date of service ${dos} (${version.effectiveFrom} → ${version.effectiveTo ?? "current"}). Logic: ${version.logic}.`, citation: { docId: version.id, title: `${version.id}: ${version.title}`, section: "Header (effective dates)", quote: `Effective for dates of service ${version.effectiveFrom}${version.effectiveTo ? ` through ${version.effectiveTo}` : " until superseded"}.`, pdf: version.pdf } });
      for (const old of resolved.superseded) {
        rulePath.push({ level: 3, layer: "Medical policy", docId: old.id, effect: "SUPERSEDED", summary: `Not in effect on ${dos} (${old.effectiveFrom} → ${old.effectiveTo ?? "current"}).${SCREEN_LAG.includes(version.policy) && old.version < version.version ? " PACE criteria screen may still display this version (UM-MEMO-2026-04)." : ""}`, citation: cite("GOV-01", "Section 2 (Version control)", GOV01.versioning) });
      }
      if (SCREEN_LAG.includes(version.policy) && version.version > 1)
        flags.push({ code: "PACE_SCREEN_OUTDATED", severity: "warning", message: `PACE criteria screen for ${version.policy} still shows v${version.version - 1}. Apply ${version.id} as cited here.`, citation: cite("UM-MEMO-2026-04", "Screen schedule", MEMOS[1].quote) });

      // Criteria (MA override for CGM uses the addendum's Medicare criteria)
      if (mcOverride && svc.code === "BHA-DME-2103") {
        const rb: CriterionDef[] = [
          { id: "dm", label: "Diabetes mellitus", quote: "Diabetes mellitus", section: "Section 2.1" },
          { id: "insulin_or_hypo", label: "Any insulin, or problematic hypoglycemia", quote: "either (a) insulin treatment of any type or frequency, or (b) documented problematic hypoglycemia. Applies to all dates of service under this Agreement.", section: "Section 2.1" },
        ];
        criteria = rb.map((cd) => ({ id: cd.id, label: cd.label, status: s(criterionOutcome("MP-103 v2", cd.id, facts, { age })), evidence: evidenceFor(fields.clinicalNotes, EVIDENCE_KEYS[cd.id]), citation: cite("RIVERBEND-ADDENDUM", cd.section, cd.quote) }));
      } else {
        criteria = version.criteria.map((cd) => ({ id: cd.id, label: cd.label, status: s(criterionOutcome(version!.id, cd.id, facts, { age })), evidence: evidenceFor(fields.clinicalNotes, EVIDENCE_KEYS[cd.id] ?? /./), citation: citeCrit(version!, cd) }));
      }

      // Investigational indications (MP-112 → MP-117) are coverage determinations
      if (svc.code === "BHA-THER-1830" && facts.investigationalIndication) {
        const mp117 = POLICY_VERSIONS.find((v) => v.id === "MP-117 v1")!;
        const reason = `HBOT for ${facts.investigationalIndication} is listed as experimental/investigational in MP-112 v1 §4 and excluded under MP-117.`;
        planProvisions.push({ id: "investigational", label: "Not an investigational indication", status: "NOT_MET", evidence: evidenceFor(fields.clinicalNotes, EVIDENCE_KEYS.investigational), citation: citeCrit(mp117, mp117.criteria[0]) });
        rulePath.push({ level: 3, layer: "Medical policy", docId: "MP-117 v1", effect: "APPLIES", summary: "Investigational services are excluded under every plan Bellcourt administers (coverage determination).", citation: citeCrit(mp117, mp117.criteria[0]) });
        proposedAdverse = { type: "NOT_COVERED", reason };
      }
    } else {
      flags.push({ code: "NO_POLICY_VERSION", severity: "critical", message: `No ${svc.policy} version is in effect on ${dos}.` });
    }

    // Level 4 — memos: void in conflict
    for (const m of resolved.memos) {
      rulePath.push({ level: 4, layer: "Operational memo", docId: m.id, effect: "VOID", summary: m.verdict, citation: cite(m.id, "Memo text", m.quote) });
      flags.push({ code: "MEMO_VOID", severity: "warning", message: `${m.id} conflicts with ${version?.id} and is void (GOV-01 §1). Do not apply its threshold.`, citation: cite("GOV-01", "Section 1 (Hierarchy of authority)", GOV01.hierarchy) });
    }
  }

  // Missing documentation from criteria (pend — never deny for missing documentation)
  for (const c of criteria.filter((c) => c.status === "MISSING")) {
    missing.push({ item: c.label, why: `Needed to apply ${c.citation.docId} ${c.citation.section}.`, citation: c.citation });
  }

  const criteriaStatus = version ? combine(version.logic, criteria) : "MISSING";
  const criteriaNotMet = criteriaStatus === "NOT_MET";
  const criteriaAllMet = criteriaStatus === "MET";
  // For OR-logic policies, a MISSING sibling is irrelevant once one branch is MET.
  const relevantMissing = missing.filter((m) => !(criteriaAllMet && criteria.some((c) => c.label === m.item)));

  // Recommendation (precedence: eligibility → identity → plan exclusion → criteria)
  let recommendation: Recommendation;
  let rationale: string;
  const fieldGaps = relevantMissing.filter((m) => !m.citation);
  const docGaps = relevantMissing.filter((m) => m.citation);
  const azReviewer = product === "MA" && state === "AZ";

  if (eligibility.status === "INELIGIBLE") {
    recommendation = "ELIGIBILITY_HOLD";
    rationale = `${eligibility.detail} Intake to confirm coverage with the plan sponsor before any clinical review.`;
  } else if (fieldGaps.length && (!fields.memberId || !fields.serviceRequested || !dos)) {
    recommendation = "PEND_FOR_INFO";
    rationale = `Request is incomplete: ${fieldGaps.map((m) => m.item).join(", ")}. Outreach sent to the provider; clock keeps running from receipt.`;
  } else if (proposedAdverse) {
    recommendation = "ROUTE_TO_PHYSICIAN";
    rationale = `Plan/coverage rule not met: ${proposedAdverse.reason} Bell does not deny — a physician must review${azReviewer ? " (Arizona-licensed medical director required)" : ""}.`;
  } else if ((docGaps.length || fieldGaps.length) && !criteriaNotMet) {
    recommendation = "PEND_FOR_INFO";
    rationale = `Documentation missing: ${[...fieldGaps, ...docGaps].map((m) => m.item).join("; ")}. Per policy §5 the request must be pended and the provider contacted — not denied.`;
  } else if (criteriaNotMet) {
    recommendation = "ROUTE_TO_PHYSICIAN";
    const failed = criteria.filter((c) => c.status === "NOT_MET").map((c) => c.label);
    proposedAdverse = { type: "MEDICAL_NECESSITY", reason: `${version?.id} criteria not met: ${failed.join("; ")}.` };
    rationale = `${version?.id} (${version?.logic}) not satisfied — ${failed.join("; ")}. Nurses cannot deny; route to physician${azReviewer ? " (Arizona-licensed medical director required)" : ""}.`;
  } else if (criteriaAllMet && !flags.some((f) => f.code === "PLAN_DOC_MISSING")) {
    recommendation = "RECOMMEND_APPROVE";
    rationale = partialApproval
      ? `Clinical criteria met (${version?.id}). ${partialApproval.note}`
      : `All applicable criteria met under ${planProvisions.length ? "the plan provisions and " : ""}${criteria[0]?.citation.docId ?? version?.id}. Nurse may approve.`;
  } else {
    recommendation = "PEND_FOR_INFO";
    rationale = "Bell could not resolve every rule automatically. Nurse review required.";
  }

  const texasAiDisclosure = product === "MA" && state === "TX";
  const evaluation: Evaluation = {
    engineVersion: `${ENGINE_VERSION} · graph:${engine}`,
    evaluatedAt: new Date().toISOString(),
    client: { id: client?.id ?? null, name: client?.name ?? null, product, state },
    eligibility,
    policy: { id: version?.policy ?? svc?.policy ?? null, version: version?.id ?? null, title: version?.title ?? svc?.name ?? null, logic: version?.logic ?? null },
    rulePath, criteria, planProvisions, missing: relevantMissing, flags, recommendation, rationale, proposedAdverse,
    requiresAzLicensedReviewer: azReviewer,
    texasAiDisclosure,
    outreachMessage: null,
    letterDraft: null,
    partialApproval,
  };
  evaluation.outreachMessage = recommendation === "PEND_FOR_INFO" ? buildOutreach(fields, evaluation) : null;
  evaluation.letterDraft = buildLetter(fields, evaluation);
  return evaluation;
}

/* ------------------------------------------------------------------ plan provisions */

function evaluateProvision(p: ProvisionNode, f: Facts, ctx: { age: number | null; svcCode: string; version: PolicyVersionNode | null }):
  null | { result: CriterionResult; summary: string; adverse?: Evaluation["proposedAdverse"]; partial?: Evaluation["partialApproval"]; missing?: MissingItem; flag?: Flag } {
  const c = citeProv(p);
  const mk = (label: string, status: CriterionStatus, evidence: string | null = null): CriterionResult => ({ id: p.id, label, status, evidence, citation: c });
  switch (p.kind) {
    case "EXCLUSION":
      return { result: mk("Service not excluded by the plan", "NOT_MET"), summary: `Plan exclusion: ${p.quote.split(" …")[0]}`, adverse: { type: "NOT_COVERED", reason: `Excluded under ${p.doc} ${p.section.split(" (")[0]} (plan exclusion, not a medical judgement).` } };
    case "COVERED_PER_POLICY":
      if (p.id === "RB#2.2") return null;
      return {
        result: mk("Covered benefit under the plan", "MET"), summary: p.id.includes("A3") ? "Amendment No. 3: bariatric surgery covered from 2026-01-01 (exclusion deleted)." : "Covered, subject to the Bellcourt medical policy.",
        flag: p.id.includes("A3") ? { code: "PLAN_AMENDMENT", severity: "info", message: "Kestrel Amendment No. 3 makes bariatric surgery a covered benefit from 2026-01-01. Older PACE configuration may still show the exclusion.", citation: c } : undefined,
      };
    case "CENTER_OF_EXCELLENCE": {
      const list = (p.params?.facilities as string[]) ?? [];
      const fac = typeof f.facility === "string" ? f.facility : null;
      const ok = fac ? list.some((x) => fac.toLowerCase().includes(x.toLowerCase())) : null;
      return ok === false
        ? { result: mk("Performed at a designated Center of Excellence", "NOT_MET", `Facility: ${fac}`), summary: `Facility "${fac}" is not a designated Center of Excellence.`, adverse: { type: "NOT_COVERED", reason: `Surgery at ${fac}, which is not a designated Center of Excellence (${list.join("; ")}).` } }
        : ok === null
          ? { result: mk("Performed at a designated Center of Excellence", "MISSING"), summary: "Facility not stated.", missing: { item: "Surgical facility", why: `Plan covers bariatric surgery only at ${list.join(" or ")}.`, citation: c } }
          : { result: mk("Performed at a designated Center of Excellence", "MET", `Facility: ${fac}`), summary: `${fac} is a designated Center of Excellence.` };
    }
    case "STRICTER_CRITERION": {
      const min = Number(p.params?.minFieldLossDegrees ?? 0);
      const v = n(f.fieldLossDegrees);
      if (v === null) return { result: mk(`Superior field loss ≥${min}° (plan rule)`, "MISSING"), summary: `Plan requires ≥${min}° field loss.`, missing: { item: "Formal visual field study", why: `Plan requires superior field loss of ${min}° or more.`, citation: c } };
      return v >= min
        ? { result: mk(`Superior field loss ≥${min}° (plan rule)`, "MET", `Field loss ${v}°`), summary: `Plan rule (≥${min}°) met: ${v}°.` }
        : { result: mk(`Superior field loss ≥${min}° (plan rule)`, "NOT_MET", `Field loss ${v}°`), summary: `Stricter plan rule: ${v}° is below the plan's ${min}° (policy MP-108 alone would allow ≥12°).`, adverse: { type: "NOT_COVERED", reason: `Superior field loss ${v}° is below the ${min}° required by ${p.doc} ${p.section.split(" (")[0]}.` } };
    }
    case "AGE_LIMITED_EXCLUSION": {
      const under = Number(p.params?.coveredUnderAge ?? 0);
      if (ctx.age === null) return { result: mk(`Member under age ${under} (plan rule)`, "MISSING"), summary: `Covered only under age ${under}.`, missing: { item: "Date of birth", why: `Plan covers this service only for members under ${under}.`, citation: c } };
      return ctx.age < under
        ? { result: mk(`Member under age ${under} (plan rule)`, "MET", `Age ${ctx.age}`), summary: `Member age ${ctx.age} is under ${under}.` }
        : { result: mk(`Member under age ${under} (plan rule)`, "NOT_MET", `Age ${ctx.age}`), summary: `Plan excludes this service at age ${ctx.age} (covered only under ${under}).`, adverse: { type: "NOT_COVERED", reason: `Proton beam therapy is excluded for members aged ${under} and over under ${p.doc} ${p.section.split(" (")[0]}; member is ${ctx.age}.` } };
    }
    case "SECOND_OPINION":
      return f.secondOpinionDocumented === true
        ? { result: mk("Documented independent second opinion", "MET"), summary: "Second opinion documented." }
        : { result: mk("Documented independent second opinion", "MISSING"), summary: "Plan requires a documented second opinion before any spinal procedure.", missing: { item: "Second surgical opinion", why: "Plan requires a documented second opinion from a board-certified spine surgeon or pain specialist not affiliated with the requesting provider.", citation: c } };
    case "VISIT_LIMIT": {
      const limit = Number(p.params?.limit ?? 0);
      const used = n(f.visitsUsed), req = n(f.visitsRequested);
      if (used === null || req === null) return { result: mk(`Within ${limit}-visit annual limit`, "MISSING"), summary: `Plan limit ${limit} visits/year.`, missing: { item: "Visit count (used this plan year and requested)", why: `Plan limits therapy to ${limit} visits per plan year.`, citation: c } };
      if (used + req <= limit) return { result: mk(`Within ${limit}-visit annual limit`, "MET", `${used} used + ${req} requested = ${used + req}`), summary: `${used + req} of ${limit} annual visits.` };
      const room = Math.max(0, limit - used);
      if (room === 0) return { result: mk(`Within ${limit}-visit annual limit`, "NOT_MET", `${used} used of ${limit}`), summary: `Annual limit of ${limit} reached.`, adverse: { type: "NOT_COVERED", reason: `All ${limit} plan-year visits used (${p.doc} ${p.section.split(" (")[0]}); visits above the limit are not covered regardless of medical necessity.` } };
      return {
        result: mk(`Within ${limit}-visit annual limit`, "NOT_MET", `${used} used + ${req} requested = ${used + req}`),
        summary: `${used} used + ${req} requested exceeds the ${limit}-visit plan limit; only ${room} would fit.`,
        adverse: { type: "NOT_COVERED", reason: `${used} visits used + ${req} requested exceeds the ${limit}-visit annual limit in ${p.doc} ${p.section.split(" (")[0]}; visits above the limit are not covered regardless of medical necessity.` },
        partial: { approve: room, overLimit: req - room, note: `Reviewer option: approve up to ${room} visit(s) within the limit and deny ${req - room} as not covered (${p.doc} §4.2).` },
      };
    }
    case "MEDICARE_CRITERIA_OVERRIDE":
      return { result: mk(p.params?.same ? `Medicare criteria: as ${p.params.same}` : "Medicare criteria applied", "MET"), summary: p.params?.same ? `Riverbend confirms Medicare criteria are as ${p.params.same}.` : "Riverbend-confirmed Medicare criteria replace the Bellcourt policy for MA members (any date of service)." };
    default:
      return null;
  }
}

/* ------------------------------------------------------------------ correspondence */

function buildOutreach(fields: IntakeFields, ev: Evaluation): string {
  const items = ev.missing.map((m, i) => `${i + 1}. ${m.item} — ${m.why}${m.citation ? ` [${m.citation.docId}, ${m.citation.section}]` : ""}`).join("\n");
  return [
    `Bellcourt Health Administrators — Utilization Management`,
    `RE: Prior authorization request for ${fields.patientName ?? "your patient"}${fields.serviceRequested ? ` — ${fields.serviceRequested}` : ""}`,
    ``,
    `We received your request and it is in review. To complete it, please send:`,
    items,
    ``,
    `Reply through the provider portal or fax (615) 555-0142 with the case number. We will not deny a request for missing documentation before the response window closes.`,
  ].join("\n");
}

function buildLetter(fields: IntakeFields, ev: Evaluation): string | null {
  if (ev.recommendation === "PEND_FOR_INFO" || ev.recommendation === "ELIGIBILITY_HOLD") return null;
  const adverse = ev.proposedAdverse && !(ev.partialApproval && ev.recommendation === "RECOMMEND_APPROVE");
  const basis = adverse
    ? ev.proposedAdverse!.type === "NOT_COVERED"
      ? `This request is not covered under your plan. This is a plan coverage (benefit) determination, not a medical judgement.\n\nReason: ${ev.proposedAdverse!.reason}`
      : `This request does not meet the clinical criteria in the policy in effect on the date of service.\n\nReason: ${ev.proposedAdverse!.reason}`
    : `This request is APPROVED.${ev.partialApproval ? ` ${ev.partialApproval.note}` : ""}`;
  const cites = [...ev.planProvisions, ...ev.criteria].filter((c) => (adverse ? c.status === "NOT_MET" : true)).slice(0, 4)
    .map((c) => `• ${c.citation.docId}, ${c.citation.section}: "${c.citation.quote}"`).join("\n");
  return [
    `[DRAFT — requires ${adverse ? "physician" : "reviewer"} signature]`,
    ``,
    `Member: ${fields.patientName ?? "—"} (ID ${fields.memberId ?? "—"})`,
    `Service: ${fields.serviceRequested ?? "—"} · Date of service: ${fields.dateOfService ?? "—"}`,
    `Requesting provider: ${fields.requestingProvider ?? "—"}`,
    ``,
    basis,
    ``,
    `Criteria and plan provisions relied on:`,
    cites || "• —",
    adverse ? `\nYour appeal rights: you or your provider may appeal within 180 days. Medical-necessity appeals are reviewed by a physician not involved in this decision. Your provider may request a peer-to-peer discussion.` : "",
    ev.texasAiDisclosure ? `\nDisclosure: an AI-assisted tool was used to organize the information in this review. The determination was made by a licensed clinician.` : "",
  ].join("\n").trim();
}
