/**
 * Bellcourt knowledge base, transcribed from the UM Library PDFs in /public/kb.
 * Every quote below is verbatim (or a faithful excerpt) from the cited document so a
 * reviewer can click through and verify. This file is the single source of truth for both
 * the in-memory graph and the optional Neo4j seed (scripts/seed-neo4j.ts).
 */
import type { Product } from "../types";

export interface KbDocument {
  id: string;
  kind: "MEDICAL_POLICY" | "PLAN_DOCUMENT" | "DELEGATION_ADDENDUM" | "REGULATION" | "GOVERNANCE" | "MEMO" | "EMAIL";
  title: string;
  pdf: string;
  level: 1 | 2 | 3 | 4; // GOV-01 hierarchy (1 = law ... 4 = memos)
  status?: "ACTIVE" | "RETIRED" | "VOID_IN_CONFLICT" | "INFORMATIONAL";
}

export interface ClientNode {
  id: string;
  name: string;
  product: Product;
  state: string;
  planDoc: string | null; // document id, null if not in the library
}

export interface ServiceNode {
  code: string;
  name: string;
  policy: string; // MP-xxx
  aliases: string[];
}

export interface CriterionDef {
  id: string;
  label: string;
  quote: string;
  section: string;
}

export interface PolicyVersionNode {
  id: string; // "MP-101 v2"
  policy: string;
  version: number;
  title: string;
  effectiveFrom: string;
  effectiveTo: string | null;
  status: "ACTIVE" | "RETIRED";
  pdf: string;
  logic: string; // human-readable connector summary, e.g. "1 OR 2 OR 3"
  criteria: CriterionDef[];
  limitations: string[];
  documentation: string;
}

export type ProvisionKind =
  | "VISIT_LIMIT"
  | "CENTER_OF_EXCELLENCE"
  | "SECOND_OPINION"
  | "STRICTER_CRITERION"
  | "EXCLUSION"
  | "AGE_LIMITED_EXCLUSION"
  | "COVERED_PER_POLICY"
  | "MEDICARE_CRITERIA_OVERRIDE"
  | "ADVERSE_DETERMINATION_RULE"
  | "TIMEFRAME";

export interface ProvisionNode {
  id: string;
  doc: string;
  section: string;
  kind: ProvisionKind;
  services: string[]; // service codes ("*" = all)
  effectiveFrom?: string;
  effectiveTo?: string;
  params?: Record<string, unknown>;
  quote: string;
}

export interface MemoNode {
  id: string;
  date: string;
  conflictsWith: string[]; // policy version ids
  quote: string;
  verdict: string;
}

/* ------------------------------------------------------------------ documents */

const mp = (id: string, v: number, title: string, status: "ACTIVE" | "RETIRED"): KbDocument => ({
  id: `${id} v${v}`,
  kind: "MEDICAL_POLICY",
  title: `${id} v${v}: ${title}`,
  pdf: `/kb/${id}_v${v}.pdf`,
  level: 3,
  status,
});

export const DOCUMENTS: KbDocument[] = [
  { id: "REG-01", kind: "REGULATION", title: "CMS Interoperability and Prior Authorization Final Rule (CMS-0057-F)", pdf: "/kb/REG-01_CMS_Prior_Authorization_Rule.pdf", level: 1 },
  { id: "REG-02", kind: "REGULATION", title: "State laws on AI in utilization review", pdf: "/kb/REG-02_State_AI_Utilization_Review_Laws.pdf", level: 1 },
  { id: "REG-03", kind: "REGULATION", title: "ERISA, self-funded plans and the role of a TPA", pdf: "/kb/REG-03_ERISA_Self_Funded_Plans.pdf", level: 1 },
  { id: "GOV-01", kind: "GOVERNANCE", title: "Clinical Policy Governance", pdf: "/kb/GOV-01_Clinical_Policy_Governance.pdf", level: 3 },
  { id: "RIVERBEND-ADDENDUM", kind: "DELEGATION_ADDENDUM", title: "Riverbend UM Delegation Addendum (eff. 2026-01-01)", pdf: "/kb/RIVERBEND-ADDENDUM.pdf", level: 2 },
  { id: "SPD-HARLAN", kind: "PLAN_DOCUMENT", title: "Harlan Freight Lines SPD (2026)", pdf: "/kb/SPD-HARLAN.pdf", level: 2 },
  { id: "SPD-BRIGHT", kind: "PLAN_DOCUMENT", title: "Brightwater USD SPD (2026)", pdf: "/kb/SPD-BRIGHT.pdf", level: 2 },
  { id: "SPD-KESTREL", kind: "PLAN_DOCUMENT", title: "Kestrel Precision Manufacturing SPD (2026)", pdf: "/kb/SPD-KESTREL.pdf", level: 2 },
  { id: "SPD-SORREL", kind: "PLAN_DOCUMENT", title: "Sorrel Hospitality Group SPD (2026)", pdf: "/kb/SPD-SORREL.pdf", level: 2 },
  { id: "SPD-JUNIPER", kind: "PLAN_DOCUMENT", title: "Juniper Foods Cooperative SPD (2026)", pdf: "/kb/SPD-JUNIPER.pdf", level: 2 },
  { id: "SPD-OSTR", kind: "PLAN_DOCUMENT", title: "Ostrander Regional Medical Center SPD (2026)", pdf: "/kb/SPD-OSTR.pdf", level: 2 },
  { id: "UM-MEMO-2025-19", kind: "MEMO", title: "UM Operations Memo 2025-19 (lumbar MRI)", pdf: "/kb/UM-MEMO-2025-19.pdf", level: 4, status: "VOID_IN_CONFLICT" },
  { id: "UM-MEMO-2026-04", kind: "MEMO", title: "UM Operations Memo 2026-04 (PACE screen schedule)", pdf: "/kb/UM-MEMO-2026-04.pdf", level: 4, status: "INFORMATIONAL" },
  { id: "EMAIL-Kestrel-Amendment", kind: "EMAIL", title: "Email: Kestrel plan amendment (UM not copied)", pdf: "/kb/EMAIL-Kestrel-Amendment.pdf", level: 4, status: "INFORMATIONAL" },
  mp("MP-101", 1, "MRI of the Lumbar Spine", "RETIRED"),
  mp("MP-101", 2, "MRI of the Lumbar Spine", "ACTIVE"),
  mp("MP-102", 1, "Bariatric Surgery", "RETIRED"),
  mp("MP-102", 2, "Bariatric Surgery", "ACTIVE"),
  mp("MP-103", 1, "Continuous Glucose Monitors", "RETIRED"),
  mp("MP-103", 2, "Continuous Glucose Monitors", "ACTIVE"),
  mp("MP-104", 1, "In-Lab Polysomnography", "ACTIVE"),
  mp("MP-105", 1, "Arthroscopic Knee Surgery", "ACTIVE"),
  mp("MP-106", 1, "Total Knee Arthroplasty", "RETIRED"),
  mp("MP-106", 2, "Total Knee Arthroplasty", "ACTIVE"),
  mp("MP-107", 1, "BRCA1/2 Genetic Testing", "ACTIVE"),
  mp("MP-108", 1, "Blepharoplasty", "ACTIVE"),
  mp("MP-109", 1, "Septoplasty", "ACTIVE"),
  mp("MP-110", 1, "Spinal Cord Stimulator Trial", "RETIRED"),
  mp("MP-110", 2, "Spinal Cord Stimulator Trial", "ACTIVE"),
  mp("MP-111", 1, "Endovenous Ablation", "ACTIVE"),
  mp("MP-112", 1, "Hyperbaric Oxygen Therapy", "ACTIVE"),
  mp("MP-113", 1, "Proton Beam Radiation Therapy", "ACTIVE"),
  mp("MP-114", 1, "Outpatient PT Beyond 12 Visits", "ACTIVE"),
  mp("MP-115", 1, "Coronary CT Angiography", "ACTIVE"),
  mp("MP-116", 1, "Home Health Services", "ACTIVE"),
  mp("MP-117", 1, "Experimental and Investigational Services", "ACTIVE"),
  mp("MP-118", 1, "CPAP Continued Coverage", "ACTIVE"),
];

/* ------------------------------------------------------------------ clients */

const roster: [string, string, string][] = [
  ["EMP007", "Pinecrest Logistics", "MO"], ["EMP008", "Caldera Mining Services", "OH"], ["EMP009", "Bluewater Credit Union", "AZ"],
  ["EMP010", "Tamarack County Government", "AL"], ["EMP011", "Oakhollow Senior Living", "MO"], ["EMP012", "Redfern Auto Group", "AL"],
  ["EMP013", "Coppervale Foods", "AZ"], ["EMP014", "Starling Charter Schools", "MO"], ["EMP015", "Marlowe Engineering", "MO"],
  ["EMP016", "Hollis & Grant LLP", "AZ"], ["EMP017", "Vireo Biotech", "TN"], ["EMP018", "Granite Peak Construction", "IN"],
  ["EMP019", "Lakeshore Dental Partners", "AZ"], ["EMP020", "Sagebrush Energy", "TX"], ["EMP021", "Everton Plastics", "AL"],
  ["EMP022", "Northgate Hospitality", "TX"], ["EMP023", "Driftwood Media", "TN"], ["EMP024", "Cobalt Staffing", "GA"],
  ["EMP025", "Wren Valley Farms", "TX"], ["EMP026", "Ironbridge Steel", "CO"], ["EMP027", "Silverline Transit Authority", "KY"],
  ["EMP028", "Brookfield Parish Schools", "GA"], ["EMP029", "Amberly Retail Co", "IN"], ["EMP030", "Haverford Printing", "AZ"],
  ["EMP031", "Tidewater Marine", "AZ"], ["EMP032", "Kingsley Pharmacy Group", "AL"], ["EMP033", "Meadowlark Insurance Agency", "GA"],
  ["EMP034", "Foxglove Nurseries", "TN"], ["EMP035", "Halcyon Software", "OH"], ["EMP036", "Trestle Rail Services", "TN"],
  ["EMP037", "Quarry Hill Aggregates", "IN"], ["EMP038", "Sable Creek Casino", "TX"],
];

export const CLIENTS: ClientNode[] = [
  { id: "RB-MA", name: "Riverbend Medicare Advantage HMO", product: "MA", state: "AZ/TX", planDoc: "RIVERBEND-ADDENDUM" },
  { id: "RB-ACA", name: "Riverbend Marketplace Silver HMO", product: "ACA", state: "GA", planDoc: "RIVERBEND-ADDENDUM" },
  { id: "HARLAN", name: "Harlan Freight Lines", product: "SELF_FUNDED", state: "TX", planDoc: "SPD-HARLAN" },
  { id: "BRIGHT", name: "Brightwater Unified School District", product: "SELF_FUNDED", state: "CO", planDoc: "SPD-BRIGHT" },
  { id: "KESTREL", name: "Kestrel Precision Manufacturing", product: "SELF_FUNDED", state: "OH", planDoc: "SPD-KESTREL" },
  { id: "SORREL", name: "Sorrel Hospitality Group", product: "SELF_FUNDED", state: "GA", planDoc: "SPD-SORREL" },
  { id: "JUNIPER", name: "Juniper Foods Cooperative", product: "SELF_FUNDED", state: "AZ", planDoc: "SPD-JUNIPER" },
  { id: "OSTR", name: "Ostrander Regional Medical Center (employee plan)", product: "SELF_FUNDED", state: "TN", planDoc: "SPD-OSTR" },
  ...roster.map(([id, name, state]) => ({ id, name, product: "SELF_FUNDED" as Product, state, planDoc: null })),
];

/* ------------------------------------------------------------------ services */

export const SERVICES: ServiceNode[] = [
  { code: "BHA-IMG-0721", name: "Advanced Imaging: MRI of the Lumbar Spine", policy: "MP-101", aliases: ["lumbar mri", "mri lumbar", "mri of the lumbar spine"] },
  { code: "BHA-SURG-4310", name: "Bariatric (Weight-Loss) Surgery", policy: "MP-102", aliases: ["bariatric", "sleeve gastrectomy", "weight-loss surgery", "gastric bypass"] },
  { code: "BHA-DME-2103", name: "Continuous Glucose Monitors (CGM)", policy: "MP-103", aliases: ["cgm", "continuous glucose"] },
  { code: "BHA-DX-9581", name: "Attended In-Laboratory Polysomnography (Sleep Study)", policy: "MP-104", aliases: ["polysomnography", "sleep study"] },
  { code: "BHA-SURG-2988", name: "Arthroscopic Knee Surgery", policy: "MP-105", aliases: ["knee arthroscopy", "arthroscopic knee", "meniscectomy"] },
  { code: "BHA-SURG-2744", name: "Total Knee Arthroplasty (TKA)", policy: "MP-106", aliases: ["total knee", "tka", "knee arthroplasty", "knee replacement"] },
  { code: "BHA-LAB-8162", name: "Genetic Testing for Hereditary Breast and Ovarian Cancer (BRCA1/2)", policy: "MP-107", aliases: ["brca", "genetic testing"] },
  { code: "BHA-SURG-1582", name: "Blepharoplasty (Upper Eyelid Surgery)", policy: "MP-108", aliases: ["blepharoplasty", "eyelid"] },
  { code: "BHA-SURG-3052", name: "Septoplasty", policy: "MP-109", aliases: ["septoplasty"] },
  { code: "BHA-SURG-6350", name: "Spinal Cord Stimulator (SCS) Trial", policy: "MP-110", aliases: ["spinal cord stimulator", "scs"] },
  { code: "BHA-VASC-3647", name: "Endovenous Ablation of Varicose Veins", policy: "MP-111", aliases: ["endovenous", "varicose", "vein ablation"] },
  { code: "BHA-THER-1830", name: "Hyperbaric Oxygen Therapy (HBOT)", policy: "MP-112", aliases: ["hyperbaric", "hbot"] },
  { code: "BHA-RAD-5205", name: "Proton Beam Radiation Therapy", policy: "MP-113", aliases: ["proton"] },
  { code: "BHA-REH-9711", name: "Outpatient Physical Therapy Beyond the Initial 12 Visits", policy: "MP-114", aliases: ["physical therapy", "outpatient pt", "pt visits"] },
  { code: "BHA-IMG-7519", name: "Coronary CT Angiography (CCTA)", policy: "MP-115", aliases: ["coronary ct", "ccta", "coronary cta"] },
  { code: "BHA-HH-0550", name: "Home Health Services", policy: "MP-116", aliases: ["home health"] },
  { code: "BHA-DME-0601", name: "CPAP Continued Coverage (After the Initial 90 Days)", policy: "MP-118", aliases: ["cpap"] },
];

/* ------------------------------------------------------------------ policy versions */

const DOC5 = "If required documentation is missing, the request must be pended and the provider contacted for information. It must not be denied for lack of documentation until the information request has gone unanswered within the regulatory timeframe.";

const pv = (
  policy: string, version: number, title: string, from: string, to: string | null,
  logic: string, criteria: CriterionDef[], limitations: string[], documentation: string,
): PolicyVersionNode => ({
  id: `${policy} v${version}`, policy, version, title, effectiveFrom: from, effectiveTo: to,
  status: to ? "RETIRED" : "ACTIVE", pdf: `/kb/${policy}_v${version}.pdf`, logic, criteria, limitations,
  documentation: `${documentation} ${DOC5}`,
});

const c = (id: string, label: string, quote: string, section = "Section 3 (Coverage criteria)"): CriterionDef => ({ id, label, quote, section });

export const POLICY_VERSIONS: PolicyVersionNode[] = [
  pv("MP-101", 1, "Advanced Imaging: MRI of the Lumbar Spine", "2024-01-01", "2025-12-31", "1 OR 2", [
    c("redflag", "Red-flag condition", "Presence of a red-flag condition (suspected cauda equina syndrome, suspected spinal infection, suspected malignancy, progressive neurological deficit, or significant trauma)"),
    c("radic6", "Radiculopathy despite ≥6 weeks conservative therapy", "Radicular pain or radiculopathy that has persisted despite at least 6 weeks of documented conservative therapy (physical therapy, supervised exercise, NSAIDs or activity modification)."),
  ], ["Uncomplicated low back pain without radiculopathy and without red flags.", "Imaging requested solely for reassurance or at patient request."], "Office notes documenting symptom duration, neurological exam, conservative therapy type and duration; surgeon's note if requested for pre-surgical planning."),
  pv("MP-101", 2, "Advanced Imaging: MRI of the Lumbar Spine", "2026-01-01", null, "1 OR 2 OR 3", [
    c("redflag", "Red-flag condition", "Presence of a red-flag condition (suspected cauda equina syndrome, suspected spinal infection, suspected malignancy, progressive neurological deficit, or significant trauma)"),
    c("radic4", "Radiculopathy despite ≥4 weeks conservative therapy", "Radicular pain or radiculopathy that has persisted despite at least 4 weeks of documented conservative therapy"),
    c("presurg", "Pre-surgical planning", "Pre-surgical planning when spine surgery has already been scheduled or recommended by a spine surgeon."),
  ], ["Uncomplicated low back pain without radiculopathy and without red flags.", "Imaging requested solely for reassurance or at patient request."], "Office notes documenting symptom duration, neurological exam, conservative therapy type and duration; surgeon's note if requested for pre-surgical planning."),

  pv("MP-102", 1, "Bariatric (Weight-Loss) Surgery", "2024-01-01", "2025-06-30", "1 AND 2 AND 3", [
    c("bmi", "BMI ≥40, or ≥35 with comorbidity", "BMI of 40 or greater; OR BMI of 35 or greater with at least one obesity-related comorbidity (type 2 diabetes, hypertension, obstructive sleep apnea, or dyslipidemia)"),
    c("wmp6", "≥6-month supervised weight-management program", "Completion of a physician-supervised weight-management program of at least 6 consecutive months within the past 2 years"),
    c("psych", "Psychological clearance", "A pre-operative psychological evaluation clearing the member for surgery."),
  ], ["BMI below 35.", "Absence of psychological clearance."], "Height, weight and BMI; comorbidity documentation; psychological evaluation report; weight-management program records where required."),
  pv("MP-102", 2, "Bariatric (Weight-Loss) Surgery", "2025-07-01", null, "1 AND 2", [
    c("bmi", "BMI ≥40, or ≥35 with comorbidity", "BMI of 40 or greater; OR BMI of 35 or greater with at least one obesity-related comorbidity (type 2 diabetes, hypertension, obstructive sleep apnea, or dyslipidemia)"),
    c("psych", "Psychological clearance", "A pre-operative psychological evaluation clearing the member for surgery."),
  ], ["BMI below 35.", "Absence of psychological clearance."], "Height, weight and BMI; comorbidity documentation; psychological evaluation report."),

  pv("MP-103", 1, "Continuous Glucose Monitors (CGM)", "2024-01-01", "2025-12-31", "1 AND 2", [
    c("dm", "Diabetes mellitus", "Diagnosis of diabetes mellitus (type 1 or type 2)"),
    c("intensive", "Intensive insulin (≥3 injections/day or pump)", "Intensive insulin therapy: 3 or more daily insulin injections, or use of an insulin pump."),
  ], ["Diabetes managed with oral agents or basal insulin alone.", "Use for non-diabetic indications."], "Diagnosis, current medication list showing insulin regimen, hypoglycemia history if relevant."),
  pv("MP-103", 2, "Continuous Glucose Monitors (CGM)", "2026-01-01", null, "1 AND 2", [
    c("dm", "Diabetes mellitus", "Diagnosis of diabetes mellitus (type 1 or type 2)"),
    c("insulin_or_hypo", "Any insulin, or problematic hypoglycemia", "Either (a) treatment with insulin of any type or frequency, including basal-only insulin; or (b) a documented history of problematic hypoglycemia (recurrent level 2 events, or at least one level 3 event)."),
  ], ["Diabetes managed with non-insulin therapy and no history of problematic hypoglycemia.", "Use for non-diabetic indications."], "Diagnosis, current medication list showing insulin regimen, hypoglycemia history if relevant."),

  pv("MP-104", 1, "Attended In-Laboratory Polysomnography", "2024-01-01", null, "1 OR 2 OR 3", [
    c("hsat_neg", "HSAT negative, inconclusive or inadequate", "A home sleep apnea test (HSAT) was performed and was negative, inconclusive, or technically inadequate"),
    c("comorbid", "Comorbidity makes HSAT unreliable", "The member has a significant comorbidity that makes HSAT unreliable (moderate-to-severe COPD, heart failure, neuromuscular disease)"),
    c("non_osa", "Non-OSA sleep disorder suspected", "A sleep disorder other than obstructive sleep apnea is suspected (narcolepsy, parasomnia, periodic limb movement disorder)."),
  ], ["Initial evaluation for suspected OSA in a member without the comorbidities above, when HSAT has not been attempted.", "Repeat diagnostic testing after a positive HSAT."], "Sleep history and Epworth score; HSAT report if performed; documentation of relevant comorbidities."),

  pv("MP-105", 1, "Arthroscopic Knee Surgery", "2024-01-01", null, "1 AND 2 AND 3 AND 4", [
    c("mech", "Mechanical symptoms", "Mechanical symptoms (locking, catching, or giving way)"),
    c("tear", "Meniscal tear / loose body on MRI", "A meniscal tear or loose body confirmed on MRI"),
    c("cons6", "≥6 weeks conservative therapy", "Failure of at least 6 weeks of conservative therapy"),
    c("no_adv_oa", "No advanced OA (KL 3–4)", "Absence of advanced osteoarthritis (Kellgren-Lawrence grade 3 or 4)."),
  ], ["Arthroscopic debridement or lavage for osteoarthritis.", "Any arthroscopy in a knee with Kellgren-Lawrence grade 3 or 4 osteoarthritis."], "Knee exam, MRI report, weight-bearing radiographs with Kellgren-Lawrence grade, conservative therapy record."),

  pv("MP-106", 1, "Total Knee Arthroplasty (TKA)", "2024-01-01", "2025-12-31", "1 AND 2 AND 3 AND 4", [
    c("kl34", "KL grade 3 or 4", "Radiographic osteoarthritis of Kellgren-Lawrence grade 3 or 4"),
    c("func", "Functional limitation", "Functional limitation interfering with activities of daily living"),
    c("cons3m", "≥3 months conservative management", "Failure of at least 3 months of conservative management"),
    c("bmi_lt40", "BMI below 40", "BMI below 40."),
  ], ["BMI of 40 or greater.", "Kellgren-Lawrence grade 0 to 2."], "Standing radiographs with Kellgren-Lawrence grade, functional assessment, conservative therapy record, BMI."),
  pv("MP-106", 2, "Total Knee Arthroplasty (TKA)", "2026-01-01", null, "1 AND 2 AND 3 AND 4", [
    c("kl34", "KL grade 3 or 4", "Radiographic osteoarthritis of Kellgren-Lawrence grade 3 or 4"),
    c("func", "Functional limitation", "Functional limitation interfering with activities of daily living"),
    c("cons3m", "≥3 months conservative management", "Failure of at least 3 months of conservative management"),
    c("optim", "If BMI ≥40: risk-optimization documented", "If BMI is 40 or greater: documentation that a pre-operative risk-optimization discussion (weight, glycemic control, smoking) has taken place."),
  ], ["Kellgren-Lawrence grade 0 to 2.", "BMI of 40 or greater without documented risk-optimization discussion."], "Standing radiographs with Kellgren-Lawrence grade, functional assessment, conservative therapy record, BMI and optimization note."),

  pv("MP-107", 1, "Genetic Testing for Hereditary Breast and Ovarian Cancer (BRCA1/2)", "2024-01-01", null, "1 OR 2 OR 3", [
    c("bc45", "Breast cancer at age ≤45", "Personal history of breast cancer diagnosed at age 45 or younger"),
    c("ovarian", "Ovarian cancer at any age", "Personal history of ovarian cancer at any age"),
    c("fdr", "First-degree relative with BRCA variant", "A first-degree relative with a known pathogenic BRCA1/2 variant."),
  ], ["Population screening in members without the personal or family history above."], "Personal and three-generation family cancer history; genetic counseling note."),

  pv("MP-108", 1, "Blepharoplasty (Upper Eyelid Surgery)", "2024-01-01", null, "1 AND 2", [
    c("vf12", "Superior field loss ≥12°", "Formal visual field testing showing superior visual field loss of at least 12 degrees attributable to eyelid position"),
    c("photos", "Clinical photographs", "Clinical photographs documenting eyelid position."),
  ], ["Surgery performed to improve appearance (cosmetic).", "Superior visual field loss under 12 degrees."], "Formal visual field study (taped and untaped), external photographs."),

  pv("MP-109", 1, "Septoplasty", "2024-01-01", null, "1 AND 2 AND 3", [
    c("obstruction", "Symptomatic nasal obstruction", "Symptomatic nasal airway obstruction"),
    c("deviation", "Septal deviation on exam", "Septal deviation documented on examination"),
    c("med4", "≥4 weeks medical management", "Failure of at least 4 weeks of medical management (intranasal steroids and/or antihistamines)."),
  ], ["Rhinoplasty performed for cosmetic purposes."], "Nasal exam, medication trial history."),

  pv("MP-110", 1, "Spinal Cord Stimulator (SCS) Trial", "2024-01-01", "2025-09-30", "1 AND 2 AND 3", [
    c("pain6m", "Neuropathic pain ≥6 months", "Chronic neuropathic pain of at least 6 months' duration"),
    c("pt", "Failed conservative treatment incl. PT", "Failure of conservative treatment, including physical therapy"),
    c("psych", "Psychological clearance", "Psychological evaluation clearing the member for implantation."),
  ], ["Pain of under 6 months' duration.", "No psychological evaluation."], "Pain history, therapy and medication history, psychological evaluation report."),
  pv("MP-110", 2, "Spinal Cord Stimulator (SCS) Trial", "2025-10-01", null, "1 AND 2 AND 3 AND 4", [
    c("pain6m", "Neuropathic pain ≥6 months", "Chronic neuropathic pain of at least 6 months' duration"),
    c("pt", "Failed conservative treatment incl. PT", "Failure of conservative treatment, including physical therapy"),
    c("meds2", "Failed ≥2 medication classes", "Documented failure of at least 2 classes of pain medication (e.g. anticonvulsants, SNRIs, tricyclics)"),
    c("psych", "Psychological clearance", "Psychological evaluation clearing the member for implantation."),
  ], ["Pain of under 6 months' duration.", "Fewer than 2 medication classes tried.", "No psychological evaluation."], "Pain history, therapy and medication history, psychological evaluation report."),

  pv("MP-111", 1, "Endovenous Ablation of Varicose Veins", "2024-01-01", null, "1 AND 2 AND 3", [
    c("symptomatic", "Symptomatic varicose veins", "Symptomatic varicose veins (pain, swelling, heaviness, skin changes)"),
    c("reflux500", "Reflux ≥500 ms on duplex", "Duplex ultrasound showing reflux of at least 500 milliseconds in the treated vein"),
    c("compress3m", "≥3 months compression", "Failure of at least 3 months of compression therapy."),
  ], ["Treatment of spider veins or for cosmetic purposes.", "Reflux under 500 ms."], "Symptom history, duplex ultrasound report with reflux times, compression therapy record."),

  pv("MP-112", 1, "Hyperbaric Oxygen Therapy (HBOT)", "2024-01-01", null, "1 OR 2", [
    c("wagner3", "Diabetic wound Wagner ≥3 failing ≥30 days care", "Diabetic lower-extremity wound of Wagner grade 3 or higher that has failed at least 30 days of standard wound care"),
    c("radnecrosis", "Radiation necrosis", "Soft-tissue or bone radiation necrosis."),
  ], ["Diabetic wounds of Wagner grade 2 or lower.", "Investigational (MP-117): autism spectrum disorder; sports injury recovery or athletic performance; long COVID; cognitive decline."], "Wound measurements, Wagner grade, wound-care log; radiation history if applicable."),

  pv("MP-113", 1, "Proton Beam Radiation Therapy", "2024-01-01", null, "1 OR 2 OR 3", [
    c("cns_u21", "CNS tumor in member under 21", "Primary or metastatic tumor of the central nervous system in a member under 21"),
    c("uveal", "Uveal (ocular) melanoma", "Uveal (ocular) melanoma"),
    c("chordoma", "Chordoma / chondrosarcoma (skull base or spine)", "Chordoma or chondrosarcoma of the skull base or spine."),
  ], ["Localized prostate cancer (intensity-modulated radiation therapy is considered equally effective).", "Breast cancer."], "Pathology, staging, radiation oncology consult."),

  pv("MP-114", 1, "Outpatient Physical Therapy Beyond the Initial 12 Visits", "2024-01-01", null, "1 AND 2", [
    c("progress_note", "Current progress note (within last 10 visits)", "A current progress note (dated within the last 10 visits)"),
    c("progress", "Measurable functional progress, goals not met", "Documented measurable functional progress toward stated goals, with goals not yet met."),
  ], ["Maintenance therapy where no further functional progress is expected.", "Visit counts are also subject to the plan's annual benefit limit, which is set out in each plan document."], "Initial evaluation, most recent progress note with objective measures, visit count."),

  pv("MP-115", 1, "Coronary CT Angiography (CCTA)", "2024-01-01", null, "1 AND 2", [
    c("chestpain", "Stable chest pain / anginal equivalent", "Stable chest pain or anginal-equivalent symptoms"),
    c("intermediate", "Intermediate pre-test probability", "Intermediate pre-test probability of coronary artery disease."),
  ], ["Screening in asymptomatic members.", "Low pre-test probability.", "High pre-test probability (invasive angiography is the appropriate test)."], "Symptom description and pre-test probability assessment."),

  pv("MP-116", 1, "Home Health Services", "2024-01-01", null, "1 AND 2 AND 3", [
    c("homebound", "Homebound", "The member is homebound (leaving home requires considerable and taxing effort)"),
    c("skilled", "Intermittent skilled need", "The member needs intermittent skilled nursing or therapy services"),
    c("poc", "Signed plan of care", "A plan of care signed by the treating physician."),
  ], ["Custodial care only (bathing, dressing, meal preparation) with no skilled need."], "Homebound documentation, skilled-need description, signed plan of care."),

  pv("MP-117", 1, "Experimental and Investigational Services", "2024-01-01", null, "definition", [
    c("investigational", "Investigational service", "A service is investigational when it lacks final FDA approval for the indication, OR peer-reviewed evidence is insufficient to show improved health outcomes, OR it is not accepted as standard of care by the relevant specialty society."),
  ], ["Investigational services are excluded from coverage under every plan Bellcourt administers. A denial on this basis is a coverage (benefit) determination rather than a medical-necessity determination, but it must still cite this policy and the service-specific policy."], "Not applicable."),

  pv("MP-118", 1, "CPAP Continued Coverage (After the Initial 90 Days)", "2024-01-01", null, "1", [
    c("adherence", "≥4 h/night on ≥70% of nights (30 consecutive days)", "Objective download showing CPAP use of 4 or more hours per night on at least 70% of nights during a consecutive 30-day period within the first 90 days of use."),
  ], ["Adherence below the threshold above."], "Device compliance download covering a consecutive 30-day period."),
];

/* ------------------------------------------------------------------ plan provisions */

const SPD_IDS = ["SPD-HARLAN", "SPD-BRIGHT", "SPD-KESTREL", "SPD-SORREL", "SPD-JUNIPER", "SPD-OSTR"];
const visitLimit: Record<string, number> = { "SPD-BRIGHT": 20, "SPD-HARLAN": 30, "SPD-JUNIPER": 24, "SPD-KESTREL": 25, "SPD-OSTR": 30, "SPD-SORREL": 30 };

export const PROVISIONS: ProvisionNode[] = [
  ...SPD_IDS.map<ProvisionNode>((doc) => ({
    id: `${doc}#4.2`, doc, section: "Section 4.2 (Outpatient rehabilitation)", kind: "VISIT_LIMIT", services: ["BHA-REH-9711"],
    params: { limit: visitLimit[doc] },
    quote: `Outpatient physical, occupational and speech therapy are limited to a combined ${visitLimit[doc]} visits per plan year. Visits beyond the 12th require prior authorization and are reviewed under Bellcourt medical policy MP-114. Visits above the annual limit are not covered regardless of medical necessity.`,
  })),
  ...SPD_IDS.map<ProvisionNode>((doc) => ({
    id: `${doc}#6.3`, doc, section: "Section 6.3 (Experimental and investigational services)", kind: "EXCLUSION", services: ["*investigational"],
    quote: "Services considered experimental or investigational under Bellcourt medical policy MP-117.",
  })),
  ...SPD_IDS.map<ProvisionNode>((doc) => ({
    id: `${doc}#5.5`, doc, section: "Section 5.5 (Adverse determinations)", kind: "ADVERSE_DETERMINATION_RULE", services: ["*"],
    quote: "Any denial based on medical necessity must be made by a licensed physician. The notice must state the specific reason, the plan provision or clinical criteria relied upon, and the member's appeal rights.",
  })),
  // Bariatric
  { id: "SPD-HARLAN#6.4", doc: "SPD-HARLAN", section: "Section 6.4 (Bariatric surgery)", kind: "EXCLUSION", services: ["BHA-SURG-4310"], quote: "Surgical treatment of obesity is excluded under this Plan." },
  { id: "SPD-KESTREL#6.4", doc: "SPD-KESTREL", section: "Section 6.4 (Bariatric surgery)", kind: "EXCLUSION", services: ["BHA-SURG-4310"], effectiveTo: "2025-12-31", quote: "Surgical treatment of obesity is excluded under this Plan. … It remains in force only for dates of service up to and including December 31, 2025." },
  { id: "SPD-KESTREL#8-A3", doc: "SPD-KESTREL", section: "Section 8 (Amendment No. 3, eff. 2026-01-01)", kind: "COVERED_PER_POLICY", services: ["BHA-SURG-4310"], effectiveFrom: "2026-01-01", quote: "Amendment No. 3, effective January 1, 2026. Section 6.4 (Bariatric surgery exclusion) is deleted in its entirety. Effective for dates of service on or after January 1, 2026, bariatric surgery is a covered benefit subject to prior authorization under Bellcourt medical policy MP-102." },
  { id: "SPD-BRIGHT#6.4", doc: "SPD-BRIGHT", section: "Section 6.4 (Bariatric surgery)", kind: "COVERED_PER_POLICY", services: ["BHA-SURG-4310"], quote: "Covered subject to Bellcourt medical policy MP-102 and Section 5.3." },
  { id: "SPD-BRIGHT#5.3", doc: "SPD-BRIGHT", section: "Section 5.3 (Centers of Excellence)", kind: "CENTER_OF_EXCELLENCE", services: ["BHA-SURG-4310"], params: { facilities: ["Front Range Bariatric Institute", "Summit Metabolic Surgery Center"] }, quote: "Bariatric surgery is covered only when performed at a designated Center of Excellence. Current designated facilities: Front Range Bariatric Institute; Summit Metabolic Surgery Center. Bariatric surgery at any other facility is not covered." },
  ...["SPD-SORREL", "SPD-JUNIPER", "SPD-OSTR"].map<ProvisionNode>((doc) => ({ id: `${doc}#6.4`, doc, section: "Section 6.4 (Bariatric surgery)", kind: "COVERED_PER_POLICY", services: ["BHA-SURG-4310"], quote: "Covered subject to Bellcourt medical policy MP-102." })),
  // Blepharoplasty
  { id: "SPD-SORREL#6.2", doc: "SPD-SORREL", section: "Section 6.2 (Eyelid surgery)", kind: "STRICTER_CRITERION", services: ["BHA-SURG-1582"], params: { minFieldLossDegrees: 30 }, quote: "Blepharoplasty is covered ONLY when formal visual field testing shows superior visual field loss of 30 degrees or more. This requirement applies in addition to, and is stricter than, the Bellcourt medical policy. Requests with superior field loss below 30 degrees are not covered under this Plan." },
  // Proton
  { id: "SPD-BRIGHT#6.7", doc: "SPD-BRIGHT", section: "Section 6.7 (Proton beam therapy)", kind: "AGE_LIMITED_EXCLUSION", services: ["BHA-RAD-5205"], params: { coveredUnderAge: 21 }, quote: "Proton beam radiation therapy is excluded except for members under age 21." },
  // Second opinion
  { id: "SPD-JUNIPER#5.6", doc: "SPD-JUNIPER", section: "Section 5.6 (Mandatory second surgical opinion)", kind: "SECOND_OPINION", services: ["BHA-SURG-6350"], quote: "Before any spinal procedure (including spinal fusion, laminectomy, and spinal cord stimulator trial or implantation) may be authorized, a second opinion from a board-certified spine surgeon or pain specialist not affiliated with the requesting provider must be documented. Requests without a documented second opinion must be pended for this information." },
  // Riverbend addendum
  { id: "RB#2.1-CGM", doc: "RIVERBEND-ADDENDUM", section: "Section 2.1 (Medicare Advantage: Medicare coverage rules take precedence)", kind: "MEDICARE_CRITERIA_OVERRIDE", services: ["BHA-DME-2103"], params: { product: "MA" }, quote: "Continuous glucose monitors — Diabetes mellitus AND either (a) insulin treatment of any type or frequency, or (b) documented problematic hypoglycemia. Applies to all dates of service under this Agreement." },
  { id: "RB#2.1-CPAP", doc: "RIVERBEND-ADDENDUM", section: "Section 2.1 (Medicare Advantage)", kind: "MEDICARE_CRITERIA_OVERRIDE", services: ["BHA-DME-0601"], params: { product: "MA", same: "MP-118" }, quote: "CPAP continued coverage — As MP-118 (4 or more hours per night on at least 70% of nights in a consecutive 30-day period within the first 90 days)." },
  { id: "RB#2.1-HBOT", doc: "RIVERBEND-ADDENDUM", section: "Section 2.1 (Medicare Advantage)", kind: "MEDICARE_CRITERIA_OVERRIDE", services: ["BHA-THER-1830"], params: { product: "MA", same: "MP-112" }, quote: "Hyperbaric oxygen therapy — As MP-112." },
  { id: "RB#2.1-HH", doc: "RIVERBEND-ADDENDUM", section: "Section 2.1 (Medicare Advantage)", kind: "MEDICARE_CRITERIA_OVERRIDE", services: ["BHA-HH-0550"], params: { product: "MA", same: "MP-116" }, quote: "Home health services — As MP-116." },
  { id: "RB#2.2", doc: "RIVERBEND-ADDENDUM", section: "Section 2.2 (Marketplace product)", kind: "COVERED_PER_POLICY", services: ["*"], params: { product: "ACA" }, quote: "Bellcourt medical policies apply without modification." },
  { id: "RB#4", doc: "RIVERBEND-ADDENDUM", section: "Section 4 (Adverse determinations)", kind: "ADVERSE_DETERMINATION_RULE", services: ["*"], quote: "Only a licensed physician may issue a denial based on medical necessity. Nurses may approve but may not deny. For Arizona members, effective July 1, 2026, a medical director licensed in Arizona must personally review and sign every denial of a medical-necessity request. … For Texas members, where any automated or AI-assisted tool was used in reviewing the request, the notice must disclose that use." },
  { id: "RB#3", doc: "RIVERBEND-ADDENDUM", section: "Section 3 (Decision timeframes)", kind: "TIMEFRAME", services: ["*"], quote: "Medicare Advantage: 7 calendar days standard, 72 hours expedited. Marketplace (GA): 15 calendar days standard, 72 hours expedited. Clocks start when Bellcourt receives the request through any channel, including fax, regardless of whether it has been entered into Bellcourt's systems." },
  { id: "RB#5", doc: "RIVERBEND-ADDENDUM", section: "Section 5 (Automation and artificial intelligence)", kind: "ADVERSE_DETERMINATION_RULE", services: ["*"], quote: "No such tool may deny, delay, or modify a request on its own; a qualified human must make every adverse decision. Bellcourt must be able to produce, on audit, the inputs and outputs of any such tool for a given case." },
];

export const MEMOS: MemoNode[] = [
  {
    id: "UM-MEMO-2025-19", date: "2025-12-18", conflictsWith: ["MP-101 v2"],
    quote: "Please continue to apply the 6-week conservative therapy requirement for lumbar MRI requests until further notice.",
    verdict: "Void to the extent of the conflict (GOV-01 §1, level 4): MP-101 v2 sets 4 weeks for dates of service from 2026-01-01.",
  },
  {
    id: "UM-MEMO-2026-04", date: "2026-03-09", conflictsWith: [],
    quote: "Until then, screens show the previous criteria. Reviewers should check the UM Library for the current policy text.",
    verdict: "Informational: PACE screens for MP-101, MP-103, MP-106, MP-102 and MP-110 lag the active versions. Bell resolves from the library, not the screen.",
  },
];

export const GOV01 = {
  hierarchy: "When sources conflict, reviewers apply them in this order: 1 Federal and state law and regulation applicable to the product. 2 The client's plan document (SPD) or delegation agreement, including Medicare coverage rules for MA members. 3 Bellcourt medical policies approved by the Clinical Policy Committee, in the version effective on the date of service. 4 Operational memos, job aids and training materials. These explain process and cannot change clinical criteria. A memo that conflicts with an approved medical policy is void to the extent of the conflict.",
  versioning: "Reviewers must apply the version effective on the date of service, not the date of the request or the date of review.",
};

export const docById = (id: string) => DOCUMENTS.find((d) => d.id === id);
export const clientById = (id: string | null | undefined) => CLIENTS.find((c) => c.id === id);
export const serviceByCode = (code: string | null | undefined) => SERVICES.find((s) => s.code === code);
export const serviceByName = (name: string | null | undefined): ServiceNode | undefined => {
  if (!name) return undefined;
  const n = name.toLowerCase();
  return SERVICES.find((s) => s.name.toLowerCase() === n) ?? SERVICES.find((s) => s.aliases.some((a) => n.includes(a)));
};
