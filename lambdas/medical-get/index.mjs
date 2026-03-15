import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand } from "@aws-sdk/lib-dynamodb";

const TABLE_NAME = process.env.MEDICAL_RESULTS_TABLE ?? "trially-medical-results";
const dynamo = DynamoDBDocumentClient.from(
  new DynamoDBClient({ region: process.env.AWS_REGION ?? "us-east-1" })
);

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
      new GetCommand({
        TableName: TABLE_NAME,
        Key: { id: uuid },
      })
    );
    const raw = res.Item;
    if (!raw) {
      return response(404, { error: "Record not found", uuid });
    }

    const parseIfString = (v) => {
      if (v == null) return null;
      if (typeof v === "string") {
        try {
          return JSON.parse(v);
        } catch {
          return v;
        }
      }
      return v;
    };

    const item = {
      id: raw.id ?? uuid,
      createdAt: raw.createdAt ?? null,
      input: parseIfString(raw.input) ?? (typeof raw.input === "object" && raw.input !== null ? raw.input : null),
      result: parseIfString(raw.result) ?? (typeof raw.result === "object" && raw.result !== null ? raw.result : null),
      patient: parseIfString(raw.patient) ?? (typeof raw.patient === "object" && raw.patient !== null ? raw.patient : null),
    };

    return response(200, item);
  } catch (err) {
    console.error("DynamoDB get error:", err);
    return response(500, { error: "Failed to get record", details: String(err) });
  }
};
