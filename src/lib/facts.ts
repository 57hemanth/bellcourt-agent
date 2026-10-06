/**
 * Deterministic clinical-facts parser (fallback + cross-check for the LLM).
 * Convention: a fact is `null` when the record is silent (→ MISSING → pend), and an
 * explicit false/number when the record states it (→ can be NOT_MET).
 */
export type Facts = Record<string, string | number | boolean | string[] | null>;

const num = (m: RegExpMatchArray | null, i = 1) => (m ? Number(m[i]) : null);
const has = (t: string, re: RegExp) => re.test(t);

export function parseFacts(serviceCode: string, notesRaw: string | null, ctx: { ageYears?: number | null; requestingProvider?: string | null } = {}): Facts {
  const t = (notesRaw ?? "").replace(/\s+/g, " ").trim();
  const f: Facts = {};
  if (!t) return f;

  switch (serviceCode) {
    case "BHA-IMG-0721": {
      f.radicular = has(t, /no radiation below the knee|without radicul|no radicul/i) ? false
        : has(t, /radiat\w* (down|into) the (left|right|bilateral)? ?leg|radicul|L\d(-S\d)? distribution|straight-leg raise/i) ? true : null;
      f.conservativeWeeks = num(t.match(/(\d+)\s*weeks? of (?:PT|physical therapy|conservative|supervised exercise)/i));
      if (f.conservativeWeeks === null && has(t, /stretching at home/i)) f.conservativeWeeks = 0;
      f.redFlag = has(t, /cauda equina|saddle an(a)?esthesia|suspected (malignancy|infection)|progressive (neuro|weakness|deficit)|significant trauma|bowel or bladder/i);
      f.presurgical = has(t, /(spine surg\w*|spine surgeon|neurosurg\w*)[^.]{0,80}(recommended|scheduled)|surgical planning/i);
      break;
    }
    case "BHA-SURG-4310": {
      f.bmi = num(t.match(/BMI\s*(?:of\s*)?(\d+(?:\.\d+)?)/i));
      const com = t.match(/Comorbidities?:\s*([^.]+)\./i)?.[1] ?? "";
      f.comorbidities = /none/i.test(com) ? [] : ["type 2 diabetes", "hypertension", "OSA", "dyslipidemia"].filter((k) =>
        new RegExp(k === "type 2 diabetes" ? "diabet" : k === "OSA" ? "OSA|sleep apnea" : k, "i").test(com));
      if (!com) f.comorbidities = null;
      f.weightProgramMonths = num(t.match(/program for (\d+) months?/i));
      f.psych = has(t, /cleared for surgery|psych\w* (evaluation|eval)[^.]*cleared/i) ? "cleared" : has(t, /referral placed|eval\w* pending|not cleared/i) ? "pending" : null;
      f.facility = t.match(/Surgery planned at ([^.]+)\./i)?.[1]?.trim() ?? ctx.requestingProvider ?? null;
      break;
    }
    case "BHA-DME-2103": {
      f.diabetes = has(t, /diabet/i) ? true : null;
      f.insulinAny = has(t, /insulin|glargine|lispro|aspart|detemir|degludec|pump|omnipod/i) ? true : has(t, /regimen|metformin|oral agent|medication|no insulin/i) ? false : null;
      f.intensiveInsulin = has(t, /basal-bolus|insulin pump|omnipod|with each meal|3 or more (daily )?injections|multiple daily injections/i);
      f.problematicHypo = has(t, /severe hypoglycemia|level 3|glucagon|recurrent (level 2 )?hypoglyc/i);
      break;
    }
    case "BHA-DX-9581": {
      const neg = has(t, /HSAT.{0,140}?(inconclusive|technically inadequate|negative|dislodged|inadequate)/i);
      const pos = has(t, /HSAT.{0,80}?AHI\s*\d+(\.\d+)?.{0,40}?(mild|moderate|severe)? ?OSA/i) && !neg;
      f.hsat = neg ? "negative_or_inconclusive" : pos ? "positive" : has(t, /no prior sleep testing|HSAT not (attempted|performed)/i) ? "not_done" : null;
      f.hsatUnreliableComorbidity = has(t, /COPD|heart failure|neuromuscular/i);
      f.nonOsaSuspected = has(t, /narcolepsy|cataplexy|parasomnia|periodic limb/i);
      break;
    }
    case "BHA-SURG-2988": {
      f.mechanicalSymptoms = has(t, /no mechanical symptoms/i) ? false : has(t, /locking|catching|giving way/i) ? true : null;
      f.tearOnMri = has(t, /no (discrete )?meniscal tear|MRI[^.]*negative/i) ? false : has(t, /tear|loose body/i) ? true : null;
      f.conservativeWeeks = num(t.match(/(\d+)\s*weeks? (?:of )?PT/i));
      f.klGrade = num(t.match(/Kellgren-Lawrence grade (\d)|KL grade (\d)/i)) ?? num(t.match(/KL grade (\d)/i));
      break;
    }
    case "BHA-SURG-2744": {
      f.klGrade = num(t.match(/(?:KL|Kellgren-Lawrence) grade (\d)/i));
      f.functionalLimitation = has(t, /unable to walk|difficulty with (stairs|dressing)|ADL|activities of daily living/i) ? true : null;
      f.conservativeMonths = num(t.match(/Conservative (?:mgmt|management)[^.]*?x\s*(\d+)\s*months?/i)) ?? num(t.match(/(\d+)\s*months? of conservative/i));
      f.bmi = num(t.match(/BMI\s*(\d+(?:\.\d+)?)/i));
      f.optimizationDocumented = has(t, /optimization (discussed|documented)|optimi[sz]ation[^.]*documented/i);
      break;
    }
    case "BHA-LAB-8162": {
      f.breastCancerAge = num(t.match(/breast cancer diagnosed at age (\d+)/i));
      f.ovarianCancer = has(t, /ovarian cancer/i);
      f.firstDegreeRelativeBrca = has(t, /(sister|mother|father|brother|daughter|son)[^.]*(pathogenic )?BRCA/i);
      break;
    }
    case "BHA-SURG-1582": {
      f.fieldLossDegrees = num(t.match(/field loss (\d+(?:\.\d+)?) degrees/i));
      f.photos = has(t, /photograph/i) ? true : null;
      break;
    }
    case "BHA-SURG-3052": {
      f.obstruction = has(t, /nasal (airway )?obstruction/i) ? true : null;
      f.deviation = has(t, /septal deviation|deviated septum/i) ? true : null;
      f.medicalMgmtWeeks = has(t, /fluticasone|steroid|antihistamine|cetirizine|mometasone/i) ? num(t.match(/x\s*(\d+)\s*weeks?/i)) : null;
      break;
    }
    case "BHA-SURG-6350": {
      f.painMonths = num(t.match(/pain x\s*(\d+)\s*months?/i));
      f.ptCompleted = has(t, /not yet done PT|no PT/i) ? false : has(t, /completed PT|PT and injections|physical therapy without/i) ? true : null;
      const classes = new Set<string>();
      if (/gabapentin|pregabalin|carbamazepine/i.test(t)) classes.add("anticonvulsant");
      if (/duloxetine|venlafaxine|milnacipran/i.test(t)) classes.add("SNRI");
      if (/amitriptyline|nortriptyline|tricyclic/i.test(t)) classes.add("tricyclic");
      f.medicationClasses = classes.size ? Array.from(classes) : null;
      f.psych = has(t, /psych eval\w*:? cleared|cleared for (SCS|implant)/i) ? "cleared" : has(t, /psych eval\w* pending|referral/i) ? "pending" : null;
      f.secondOpinionDocumented = has(t, /second opinion (obtained|documented|completed|by Dr|from Dr|concurs)/i) ? true : null;
      break;
    }
    case "BHA-VASC-3647": {
      f.symptomatic = has(t, /aching|heaviness|edema|swelling|pain|skin changes/i) ? true : null;
      f.refluxMs = num(t.match(/reflux\s*(\d+)\s*ms/i));
      f.compressionMonths = num(t.match(/compression[^.]*x\s*(\d+)\s*months?/i));
      break;
    }
    case "BHA-THER-1830": {
      f.wagnerGrade = num(t.match(/Wagner grade (\d)/i));
      f.woundCareDays = num(t.match(/wound care[^.]*x\s*(\d+)\s*days?/i)) ?? num(t.match(/x\s*(\d+)\s*days/i));
      f.radiationNecrosis = has(t, /radiation necrosis|osteoradionecrosis/i);
      f.investigationalIndication = t.match(/autism|sports injury|athletic performance|long covid|cognitive decline/i)?.[0]?.toLowerCase() ?? null;
      break;
    }
    case "BHA-RAD-5205": {
      f.indication = has(t, /uveal|choroidal|ocular melanoma/i) ? "uveal_melanoma"
        : has(t, /chordoma|chondrosarcoma/i) ? "chordoma"
        : has(t, /medulloblastoma|glioma|ependymoma|CNS|brain tumor|astrocytoma/i) ? "cns_tumor"
        : has(t, /prostate/i) ? "prostate" : has(t, /breast|IDC|DCIS/i) ? "breast" : null;
      f.ageYears = num(t.match(/(\d+)\s*y\/?o/i)) ?? ctx.ageYears ?? null;
      break;
    }
    case "BHA-REH-9711": {
      f.visitsUsed = num(t.match(/(\d+)\s*PT visits used/i));
      f.visitsRequested = num(t.match(/requesting (\d+) additional/i));
      const lastVisit = num(t.match(/Last progress note is from visit (\d+)/i));
      f.currentProgressNote = has(t, /progress note dated within (the )?last 10 visits/i) ? true
        : lastVisit !== null && typeof f.visitsUsed === "number" ? f.visitsUsed - lastVisit <= 10 : null;
      f.measurableProgress = has(t, /plateau|maintenance/i) ? false : has(t, /improved|QuickDASH \d+ to \d+|goal \d+/i) ? true : null;
      break;
    }
    case "BHA-IMG-7519": {
      f.chestPain = has(t, /chest (pressure|pain|tightness)|anginal/i) ? true : has(t, /asymptomatic/i) ? false : null;
      f.pretestProbability = t.match(/probability[^.]*?(low|intermediate|high)/i)?.[1]?.toLowerCase() ?? null;
      break;
    }
    case "BHA-HH-0550": {
      f.homebound = has(t, /leaves home only|homebound|considerable (and taxing )?effort/i) ? true : null;
      f.skilledNeed = has(t, /skilled nursing|skilled therapy|IV antibiotic|wound care/i) ? true : has(t, /custodial|bathing|dressing only/i) ? false : null;
      f.planOfCareSigned = has(t, /plan of care signed/i) ? true : null;
      break;
    }
    case "BHA-DME-0601": {
      f.adherencePct = num(t.match(/(?:>=|≥)?\s*4\s*h(?:ou)?rs?[^.]*?on\s*(\d+)%\s*of nights/i)) ?? num(t.match(/(\d+)%\s*of nights/i));
      f.daysSinceSetup = num(t.match(/~?(\d+)\s*days ago/i));
      break;
    }
  }
  return f;
}

/** Phrases in provider-supplied text that try to steer the decision. Treated as untrusted data. */
const DIRECTIVE_PATTERNS: [RegExp, string][] = [
  [/note to (the )?(automated|ai|review) (review )?system/i, "Text addressed to an automated system"],
  [/ignore (all |any )?(previous|prior|above) (instructions|rules)/i, "Prompt-injection phrase"],
  [/pre-?approved/i, "Claims prior approval"],
  [/(skip|bypass|ignore|disregard)\b[^.]{0,60}(criteria|review|requirement|policy|instructions?)/i, "Asks to skip or disregard criteria"],
  [/mark (it |this )?(as )?approved|approve (today|immediately|now)/i, "Instructs approval"],
  [/(per|according to) (our|the) rep[^.]{0,80}(no longer|not) (need|required)/i, "Asserts a plan requirement was waived"],
];

export function detectDirectives(text: string | null): { label: string; excerpt: string }[] {
  if (!text) return [];
  const t = text.replace(/\s+/g, " ");
  const hits: { label: string; excerpt: string }[] = [];
  for (const [re, label] of DIRECTIVE_PATTERNS) {
    const m = t.match(re);
    if (m && m.index !== undefined) hits.push({ label, excerpt: t.slice(Math.max(0, m.index - 30), m.index + m[0].length + 40).trim() });
  }
  return hits;
}
