#!/usr/bin/env node
/**
 * Independently verify trials search: fetch stored patient by uuid, then call
 * ClinicalTrials.gov API v2 directly with the same condition. No Lambda, no
 * app filtering — just raw API to confirm whether the upstream returns studies.
 *
 * Usage:
 *   node scripts/verify-trials-query.mjs <uuid>
 *   node scripts/verify-trials-query.mjs b29ca8e4-961a-4f96-9707-e3110f47f20a
 *
 * Env:
 *   BASE_URL  Base URL of the app (default http://localhost:3000) for GET /api/medical/:id
 */

const BASE_URL = process.env.BASE_URL?.replace(/\/?$/, "") || "http://localhost:3000";
const CTGOV_BASE = "https://clinicaltrials.gov/api/v2";

function getPrimaryDiagnosis(patient) {
  if (!patient) return null;
  if (typeof patient.diagnosis === "string") return patient.diagnosis.trim() || null;
  return patient.diagnosis?.primary != null ? String(patient.diagnosis.primary).trim() : null;
}

function collectConditionTerms(patient) {
  const terms = [];
  const add = (v) => {
    if (v == null) return;
    const s = String(v).trim();
    if (s && !terms.includes(s)) terms.push(s);
  };
  add(getPrimaryDiagnosis(patient));
  (patient?.diagnosis?.secondary ?? []).forEach((s) => add(s));
  (patient?.comorbidities ?? []).forEach((c) => add(c?.condition));
  (patient?.familyHistory ?? []).forEach((f) => add(f?.condition));
  return terms;
}

function conditionTermsWithFallback(patient) {
  let terms = collectConditionTerms(patient);
  if (terms.length > 0) return terms;
  const add = (v) => {
    if (v == null) return;
    const s = String(v).trim();
    if (s && !terms.includes(s)) terms.push(s);
  };
  (patient?.symptoms?.current ?? []).forEach(add);
  add(patient?.comorbidities?.[0]?.condition);
  add(patient?.familyHistory?.[0]?.condition);
  return terms;
}

function formatQueryValue(value) {
  const normalized = String(value).trim();
  if (!normalized) return null;
  return /\s/.test(normalized) ? `"${normalized}"` : normalized;
}

function joinQueryTerms(values) {
  return values.map(formatQueryValue).filter(Boolean).join(" OR ");
}

async function main() {
  const uuid = process.argv[2]?.trim();
  if (!uuid) {
    console.error("Usage: node scripts/verify-trials-query.mjs <uuid>");
    process.exitCode = 1;
    return;
  }

  console.log("1. Fetching stored record:", BASE_URL + "/api/medical/" + uuid);
  const medicalRes = await fetch(`${BASE_URL}/api/medical/${uuid}`);
  const record = await medicalRes.json().catch(() => ({}));
  if (!medicalRes.ok) {
    console.error("   Error:", medicalRes.status, record?.error ?? record);
    process.exitCode = 1;
    return;
  }

  const patient = record.patient;
  if (!patient || typeof patient !== "object") {
    console.error("   Record has no patient object.");
    process.exitCode = 1;
    return;
  }

  const primary = getPrimaryDiagnosis(patient);
  const terms = conditionTermsWithFallback(patient);
  const queryCond = terms.length > 0 ? joinQueryTerms(primary ? [primary] : terms) : null;

  console.log("   Patient snapshot:");
  console.log("     diagnosis.primary:", primary ?? "(empty)");
  console.log("     condition terms:", terms.length ? terms : "(none)");
  console.log("     query.cond value:", queryCond ?? "(none)");

  if (!queryCond) {
    console.error("\n   No condition to search. Trials API would send no query.cond.");
    process.exitCode = 1;
    return;
  }

  const params = new URLSearchParams();
  params.set("query.cond", queryCond);
  params.set("filter.overallStatus", "RECRUITING,NOT_YET_RECRUITING");
  params.set("pageSize", "10");
  params.set("fields", "NCTId,BriefTitle,BriefSummary,OverallStatus,LocationCity,LocationState,LeadSponsorName,Phase,EnrollmentCount,StartDate");
  params.set("countTotal", "true");

  const url = `${CTGOV_BASE}/studies?${params.toString()}`;
  console.log("\n2. Calling ClinicalTrials.gov API v2 (no Lambda, no app filtering):");
  console.log("   URL:", url);

  const ctRes = await fetch(url, { headers: { Accept: "application/json" } });
  const ctData = await ctRes.json().catch(() => ({}));

  if (!ctRes.ok) {
    console.error("   Error:", ctRes.status, ctData);
    process.exitCode = 1;
    return;
  }

  const total = ctData.totalCount ?? ctData.studies?.length ?? 0;
  const studies = ctData.studies ?? [];
  console.log("\n3. Result:");
  console.log("   totalCount:", total);
  console.log("   studies.length:", studies.length);
  if (studies.length > 0) {
    const first = studies[0];
    const title = first?.protocolSection?.identificationModule?.briefTitle ?? first?.briefTitle ?? first?.NCTId ?? "(no title)";
    console.log("   first study:", title);
  } else {
    console.log("   → Upstream returns 0 studies for this condition. Search/filter in app would also be 0.");
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
