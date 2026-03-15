const BASE_URL = "https://clinicaltrials.gov/api/v2";

// ── Cache clients ──────────────────────────────────────────────
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { LambdaClient, InvokeCommand } from "@aws-sdk/client-lambda";

const lambdaClient = new LambdaClient({ region: process.env.AWS_REGION ?? "us-east-1" });

async function invokePipelineLogger(payload) {
  try {
    await lambdaClient.send(new InvokeCommand({
      FunctionName: "pipeline-logger",
      InvocationType: "RequestResponse",
      Payload: Buffer.from(JSON.stringify(payload)),
    }));
  } catch (err) {
    console.warn("[pipeline-logger] invoke failed:", err.message);
  }
}
import { DynamoDBDocumentClient, GetCommand, PutCommand } from "@aws-sdk/lib-dynamodb";
import Redis from "ioredis";

const dynamo = DynamoDBDocumentClient.from(
  new DynamoDBClient({ region: process.env.AWS_REGION ?? "us-east-1" })
);

let _redis = null;
function getRedis() {
  if (!_redis) {
    _redis = new Redis({
      host: process.env.ELASTICACHE_HOST,
      port: 6379,
      tls: {},
      connectTimeout: 2000,
      commandTimeout: 1000,
      retryStrategy: (times) => (times > 2 ? null : 200),
    });
    _redis.on("error", (err) => console.error("Valkey error:", err));
  }
  return _redis;
}

const TABLE_NAME    = "ClinicalTrialsCache";
const VALKEY_TTL    = 3600;       // 1 hour
const DYNAMO_TTL_HR = 24;         // 24 hours

function itemToData(item) {
  if (item.studies != null) {
    return {
      studies: item.studies ?? [],
      nextPageToken: item.nextPageToken ?? null,
      totalCount: item.totalCount ?? null,
    };
  }
  if (item.data != null) {
    return typeof item.data === "string" ? JSON.parse(item.data) : item.data;
  }
  return null;
}

async function getCached(key) {
  // 1. Valkey first
  try {
    const hit = await getRedis().get(`trials:${key}`);
    if (hit) return { source: "valkey", data: JSON.parse(hit) };
  } catch (e) { console.warn("Valkey GET failed:", e.message); }

  // 2. DynamoDB fallback
  try {
    const result = await dynamo.send(
      new GetCommand({ TableName: TABLE_NAME, Key: { cacheKey: key } })
    );
    if (result.Item) {
      const data = itemToData(result.Item);
      if (data) {
        try { await getRedis().set(`trials:${key}`, JSON.stringify(data), "EX", VALKEY_TTL); }
        catch (e) { console.warn("Valkey backfill failed:", e.message); }
        return { source: "dynamodb", data };
      }
    }
  } catch (e) {
    console.warn("DynamoDB GET failed:", e.message);
  }

  return null;
}

async function setCached(key, data) {
  const ttl = Math.floor(Date.now() / 1000) + DYNAMO_TTL_HR * 3600;
  await Promise.allSettled([
    getRedis().set(`trials:${key}`, JSON.stringify(data), "EX", VALKEY_TTL),
    dynamo.send(new PutCommand({
      TableName: TABLE_NAME,
      Item: { cacheKey: key, data: JSON.stringify(data), cachedAt: new Date().toISOString(), ttl },
    })),
  ]);
}
// ──────────────────────────────────────────────────────────────

const VALID_STATUSES = new Set([
  "RECRUITING",
  "NOT_YET_RECRUITING",
  "ACTIVE_NOT_RECRUITING",
  "COMPLETED",
  "ENROLLING_BY_INVITATION",
  "TERMINATED",
  "WITHDRAWN",
  "SUSPENDED",
  "UNKNOWN",
]);

const REQUIRED_FIELDS = [
  "NCTId",
  "BriefTitle",
  "BriefSummary",
  "OverallStatus",
  "LocationCity",
  "LocationState",
  "LeadSponsorName",
  "Phase",
  "EnrollmentCount",
  "StartDate",
].join(",");

function getPrimaryDiagnosis(patient) {
  if (typeof patient.diagnosis === "string") {
    return patient.diagnosis;
  }
  return patient.diagnosis?.primary ?? null;
}

function getCoordinates(patient) {
  return (
    patient.demographics?.location?.coordinates ??
    patient.location?.coordinates ??
    null
  );
}

function getLocationTerms(patient) {
  const location = patient.demographics?.location ?? patient.location ?? {};
  return [
    location.city,
    location.state,
    location.zip,
    patient.demographics?.countryOfResidence,
    patient.countryOfResidence,
  ].filter(Boolean);
}

function normalizeTravelDistance(value) {
  if (value == null || value === "") {
    return null;
  }

  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return `${value}mi`;
  }

  if (typeof value !== "string") {
    return null;
  }

  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/from clinic/g, "")
    .replace(/less than/g, "")
    .replace(/up to/g, "")
    .replace(/within/g, "")
    .trim();

  const match = normalized.match(
    /^(\d+(?:\.\d+)?)\s*(mi|mile|miles|km|kilometer|kilometers)?$/,
  );
  if (!match) {
    return null;
  }

  const [, distance, unit = "mi"] = match;
  const compactUnit = unit.startsWith("km") ? "km" : "mi";
  return `${distance}${compactUnit}`;
}

function createTermCollector() {
  const values = [];
  const seen = new Set();

  return {
    add(value) {
      if (value == null) {
        return;
      }

      const normalized = String(value).trim();
      if (!normalized) {
        return;
      }

      const key = normalized.toLowerCase();
      if (seen.has(key)) {
        return;
      }

      seen.add(key);
      values.push(normalized);
    },
    addAll(items) {
      for (const item of items ?? []) {
        this.add(item);
      }
    },
    toArray() {
      return values;
    },
  };
}

function formatPhaseValue(value) {
  if (typeof value !== "string") {
    return null;
  }

  const match = value.match(/^PHASE(\d+)$/);
  if (match) {
    return `phase ${match[1]}`;
  }

  return value.toLowerCase().replace(/_/g, " ");
}

function collectConditionTerms(patient) {
  const terms = createTermCollector();

  terms.add(getPrimaryDiagnosis(patient));
  terms.addAll(patient.diagnosis?.secondary);
  terms.addAll((patient.comorbidities ?? []).map((item) => item.condition));
  terms.addAll((patient.familyHistory ?? []).map((item) => item.condition));

  return terms.toArray();
}

function collectOutcomeTerms(patient) {
  const terms = createTermCollector();

  terms.addAll(patient.trialPreferences?.goals?.desiredOutcomes);
  terms.addAll(patient.symptoms?.functionalLimitations);

  const targetPainScore = patient.trialPreferences?.goals?.targetPainScore;
  if (targetPainScore != null) {
    terms.add(`target pain score ${targetPainScore}`);
  }

  return terms.toArray();
}

function collectGeneralTerms(patient) {
  const terms = createTermCollector();
  const demographics = patient.demographics ?? {};
  const location = demographics.location ?? patient.location ?? {};
  const diagnosis =
    typeof patient.diagnosis === "object" && patient.diagnosis != null
      ? patient.diagnosis
      : {};
  const symptoms = patient.symptoms ?? {};
  const trialPreferences = patient.trialPreferences ?? {};
  const goals = trialPreferences.goals ?? {};
  const lifestyle = patient.lifestyle ?? {};
  const vitalSigns = patient.vitalSigns ?? {};
  const insurance = patient.insurance ?? {};
  const consent = patient.consent ?? {};

  if (demographics.age != null) {
    terms.add(`age ${demographics.age}`);
  }
  terms.add(demographics.sex);
  terms.add(demographics.ethnicity);
  terms.add(demographics.nationality);
  terms.add(demographics.countryOfResidence);
  terms.add(demographics.occupation);
  terms.add(demographics.employmentStatus);
  terms.add(
    demographics.isHealthyVolunteer === true
      ? "healthy volunteer"
      : "diagnosed patient",
  );

  terms.add(location.zip);

  terms.add(diagnosis.stage);
  terms.add(diagnosis.severity);
  terms.add(diagnosis.duration);
  terms.add(diagnosis.diagnosedDate);
  terms.addAll(diagnosis.affectedAreas);

  terms.addAll(symptoms.current);
  if (symptoms.painScore != null) {
    terms.add(`pain score ${symptoms.painScore}`);
  }
  terms.add(symptoms.morningStiffnessDuration);
  terms.addAll(symptoms.functionalLimitations);

  for (const medication of patient.currentMedications ?? []) {
    terms.add(medication.dosage);
    terms.add(medication.frequency);
    terms.add(medication.duration);
    terms.add(medication.indication);
    terms.add(medication.effectiveness);
    if (medication.controlled != null) {
      terms.add(medication.controlled ? "medication controlled" : "medication uncontrolled");
    }
  }

  for (const medication of patient.previousMedications ?? []) {
    terms.add(medication.dosage);
    terms.add(medication.duration);
    terms.add(medication.discontinuedReason);
    terms.addAll(medication.adverseEffects);
  }

  for (const item of patient.comorbidities ?? []) {
    terms.add(item.severity);
    if (item.controlled != null) {
      terms.add(item.controlled ? `${item.condition} controlled` : `${item.condition} uncontrolled`);
    }
    terms.add(item.onsetDate);
    terms.add(item.notes);
  }

  for (const item of patient.labResults ?? []) {
    terms.add(item.test);
    if (item.value != null && item.unit) {
      terms.add(`${item.value} ${item.unit}`);
    } else if (item.value != null) {
      terms.add(item.value);
    }
    terms.add(item.unit);
    terms.add(item.referenceRange);
    terms.add(item.flag);
    terms.add(item.date);
  }

  if (vitalSigns.height?.value != null && vitalSigns.height?.unit) {
    terms.add(`height ${vitalSigns.height.value} ${vitalSigns.height.unit}`);
  }
  if (vitalSigns.weight?.value != null && vitalSigns.weight?.unit) {
    terms.add(`weight ${vitalSigns.weight.value} ${vitalSigns.weight.unit}`);
  }
  if (vitalSigns.bmi != null) {
    terms.add(`BMI ${vitalSigns.bmi}`);
  }
  if (vitalSigns.bloodPressure?.systolic != null) {
    terms.add(`systolic ${vitalSigns.bloodPressure.systolic}`);
  }
  if (vitalSigns.bloodPressure?.diastolic != null) {
    terms.add(`diastolic ${vitalSigns.bloodPressure.diastolic}`);
  }
  if (vitalSigns.heartRate != null) {
    terms.add(`heart rate ${vitalSigns.heartRate}`);
  }

  for (const item of patient.allergies ?? []) {
    terms.add(`${item.substance} allergy`);
    terms.add(item.reaction);
    terms.add(item.severity);
  }

  for (const item of patient.surgicalHistory ?? []) {
    terms.add(item.procedure);
    terms.add(item.date);
    terms.add(item.outcome);
    terms.add(item.notes);
  }

  for (const item of patient.familyHistory ?? []) {
    terms.add(item.relation);
  }

  terms.add(lifestyle.smokingStatus);
  terms.add(lifestyle.alcoholUse);
  terms.add(lifestyle.exerciseFrequency);
  terms.add(lifestyle.diet);

  if (trialPreferences.willingToParticipate != null) {
    terms.add(
      trialPreferences.willingToParticipate
        ? "willing to participate"
        : "not willing to participate",
    );
  }
  if (trialPreferences.previousTrialParticipation != null) {
    terms.add(
      trialPreferences.previousTrialParticipation
        ? "previous trial participation"
        : "no previous trial participation",
    );
  }
  terms.addAll((trialPreferences.preferredPhases ?? []).map(formatPhaseValue));
  terms.addAll(trialPreferences.excludedInterventionTypes);
  terms.add(trialPreferences.maxTravelDistance);
  terms.add(trialPreferences.maxVisitFrequency);
  if (goals.targetPainScore != null) {
    terms.add(`goal pain score ${goals.targetPainScore}`);
  }
  terms.addAll(goals.desiredOutcomes);

  terms.add(insurance.provider);
  terms.add(insurance.plan);
  terms.add(insurance.coverageType);

  if (consent.informedConsent != null) {
    terms.add(consent.informedConsent ? "informed consent" : "no informed consent");
  }
  terms.add(consent.consentDate);
  if (consent.dataSharing != null) {
    terms.add(consent.dataSharing ? "data sharing" : "no data sharing");
  }

  return terms.toArray();
}

function collectFocusedKeywordTerms(patient) {
  const terms = createTermCollector();

  terms.addAll(patient.symptoms?.current);
  terms.addAll(patient.diagnosis?.affectedAreas);
  terms.addAll((patient.labResults ?? []).map((item) => item.test));
  terms.addAll((patient.allergies ?? []).map((item) => item.substance));
  terms.addAll((patient.currentMedications ?? []).map((item) => item.name));

  return terms.toArray();
}

function buildAdvancedFilter(patient) {
  const clauses = [];

  const failedDrugs = new Set(
    (patient.previousMedications ?? [])
      .filter((m) => m.discontinuedReason === "adverse effects")
      .map((m) => m.name?.trim())
      .filter(Boolean),
  );

  if (failedDrugs.size > 0) {
    clauses.push(
      [...failedDrugs]
        .map((drug) => `NOT AREA[InterventionName]"${drug}"`)
        .join(" AND "),
    );
  }

  const excludedInterventionTypes = (patient.trialPreferences?.excludedInterventionTypes ?? [])
    .map((value) => String(value).trim())
    .filter(Boolean);

  if (excludedInterventionTypes.length > 0) {
    clauses.push(
      excludedInterventionTypes
        .map((type) => `NOT \"${type}\"`)
        .join(" AND "),
    );
  }

  return clauses.join(" AND ");
}

function formatQueryValue(value) {
  const normalized = String(value).trim();
  if (!normalized) {
    return null;
  }

  return /\s/.test(normalized) ? `"${normalized}"` : normalized;
}

function joinQueryTerms(values) {
  return values.map(formatQueryValue).filter(Boolean).join(" OR ");
}

function getPatientAge(patient) {
  return patient.demographics?.age ?? patient.age ?? null;
}

function parseAgeToYears(value) {
  if (value == null || value === "N/A") {
    return null;
  }

  const match = String(value).trim().match(/^(\d+(?:\.\d+)?)\s+(year|years|month|months|week|weeks|day|days)$/i);
  if (!match) {
    return null;
  }

  const amount = Number(match[1]);
  const unit = match[2].toLowerCase();

  if (unit.startsWith("year")) {
    return amount;
  }
  if (unit.startsWith("month")) {
    return amount / 12;
  }
  if (unit.startsWith("week")) {
    return amount / 52;
  }
  return amount / 365;
}

function normalizeTravelDistanceValue(value) {
  const normalized = normalizeTravelDistance(value);
  if (!normalized) {
    return null;
  }

  const match = normalized.match(/^(\d+(?:\.\d+)?)(mi|km)$/);
  if (!match) {
    return null;
  }

  return {
    value: Number(match[1]),
    unit: match[2],
  };
}

function getStudyText(study) {
  const terms = createTermCollector();
  const protocol = study.protocolSection ?? {};

  terms.add(protocol.identificationModule?.briefTitle);
  terms.add(protocol.descriptionModule?.briefSummary);
  terms.addAll(protocol.conditionsModule?.conditions);
  terms.addAll(protocol.conditionsModule?.keywords);
  terms.addAll(
    (protocol.armsInterventionsModule?.interventions ?? []).map(
      (item) => item.name,
    ),
  );
  terms.addAll(
    (protocol.outcomesModule?.primaryOutcomes ?? []).map((item) => item.measure),
  );
  terms.addAll(
    (protocol.outcomesModule?.secondaryOutcomes ?? []).map(
      (item) => item.measure,
    ),
  );
  terms.add(protocol.eligibilityModule?.eligibilityCriteria);

  return terms.toArray().join(" ").toLowerCase();
}

function matchesAnyTerm(text, values) {
  const normalizedText = text.toLowerCase();
  return (values ?? []).some((value) => normalizedText.includes(String(value).toLowerCase()));
}

/** Expand condition terms so we also match key substrings (e.g. "heart failure" from "Heart Failure with Reduced Ejection Fraction (HFrEF)"). API already filtered by query.cond; we avoid over-filtering by requiring only a meaningful substring. */
function conditionTermsForMatching(conditionTerms) {
  const out = new Set();
  for (const term of conditionTerms ?? []) {
    const s = String(term).trim();
    if (!s) continue;
    out.add(s.toLowerCase());
    const inParen = s.match(/\(([^)]+)\)$/);
    if (inParen) out.add(inParen[1].trim().toLowerCase());
    const words = s.split(/\s+/).filter((w) => w.length > 1);
    if (words.length >= 2) out.add(words.slice(0, 2).join(" ").toLowerCase());
    else if (words.length === 1) out.add(words[0].toLowerCase());
  }
  return [...out];
}

function computeDistanceMiles(lat1, lon1, lat2, lon2) {
  const toRadians = (degrees) => (degrees * Math.PI) / 180;
  const earthRadiusMiles = 3958.8;
  const deltaLat = toRadians(lat2 - lat1);
  const deltaLon = toRadians(lon2 - lon1);
  const a =
    Math.sin(deltaLat / 2) ** 2 +
    Math.cos(toRadians(lat1)) *
      Math.cos(toRadians(lat2)) *
      Math.sin(deltaLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return earthRadiusMiles * c;
}

function normalizePatientSex(sex) {
  if (typeof sex !== "string") {
    return null;
  }

  const normalized = sex.trim().toLowerCase();
  if (normalized === "male") {
    return "MALE";
  }
  if (normalized === "female") {
    return "FEMALE";
  }
  if (normalized === "other") {
    return "ALL";
  }
  return null;
}

function buildPatientContext(patient) {
  return {
    patient,
    age: getPatientAge(patient),
    sex: normalizePatientSex(patient.demographics?.sex ?? patient.sex),
    coordinates: getCoordinates(patient),
    travelDistance: normalizeTravelDistanceValue(
      patient.trialPreferences?.maxTravelDistance ??
        patient.preferences?.logisticalConstraints?.travelDistance,
    ),
    conditionTerms: collectConditionTerms(patient),
    outcomeTerms: collectOutcomeTerms(patient),
    focusedKeywordTerms: collectFocusedKeywordTerms(patient),
    generalTerms: collectGeneralTerms(patient),
    preferredPhases: (patient.trialPreferences?.preferredPhases ?? []).filter(
      Boolean,
    ),
    healthyVolunteer: patient.demographics?.isHealthyVolunteer ?? null,
  };
}

function getStudyEligibility(study) {
  return study.protocolSection?.eligibilityModule ?? {};
}

function getStudyLocations(study) {
  return study.protocolSection?.contactsLocationsModule?.locations ?? [];
}

function getStudyPhases(study) {
  return study.protocolSection?.designModule?.phases ?? [];
}

function matchesStudyStatus(study) {
  const status = study.protocolSection?.statusModule?.overallStatus ?? null;
  return status === "RECRUITING";
}

function matchesStudyPhase(study, preferredPhases) {
  if (!preferredPhases || preferredPhases.length === 0) {
    return true;
  }

  const phases = getStudyPhases(study);
  if (phases.length === 0) {
    return false;
  }

  return phases.some((phase) => preferredPhases.includes(phase));
}

function matchesStudySex(study, patientSex) {
  if (!patientSex) {
    return true;
  }

  const studySex = getStudyEligibility(study).sex ?? "ALL";
  return studySex === "ALL" || studySex === patientSex;
}

function matchesStudyAge(study, patientAge) {
  if (patientAge == null) {
    return true;
  }

  const eligibility = getStudyEligibility(study);
  const minimumAge = parseAgeToYears(eligibility.minimumAge);
  const maximumAge = parseAgeToYears(eligibility.maximumAge);

  if (minimumAge != null && patientAge < minimumAge) {
    return false;
  }
  if (maximumAge != null && patientAge > maximumAge) {
    return false;
  }

  return true;
}

function matchesStudyLocation(study, coordinates, travelDistance) {
  if (!coordinates || !travelDistance) {
    return true;
  }

  const maxMiles =
    travelDistance.unit === "km"
      ? travelDistance.value * 0.621371
      : travelDistance.value;

  return getStudyLocations(study).some((location) => {
    const lat = location.geoPoint?.lat;
    const lon = location.geoPoint?.lon;
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
      return false;
    }

    const distance = computeDistanceMiles(
      coordinates.lat,
      coordinates.lng,
      lat,
      lon,
    );
    return distance <= maxMiles;
  });
}

function matchesStudyCondition(study, conditionTerms) {
  if (!conditionTerms || conditionTerms.length === 0) {
    return true;
  }
  // We already sent query.cond to the API, so returned studies are condition-relevant. Prefer text match but allow studies when text is missing (API v2 shape may vary).
  const text = getStudyText(study);
  if (!text || text.length < 2) return true;
  const termsToMatch = conditionTermsForMatching(conditionTerms);
  return matchesAnyTerm(text, termsToMatch);
}

function matchesHealthyVolunteerPreference(study, context) {
  if (context.healthyVolunteer !== true) {
    return true;
  }

  if (getPrimaryDiagnosis(context.patient)) {
    return true;
  }

  return getStudyEligibility(study).healthyVolunteers === true;
}

function scoreStudyForPatient(study, context) {
  if (!matchesStudyStatus(study)) {
    return null;
  }
  if (!matchesStudyCondition(study, context.conditionTerms)) {
    return null;
  }
  if (!matchesStudyPhase(study, context.preferredPhases)) {
    return null;
  }
  if (!matchesStudySex(study, context.sex)) {
    return null;
  }
  if (!matchesStudyAge(study, context.age)) {
    return null;
  }
  if (!matchesStudyLocation(study, context.coordinates, context.travelDistance)) {
    return null;
  }
  if (!matchesHealthyVolunteerPreference(study, context)) {
    return null;
  }

  const studyText = getStudyText(study);
  let score = 0;

  if (matchesAnyTerm(studyText, [getPrimaryDiagnosis(context.patient)])) {
    score += 8;
  }
  if (matchesAnyTerm(studyText, context.outcomeTerms)) {
    score += 3;
  }
  if (matchesAnyTerm(studyText, context.focusedKeywordTerms)) {
    score += 2;
  }
  if (matchesAnyTerm(studyText, context.generalTerms)) {
    score += 1;
  }

  return score;
}

function filterAndRankStudies(studies, patient) {
  const context = buildPatientContext(patient);

  return studies
    .map((study) => ({
      study,
      score: scoreStudyForPatient(study, context),
    }))
    .filter((item) => item.score != null)
    .sort((left, right) => right.score - left.score || String(left.study.protocolSection?.identificationModule?.nctId ?? "").localeCompare(String(right.study.protocolSection?.identificationModule?.nctId ?? "")));
}

function collectConditionTermsWithFallback(patient) {
  const terms = collectConditionTerms(patient);
  if (terms.length > 0) return terms;
  const fallbacks = createTermCollector();
  fallbacks.addAll(patient.symptoms?.current);
  fallbacks.add((patient.comorbidities ?? [])[0]?.condition);
  fallbacks.add((patient.familyHistory ?? [])[0]?.condition);
  return fallbacks.toArray();
}

function buildParamsFromPatient(patient, pageSize = 100) {
  const params = new URLSearchParams();
  const conditionTerms = collectConditionTermsWithFallback(patient);
  const advancedFilter = buildAdvancedFilter(patient);
  const primaryDiagnosis = getPrimaryDiagnosis(patient);

  // Condition — require at least one term so the API returns meaningful results
  if (conditionTerms.length > 0) {
    params.set(
      "query.cond",
      joinQueryTerms(primaryDiagnosis ? [primaryDiagnosis] : conditionTerms),
    );
  }

  // Interventions — prefer current drugs and exclude ones with adverse effects.
  const failedDrugs = new Set(
    (patient.previousMedications ?? [])
      .filter((m) => m.discontinuedReason === "adverse effects")
      .map((m) => m.name?.toLowerCase())
      .filter(Boolean),
  );
  const currentDrugs = (patient.currentMedications ?? [])
    .map((m) => m.name)
    .filter(Boolean)
    .filter((name) => !failedDrugs.has(name.toLowerCase()));

  // Only look for active trials
  params.set("filter.overallStatus", "RECRUITING,NOT_YET_RECRUITING");

  if (advancedFilter) {
    params.set("filter.advanced", advancedFilter);
  }

  const travelDistance = normalizeTravelDistance(
    patient.trialPreferences?.maxTravelDistance ??
      patient.preferences?.logisticalConstraints?.travelDistance,
  );

  // Geo filter — use logistical constraint if coordinates available
  const coordinates = getCoordinates(patient);
  let hasGeoFilter = false;
  if (coordinates) {
    const { lat, lng } = coordinates;
    if (Number.isFinite(lat) && Number.isFinite(lng) && travelDistance) {
      const distance = travelDistance.replace(/\s+/g, "");
      params.set("filter.geo", `distance(${lat},${lng},${distance})`);
      hasGeoFilter = true;
    }
  }

  const locationTerms = getLocationTerms(patient);
  if (!hasGeoFilter && locationTerms.length > 0) {
    params.set("query.locn", locationTerms.join(" "));
  }

  params.set("pageSize", String(pageSize));
  params.set("fields", REQUIRED_FIELDS);
  params.set("countTotal", "true");

  return params;
}

function mapStudy(study) {
  const p = study.protocolSection;
  const id = p?.identificationModule;
  const status = p?.statusModule;
  const sponsor = p?.sponsorCollaboratorsModule;
  const design = p?.designModule;
  const locations = p?.contactsLocationsModule?.locations ?? [];

  const location = locations.find((l) => l.city) ?? {};
  const locationStr =
    location.city && location.state
      ? `${location.city}, ${location.state}`
      : (location.city ?? null);

  return {
    title: id?.briefTitle ?? null,
    description: p?.descriptionModule?.briefSummary ?? null,
    status: status?.overallStatus ?? null,
    location: locationStr,
    sponsor: sponsor?.leadSponsor?.name ?? null,
    phase:
      design?.phases
        ?.map((p) => (p === "NA" ? null : p))
        .filter(Boolean)
        .join(", ") ?? null,
    participants: design?.enrollmentInfo?.count ?? null,
    startDate: status?.startDateStruct?.date ?? null,
  };
}

function getRequestBody(event) {
  if (!event) {
    return {};
  }
  if (typeof event.body === "string") {
    return event.body.trim() ? JSON.parse(event.body) : {};
  }
  if (event.body && typeof event.body === "object") {
    return event.body;
  }
  // Non-API-Gateway invocations may pass the payload directly as event.
  return event;
}

function normalizePaginationInput(value, name) {
  if (value == null || value === "") {
    return null;
  }
  const parsed = Number(value);
  if (Number.isNaN(parsed) || parsed < 1 || parsed > 1000) {
    throw new Error(`${name} must be between 1 and 1000`);
  }
  return String(parsed);
}

export const handler = async (event) => {
  try {
    const body = getRequestBody(event);
    const query = event?.queryStringParameters ?? {};
    const patient = body.patient ?? null;
    const uuid = body.uuid ?? null;
    const started_at = new Date().toISOString();
    const requestedPageSize = normalizePaginationInput(
      body.pageSize ?? query.pageSize,
      "pageSize",
    );
    const requestedPageToken = body.pageToken ?? query.pageToken ?? null;
    const responsePageSize = Number(requestedPageSize ?? 10);
    const candidatePageSize = patient
      ? Math.min(Math.max(responsePageSize * 10, 50), 100)
      : responsePageSize;

    // Accept either a raw params object or a patient profile
    const search = patient
      ? buildParamsFromPatient(patient, candidatePageSize)
      : (() => {
          const s = new URLSearchParams();
          const VALID_QUERY_PARAMS = new Set([
            "query.cond",
            "query.intr",
            "query.titles",
            "query.outc",
            "query.spons",
            "query.lead",
            "query.id",
            "query.locn",
            "query.term",
            "filter.overallStatus",
            "filter.geo",
            "filter.ids",
            "filter.advanced",
            "sort",
            "pageSize",
            "pageToken",
            "countTotal",
          ]);
          for (const [key, value] of Object.entries(body.params ?? {})) {
            if (!VALID_QUERY_PARAMS.has(key)) {
              throw new Error(`Invalid query parameter: "${key}"`);
            }
            if (key === "filter.overallStatus") {
              for (const status of value.split(",").map((s) => s.trim())) {
                if (!VALID_STATUSES.has(status)) {
                  throw new Error(`Invalid overallStatus value: "${status}"`);
                }
              }
            }
            if (key === "pageSize") {
              normalizePaginationInput(value, "pageSize");
            }
            s.set(key, String(value));
          }
          s.set("fields", REQUIRED_FIELDS);
          s.set("countTotal", "true");
          return s;
        })();

    if (!patient && requestedPageSize) {
      search.set("pageSize", requestedPageSize);
    }
    if (requestedPageToken) {
      search.set("pageToken", String(requestedPageToken));
    }

    const url = `${BASE_URL}/studies?${search.toString()}`;

    if (patient) {
      const cond = search.get("query.cond");
      console.log(
        "[trialsapi] patient search query.cond=%s pageSize=%s",
        cond ?? "(none)",
        search.get("pageSize"),
      );
    }

    // ── Cache lookup ──────────────────────────────────────────
    const cacheKey = Buffer.from(search.toString()).toString("base64");
    const cached = await getCached(cacheKey);
    let data;

    if (cached) {
      console.log(`Cache HIT (${cached.source})`);
      data = cached.data;
    } else {
      console.log("Cache MISS — fetching from ClinicalTrials.gov...");
      const res = await fetch(url, {
        method: "GET",
        headers: { Accept: "application/json" },
      });

      if (!res.ok) {
        const errorBody = await res.text();
        throw new Error(`ClinicalTrials API error ${res.status}: ${errorBody}`);
      }

      data = await res.json();
      await setCached(cacheKey, data);
    }

    const rawCount = data.studies?.length ?? 0;
    const skipFilter = patient && rawCount < 10;
    const filteredStudies = patient && !skipFilter
      ? filterAndRankStudies(data.studies ?? [], patient)
      : (data.studies ?? []).map((study) => ({ study }));
    if (patient && rawCount > 0) {
      console.log(
        "[trialsapi] studies raw=%d after filter/rank=%d%s",
        rawCount,
        filteredStudies.length,
        skipFilter ? " (filter skipped, raw < 10)" : "",
      );
    }
    // ─────────────────────────────────────────────────────────
    const studies = filteredStudies
      .slice(0, responsePageSize)
      .map((item) => mapStudy(item.study));
    const hasMore = patient
      ? filteredStudies.length > responsePageSize || Boolean(data.nextPageToken)
      : Boolean(data.nextPageToken);
    const total = patient ? filteredStudies.length : (data.totalCount ?? null);

    if (uuid) {
      await invokePipelineLogger({
        uuid,
        step_name: "trials_search",
        service: "ClinicalTrials.gov",
        model: null,
        started_at,
        completed_at: new Date().toISOString(),
        metadata: JSON.stringify({
          query_cond: search.get("query.cond") ?? null,
          filters: { overallStatus: search.get("filter.overallStatus") ?? null },
          raw_total: data.totalCount ?? rawCount,
          filtered_total: filteredStudies.length,
          cache_hit: Boolean(cached),
        }),
      });
    }

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        total,
        sourceTotal: patient ? (data.totalCount ?? null) : undefined,
        pageSize: responsePageSize,
        hasMore,
        pageToken: data.nextPageToken ?? null,
        studies,
      }),
    };
  } catch (err) {
    console.error("Lambda error:", err);

    const isClientError =
      err.message.startsWith("Invalid") || err.message.startsWith("pageSize");

    return {
      statusCode: isClientError ? 400 : 502,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: err.message }),
    };
  }
};
