import { DynamoDBClient, GetItemCommand } from "@aws-sdk/client-dynamodb";

const TABLE_NAME = process.env.MEDICAL_RESULTS_TABLE ?? "trially-medical-results";
const dynamo = new DynamoDBClient({ region: process.env.AWS_REGION ?? "us-east-1" });

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Content-Type": "application/json",
};

function response(statusCode, body) {
  return {
    statusCode,
    headers: corsHeaders,
    body: JSON.stringify(body),
  };
}

function getUuid(event) {
  const pathId = event?.pathParameters?.id ?? event?.pathParameters?.uuid;
  if (pathId) return pathId;
  let body = event?.body;
  if (typeof body === "string") {
    try {
      body = body.trim() ? JSON.parse(body) : null;
    } catch {
      return null;
    }
  }
  const uuid = body?.uuid ?? body?.id ?? event?.uuid ?? event?.id;
  return uuid != null ? String(uuid).trim() : null;
}

export const handler = async (event) => {
  const method = (event?.httpMethod ?? event?.requestContext?.http?.method ?? "").toUpperCase();

  if (method === "OPTIONS") {
    return {
      statusCode: 200,
      headers: {
        ...corsHeaders,
        "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type,Authorization",
        "Access-Control-Max-Age": "0",
      },
      body: "",
    };
  }

  const uuid = getUuid(event);
  if (!uuid) {
    return response(400, { error: "Missing uuid (path parameter :id or body { uuid })" });
  }

  try {
    const res = await dynamo.send(
      new GetItemCommand({
        TableName: TABLE_NAME,
        Key: { id: { S: uuid } },
      })
    );
    const raw = res.Item;
    if (!raw) {
      return response(404, { error: "Record not found", uuid });
    }

    const item = {
      id: raw.id?.S ?? uuid,
      createdAt: raw.createdAt?.S ?? null,
      input: raw.input?.S ?? null,
      result: raw.result?.S ?? null,
      patient: null,
    };
    if (raw.patient?.S) {
      try {
        item.patient = JSON.parse(raw.patient.S);
      } catch {
        item.patient = null;
      }
    }

    return response(200, item);
  } catch (err) {
    console.error("DynamoDB get error:", err);
    return response(500, { error: "Failed to get record", details: String(err) });
  }
};
