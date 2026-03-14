const BASE_URL = "https://clinicaltrials.gov/api/v2";

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
    patient.demographics?.countryOfResidence,
    patient.countryOfResidence,
    patient.demographics?.nationality,
    patient.nationality,
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

function buildParamsFromPatient(patient) {
  const params = new URLSearchParams();

  // Condition
  const primaryDiagnosis = getPrimaryDiagnosis(patient);
  if (primaryDiagnosis) {
    params.set("query.cond", primaryDiagnosis);
  }

  // Interventions — exclude drugs the patient had adverse effects from
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

  if (currentDrugs.length > 0) {
    params.set("query.intr", currentDrugs.join(" OR "));
  }

  // Only look for active trials
  params.set("filter.overallStatus", "RECRUITING,NOT_YET_RECRUITING");

  // Exclude interventions the patient has failed
  if (failedDrugs.size > 0) {
    const exclusions = [...failedDrugs]
      .map((d) => `NOT AREA[InterventionName]${d}`)
      .join(" AND ");
    params.set("filter.advanced", exclusions);
  }

  const travelDistance = normalizeTravelDistance(
    patient.trialPreferences?.maxTravelDistance ??
      patient.preferences?.logisticalConstraints?.travelDistance,
  );

  // Geo filter — use logistical constraint if coordinates available
  const coordinates = getCoordinates(patient);
  if (coordinates) {
    const { lat, lng } = coordinates;
    if (Number.isFinite(lat) && Number.isFinite(lng) && travelDistance) {
      const distance = travelDistance.replace(/\s+/g, "");
      params.set("filter.geo", `distance(${lat},${lng},${distance})`);
    }
  } else {
    const locationTerms = getLocationTerms(patient);
    if (locationTerms.length > 0) {
      params.set("query.locn", locationTerms.join(" "));
    }
  }

  params.set("pageSize", "10");
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
    const requestedPageSize = normalizePaginationInput(
      body.pageSize ?? query.pageSize,
      "pageSize",
    );
    const requestedPageToken = body.pageToken ?? query.pageToken ?? null;

    // Accept either a raw params object or a patient profile
    const search = body.patient
      ? buildParamsFromPatient(body.patient)
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

    if (requestedPageSize) {
      search.set("pageSize", requestedPageSize);
    }
    if (requestedPageToken) {
      search.set("pageToken", String(requestedPageToken));
    }

    const url = `${BASE_URL}/studies?${search.toString()}`;

    const res = await fetch(url, {
      method: "GET",
      headers: { Accept: "application/json" },
    });

    if (!res.ok) {
      const errorBody = await res.text();
      throw new Error(`ClinicalTrials API error ${res.status}: ${errorBody}`);
    }

    const data = await res.json();

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        total: data.totalCount ?? null,
        pageSize: Number(search.get("pageSize") ?? 10),
        hasMore: Boolean(data.nextPageToken),
        pageToken: data.nextPageToken ?? null,
        studies: (data.studies ?? []).map(mapStudy),
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
