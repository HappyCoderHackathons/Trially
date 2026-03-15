#!/usr/bin/env node
/**
 * Query /api/medical and /api/trials-search.
 *
 * Usage:
 *   node scripts/query-trials-search.mjs                    # run full flow: medical then trials-search
 *   node scripts/query-trials-search.mjs --medical-only     # only POST /api/medical
 *   node scripts/query-trials-search.mjs --uuid <id>        # only POST /api/trials-search with uuid
 *
 * Env:
 *   BASE_URL  Base URL of the app (default http://localhost:3000)
 */

const BASE_URL = process.env.BASE_URL?.replace(/\/?$/, "") || "http://localhost:3000";
const MEDICAL = `${BASE_URL}/api/medical`;
const TRIALS_SEARCH = `${BASE_URL}/api/trials-search`;

const sampleSummary = `
Patient is a 52-year-old female with rheumatoid arthritis, diagnosed 3 years ago.
Current medications: methotrexate 15mg weekly, folic acid. She has tried Humira in the past
but discontinued due to infection. Blood pressure 128/82, BMI 24. Location: Denver, CO.
Interested in clinical trials for RA, willing to travel up to 100 miles.
`.trim();

const operations = [
  "detect_entities",
  "detect_phi",
  "infer_icd10",
  "infer_rx_norm",
  "infer_snomed",
];

async function postMedical() {
  console.log("POST", MEDICAL);
  const res = await fetch(MEDICAL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text: sampleSummary, operations }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    console.error("medical error", res.status, data);
    process.exitCode = 1;
    return null;
  }
  console.log("medical ok", res.status);
  console.log("  id:", data.id);
  console.log("  patient:", data.patient ? Object.keys(data.patient) : "—");
  if (data.patientError) console.log("  patientError:", data.patientError);
  return data;
}

async function postTrialsSearch(uuid, pageSize = 10) {
  console.log("POST", TRIALS_SEARCH, { uuid, pageSize });
  const res = await fetch(TRIALS_SEARCH, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ uuid, pageSize }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    console.error("trials-search error", res.status, data);
    process.exitCode = 1;
    return null;
  }
  console.log("trials-search ok", res.status);
  console.log("  total:", data.total);
  console.log("  studies:", data.studies?.length ?? 0);
  if (Array.isArray(data.studies) && data.studies.length > 0) {
    const first = data.studies[0];
    console.log("  first study:", first?.name ?? first?.briefTitle ?? first?.id ?? first);
  }
  return data;
}

async function main() {
  const args = process.argv.slice(2);
  const medicalOnly = args.includes("--medical-only");
  const uuidArg = args.includes("--uuid") ? args[args.indexOf("--uuid") + 1] : null;

  if (uuidArg) {
    await postTrialsSearch(uuidArg);
    return;
  }

  const medicalData = await postMedical();
  if (!medicalData) return;

  if (medicalOnly) {
    console.log("\nTo query trials later: node scripts/query-trials-search.mjs --uuid", medicalData.id);
    return;
  }

  const id = medicalData.id;
  if (!id) {
    console.error("No id in medical response, cannot call trials-search");
    process.exitCode = 1;
    return;
  }

  console.log("");
  await postTrialsSearch(id);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
