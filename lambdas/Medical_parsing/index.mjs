import {
  ComprehendMedicalClient,
  DetectEntitiesV2Command,
  DetectPHICommand,
  InferICD10CMCommand,
  InferRxNormCommand,
  InferSNOMEDCTCommand,
} from "@aws-sdk/client-comprehendmedical";

// ── Client (reused across warm Lambda invocations) ────────────────────────────
const client = new ComprehendMedicalClient({
  region: process.env.AWS_REGION ?? "us-east-1",
});

// ─────────────────────────────────────────────────────────────────────────────
//  HELPERS
// ─────────────────────────────────────────────────────────────────────────────

const roundScore = (score = 0) => Math.round(score * 10_000) / 10_000;

const formatTraits = (traits = []) => traits.map((t) => t.Name);

const formatAttributes = (attributes = []) =>
  attributes.map((attr) => ({
    type:  attr.Type,
    text:  attr.Text,
    score: roundScore(attr.Score),
  }));

const buildResponse = (statusCode, body) => ({
  statusCode,
  headers: {
    "Content-Type":                "application/json",
    "Access-Control-Allow-Origin": "*",
  },
  body: JSON.stringify(body, null, 2),
});

// ─────────────────────────────────────────────────────────────────────────────
//  VALIDATORS
// ─────────────────────────────────────────────────────────────────────────────

const MAX_TEXT_LENGTH = 20_000;

const VALID_OPERATIONS = new Set([
  "detect_entities",
  "detect_phi",
  "infer_icd10",
  "infer_rx_norm",
  "infer_snomed",
]);

function extractAndValidate(event) {
  // Handle API Gateway proxy integration
  let body = event;
  if (typeof event.body === "string") {
    try {
      body = JSON.parse(event.body);
    } catch {
      throw { message: "Invalid JSON in request body.", statusCode: 400 };
    }
  } else if (event.body && typeof event.body === "object") {
    body = event.body;
  }

  const { text, operations } = body;

  // Validate text
  if (!text || typeof text !== "string" || text.trim().length === 0) {
    throw {
      message:    "Missing or invalid 'text' field. Must be a non-empty string.",
      statusCode: 400,
    };
  }

  if (text.length > MAX_TEXT_LENGTH) {
    throw {
      message:    `Text length (${text.length}) exceeds the maximum of ${MAX_TEXT_LENGTH} characters.`,
      statusCode: 413,
    };
  }

  // Validate operations
  const requestedOps = Array.isArray(operations)
    ? operations
    : ["detect_entities"];

  const invalidOps = requestedOps.filter((op) => !VALID_OPERATIONS.has(op));
  if (invalidOps.length > 0) {
    throw {
      message:    `Invalid operations: [${invalidOps.join(", ")}]. Valid options: [${[...VALID_OPERATIONS].join(", ")}]`,
      statusCode: 400,
    };
  }

  return { text: text.trim(), operations: requestedOps };
}

// ─────────────────────────────────────────────────────────────────────────────
//  COMPREHEND MEDICAL OPERATIONS
// ─────────────────────────────────────────────────────────────────────────────

async function detectMedicalEntities(text) {
  const response = await client.send(new DetectEntitiesV2Command({ Text: text }));

  const grouped = {};
  for (const entity of response.Entities ?? []) {
    const category = entity.Category ?? "UNKNOWN";
    grouped[category] ??= [];
    grouped[category].push({
      text:       entity.Text,
      type:       entity.Type,
      score:      roundScore(entity.Score),
      begin:      entity.BeginOffset,
      end:        entity.EndOffset,
      traits:     formatTraits(entity.Traits),
      attributes: formatAttributes(entity.Attributes),
    });
  }

  return {
    categories:          grouped,
    total_entities:      response.Entities?.length ?? 0,
    model_version:       response.ModelVersion,
    unmapped_attributes: response.UnmappedAttributes ?? [],
  };
}

async function detectPHI(text) {
  const response = await client.send(new DetectPHICommand({ Text: text }));

  const phiEntities = (response.Entities ?? []).map((entity) => ({
    text:     entity.Text,
    type:     entity.Type,
    category: entity.Category,
    score:    roundScore(entity.Score),
    begin:    entity.BeginOffset,
    end:      entity.EndOffset,
  }));

  return {
    phi_entities:  phiEntities,
    total_phi:     phiEntities.length,
    model_version: response.ModelVersion,
  };
}

async function inferICD10CM(text) {
  const response = await client.send(new InferICD10CMCommand({ Text: text }));

  const entities = (response.Entities ?? []).map((entity) => ({
    text:        entity.Text,
    category:    entity.Category,
    type:        entity.Type,
    score:       roundScore(entity.Score),
    traits:      formatTraits(entity.Traits),
    icd10_codes: (entity.ICD10CMConcepts ?? []).map((concept) => ({
      code:        concept.Code,
      description: concept.Description,
      score:       roundScore(concept.Score),
    })),
  }));

  return {
    entities,
    total:         entities.length,
    model_version: response.ModelVersion,
  };
}

async function inferRxNorm(text) {
  const response = await client.send(new InferRxNormCommand({ Text: text }));

  const medications = (response.Entities ?? []).map((entity) => ({
    text:       entity.Text,
    category:   entity.Category,
    type:       entity.Type,
    score:      roundScore(entity.Score),
    attributes: formatAttributes(entity.Attributes),
    rx_codes:   (entity.RxNormConcepts ?? []).map((concept) => ({
      code:        concept.Code,
      description: concept.Description,
      score:       roundScore(concept.Score),
    })),
  }));

  return {
    medications,
    total:         medications.length,
    model_version: response.ModelVersion,
  };
}

async function inferSNOMEDCT(text) {
  const response = await client.send(new InferSNOMEDCTCommand({ Text: text }));

  const entities = (response.Entities ?? []).map((entity) => ({
    text:         entity.Text,
    category:     entity.Category,
    type:         entity.Type,
    score:        roundScore(entity.Score),
    traits:       formatTraits(entity.Traits),
    snomed_codes: (entity.SNOMEDCTConcepts ?? []).map((concept) => ({
      code:        concept.Code,
      description: concept.Description,
      score:       roundScore(concept.Score),
    })),
  }));

  return {
    entities,
    total:          entities.length,
    model_version:  response.ModelVersion,
    snomed_details: response.SNOMEDCTDetails ?? {},
  };
}

// ── Maps operation name → { function, result key } ───────────────────────────
const OPERATIONS = {
  detect_entities: { fn: detectMedicalEntities, key: "medical_entities" },
  detect_phi:      { fn: detectPHI,             key: "phi_data"         },
  infer_icd10:     { fn: inferICD10CM,          key: "icd10_codes"      },
  infer_rx_norm:   { fn: inferRxNorm,           key: "rx_norm"          },
  infer_snomed:    { fn: inferSNOMEDCT,         key: "snomed_ct"        },
};

// ─────────────────────────────────────────────────────────────────────────────
//  LAMBDA HANDLER
// ─────────────────────────────────────────────────────────────────────────────

export const handler = async (event) => {
  console.info("Event received:", JSON.stringify(event, null, 2));

  try {
    // ── 1. Validate input ──────────────────────────────────────────────────
    const { text, operations } = extractAndValidate(event);

    console.info(`Text length: ${text.length} | Operations: [${operations.join(", ")}]`);

    // ── 2. Run all operations in parallel ──────────────────────────────────
    const settled = await Promise.allSettled(
      operations.map(async (op) => {
        const { fn, key } = OPERATIONS[op];
        const result = await fn(text);
        return { key, result };
      })
    );

    // ── 3. Separate successes and failures ─────────────────────────────────
    const results = {};
    const errors  = {};

    settled.forEach((outcome, index) => {
      const op = operations[index];
      const { key } = OPERATIONS[op];

      if (outcome.status === "fulfilled") {
        results[key] = outcome.value.result;
      } else {
        console.error(`Operation '${op}' failed:`, outcome.reason);
        errors[key] = outcome.reason?.message ?? "Unknown error";
      }
    });

    // ── 4. Return response ─────────────────────────────────────────────────
    const hasErrors  = Object.keys(errors).length > 0;
    const hasResults = Object.keys(results).length > 0;

    return buildResponse(hasErrors && !hasResults ? 500 : 200, {
      status:     !hasErrors ? "success" : hasResults ? "partial" : "error",
      input_text: text,
      results,
      ...(hasErrors && { errors }),
    });

  } catch (error) {
    // Thrown validation errors have a statusCode attached
    if (error.statusCode) {
      console.warn("Validation error:", error.message);
      return buildResponse(error.statusCode, {
        status:  "error",
        message: error.message,
      });
    }

    // Comprehend Medical native size error
    if (error.name === "TextSizeLimitExceededException") {
      return buildResponse(413, {
        status:  "error",
        message: "Text exceeds the maximum allowed size of 20,000 characters.",
      });
    }

    console.error("Unexpected error:", error);
    const errMessage = error?.message ?? String(error);
    return buildResponse(500, {
      status:  "error",
      message: "Internal server error.",
      details: errMessage,
    });
  }
};