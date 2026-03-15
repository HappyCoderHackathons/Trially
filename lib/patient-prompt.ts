/**
 * System prompt for the LLM: turn summary + medical extraction into a single
 * patient JSON object for the trials API (ClinicalTrials.gov search + filter).
 */

export const PATIENT_FROM_SUMMARY_SYSTEM = `You are a medical data normalizer. Your only job is to output a single JSON object that represents the patient for clinical trial matching.

You will receive:
1. A free-text summary (e.g. from a conversation or notes).
2. Structured medical extraction (entities, ICD-10, RxNorm, SNOMED, PHI) from that same text.

Output exactly one JSON object with no markdown, no code fence, no explanation. The object must match the trials API patient schema so it can be used for trial search and filtering.

Patient schema (use only keys that you can infer; omit keys you do not know):
- diagnosis: string (primary condition NAME for search) or { primary?, secondary?: string[], stage?, severity?, duration?, diagnosedDate?, affectedAreas?: string[], icd10Code? }. CRITICAL: primary must be the condition NAME (e.g. "Rheumatoid arthritis"), not an ICD-10 code like "M06.9", so that clinical trial search can match. Put ICD-10 in icd10Code if needed.
- demographics: { age?, sex?, ethnicity?, nationality?, countryOfResidence?, occupation?, employmentStatus?, isHealthyVolunteer?, location?: { city?, state?, zip?, coordinates? } }
- symptoms: { current?: string[], painScore?, morningStiffnessDuration?, functionalLimitations?: string[] }
- currentMedications: Array<{ name?, dosage?, frequency?, duration?, indication?, effectiveness?, controlled? }>
- previousMedications: Array<{ name?, dosage?, duration?, discontinuedReason?, adverseEffects? }>
- comorbidities: Array<{ condition?, severity?, controlled?, onsetDate?, notes? }>
- labResults: Array<{ test?, value?, unit?, referenceRange?, flag?, date? }>
- allergies: Array<{ substance?, reaction?, severity? }>
- surgicalHistory: Array<{ procedure?, date?, outcome?, notes? }>
- familyHistory: Array<{ relation?, condition? }>
- vitalSigns: { height?: { value?, unit? }, weight?: { value?, unit? }, bmi?, bloodPressure?: { systolic?, diastolic? }, heartRate? }
- trialPreferences: { preferredPhases?: string[], excludedInterventionTypes?: string[], maxTravelDistance?, maxVisitFrequency?, willingToParticipate?, previousTrialParticipation?, goals?: { desiredOutcomes?: string[], targetPainScore? } }
- lifestyle: { smokingStatus?, alcoholUse?, exerciseFrequency?, diet? }
- insurance: { provider?, plan?, coverageType? }
- consent: { informedConsent?, consentDate?, dataSharing? }

Prefer mapping from the structured medical extraction. For diagnosis.primary use the condition NAME (e.g. from the summary or the ICD-10 description like "Rheumatoid arthritis, unspecified"), never the raw ICD-10 code—trial search requires a name. You MUST set diagnosis.primary (or diagnosis as a string) to at least one condition/disease name so that clinical trial search can return results; if the summary mentions no specific condition, use the main symptom or reason for visit as the primary. Use RxNorm/SNOMED for medications and conditions. Use the summary to fill gaps. Output only valid JSON.`;

type RawEntity = { Text?: string; Category?: string; Type?: string; [k: string]: unknown }
type RawIcd10  = { Text?: string; Categories?: Array<{ Code?: string; Description?: string }> }
type RawRxNorm = { Text?: string; RxNormConcepts?: Array<{ Description?: string }> }
type RawSnomed = { Text?: string; SNOMEDCTConcepts?: Array<{ Code?: string; Description?: string }> }

/**
 * Strip noise (offsets, IDs, confidence scores, traits) from Comprehend Medical
 * output so the LLM prompt stays well within context limits.
 */
function slimMedicalData(raw: unknown): unknown {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return raw;
  const d = raw as Record<string, unknown>;
  const out: Record<string, unknown> = {};

  if (Array.isArray(d.medical_entities)) {
    const seen = new Set<string>();
    out.medical_entities = (d.medical_entities as RawEntity[])
      .map(e => ({ text: e.Text, category: e.Category, type: e.Type }))
      .filter(e => { const k = `${e.text}|${e.type}`; if (seen.has(k)) return false; seen.add(k); return true; });
  }
  if (Array.isArray(d.phi_data)) {
    out.phi_data = (d.phi_data as RawEntity[]).map(e => ({ text: e.Text, type: e.Type }));
  }
  if (Array.isArray(d.icd10_codes)) {
    out.icd10_codes = (d.icd10_codes as RawIcd10[]).map(e => ({
      text: e.Text,
      code: e.Categories?.[0]?.Code,
      description: e.Categories?.[0]?.Description,
    }));
  }
  if (Array.isArray(d.rx_norm)) {
    out.rx_norm = (d.rx_norm as RawRxNorm[]).map(e => ({
      text: e.Text,
      description: e.RxNormConcepts?.[0]?.Description,
    }));
  }
  if (Array.isArray(d.snomed_ct)) {
    out.snomed_ct = (d.snomed_ct as RawSnomed[]).map(e => ({
      text: e.Text,
      code: e.SNOMEDCTConcepts?.[0]?.Code,
      description: e.SNOMEDCTConcepts?.[0]?.Description,
    }));
  }
  return out;
}

export function buildPatientFromSummaryUserPrompt(summary: string, medicalData: unknown): string {
  const slim = slimMedicalData(medicalData);
  const medicalJson = typeof slim === "string" ? slim : JSON.stringify(slim);
  return `Summary:\n${summary}\n\nStructured medical data (use this to populate the patient object):\n${medicalJson}\n\nOutput the single patient JSON object only.`;
}
