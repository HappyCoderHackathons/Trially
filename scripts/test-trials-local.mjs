#!/usr/bin/env node
/**
 * Run the trials API Lambda handler locally with a stored patient (by uuid).
 * Uses the same code as lambdas/trialsapi so you can test the relaxed
 * condition matching without deploying. Cache (Redis/DynamoDB) may fail
 * locally; the handler will then fetch from ClinicalTrials.gov.
 *
 * Usage:
 *   node scripts/test-trials-local.mjs <uuid>
 *   node scripts/test-trials-local.mjs b29ca8e4-961a-4f96-9707-e3110f47f20a
 *
 * Env:
 *   BASE_URL  Base URL of the app (default http://localhost:3000) for GET /api/medical/:id
 */

const BASE_URL = process.env.BASE_URL?.replace(/\/?$/, "") || "http://localhost:3000";

async function main() {
  const uuid = process.argv[2]?.trim();
  if (!uuid) {
    console.error("Usage: node scripts/test-trials-local.mjs <uuid>");
    process.exitCode = 1;
    return;
  }

  console.log("1. Fetching patient from", BASE_URL + "/api/medical/" + uuid);
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

  console.log("   Patient diagnosis.primary:", patient.diagnosis?.primary ?? patient.diagnosis ?? "(none)");
  console.log("");

  console.log("2. Invoking Lambda handler locally (lambdas/trialsapi)...");
  const { handler } = await import("../lambdas/trialsapi/index.mjs");
  const event = {
    body: JSON.stringify({ patient, pageSize: 10 }),
  };
  const result = await handler(event);

  if (result.statusCode !== 200) {
    console.error("   Handler returned", result.statusCode, result.body);
    process.exitCode = 1;
    return;
  }

  const data = JSON.parse(result.body);
  console.log("3. Result:");
  console.log("   total:", data.total);
  console.log("   studies.length:", data.studies?.length ?? 0);
  if (Array.isArray(data.studies) && data.studies.length > 0) {
    console.log("   first:", data.studies[0]?.title ?? data.studies[0]?.name ?? data.studies[0]);
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
