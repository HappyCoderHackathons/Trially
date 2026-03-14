import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand, PutCommand } from "@aws-sdk/lib-dynamodb";

const client = new DynamoDBClient({ region: "us-east-1" });
const docClient = DynamoDBDocumentClient.from(client);

const TABLE_NAME = "ClinicalTrialsCache";
const CACHE_TTL_HOURS = 24;

// --- Condition normalization ---

const CONDITION_ALIASES = {
  "t2d": "type_2_diabetes",
  "diabetes type 2": "type_2_diabetes",
  "type 2 diabetes": "type_2_diabetes",
  "breast ca": "breast_cancer",
  "breast carcinoma": "breast_cancer",
};

function normalizeCondition(condition) {
  const lower = condition.trim().toLowerCase();
  return CONDITION_ALIASES[lower] ?? lower.replace(/\s+/g, "_");
}

// --- DynamoDB helpers ---

async function getCached(cacheKey) {
  const result = await docClient.send(
    new GetCommand({
      TableName: TABLE_NAME,
      Key: { condition: cacheKey },
    })
  );
  return result.Item ?? null;
}

async function setCached(cacheKey, originalQuery, data) {
  const ttl = Math.floor(Date.now() / 1000) + CACHE_TTL_HOURS * 3600;

  await docClient.send(
    new PutCommand({
      TableName: TABLE_NAME,
      Item: {
        condition: cacheKey,
        original_query: originalQuery,
        data: JSON.stringify(data),
        cached_at: new Date().toISOString(),
        ttl,
      },
    })
  );
}

// --- ClinicalTrials.gov API ---

async function fetchFromAPI(condition) {
  const url = new URL("https://clinicaltrials.gov/api/v2/studies");
  url.searchParams.set("query.cond", condition);
  url.searchParams.set("pageSize", "20");
  url.searchParams.set("format", "json");

  const response = await fetch(url.toString());
  if (!response.ok) {
    throw new Error(`ClinicalTrials API error: ${response.status} ${response.statusText}`);
  }
  return response.json();
}

// --- Main cache-aside function ---

export async function getClinicalTrials(condition) {
  const cacheKey = normalizeCondition(condition);

  // 1. Check cache
  const cached = await getCached(cacheKey);
  if (cached) {
    console.log(`Cache HIT for: "${condition}" (key: ${cacheKey})`);
    return {
      source: "cache",
      cached_at: cached.cached_at,
      data: JSON.parse(cached.data),
    };
  }

  // 2. Cache miss — call the API
  console.log(`Cache MISS for: "${condition}" — fetching from API...`);
  const data = await fetchFromAPI(condition);

  // 3. Store result in DynamoDB
  await setCached(cacheKey, condition, data);
  console.log(`Cached result for: "${condition}" (TTL: ${CACHE_TTL_HOURS}h)`);

  return {
    source: "api",
    cached_at: new Date().toISOString(),
    data,
  };
}