import { DynamoDBClient, PutItemCommand } from "@aws-sdk/client-dynamodb";

const TABLE_NAME = process.env.MEDICAL_RESULTS_TABLE ?? "trially-medical-results";
const dynamo = new DynamoDBClient({ region: process.env.AWS_REGION ?? "us-east-1" });

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Content-Type": "application/json",
};

function parseBody(event) {
  if (!event) return null;
  // Direct invocation (e.g. AWS Console test): event is the payload
  if (event.input != null && event.uuid != null && event.result != null) {
    return event;
  }
  // API Gateway: payload is in event.body (string or object)
  if (!event.body) return null;
  if (typeof event.body === "string") {
    try {
      return event.body.trim() ? JSON.parse(event.body) : null;
    } catch {
      return null;
    }
  }
  return event.body;
}

function response(statusCode, body) {
  return {
    statusCode,
    headers: corsHeaders,
    body: JSON.stringify(body),
  };
}

function toStoreValue(value) {
  if (value === null || value === undefined) return "";
  return typeof value === "string" ? value : JSON.stringify(value);
}

export const handler = async (event) => {
  const rawMethod =
    event?.httpMethod ??
    event?.requestContext?.http?.method ??
    event?.requestContext?.httpMethod;
  const method = typeof rawMethod === "string" ? rawMethod.toUpperCase() : "";

  if (method === "OPTIONS") {
    return {
      statusCode: 200,
      headers: {
        ...corsHeaders,
        "Access-Control-Allow-Methods": "POST,OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type,Authorization",
        "Access-Control-Max-Age": "0",
      },
      body: "",
    };
  }

  const body = parseBody(event);
  const hasValidBody = body && body.uuid != null && body.input != null && body.result != null;
  const isPost = method === "POST" || (!method && hasValidBody);

  if (!isPost) {
    return response(405, { error: "Method not allowed" });
  }

  if (!hasValidBody) {
    return response(400, {
      error: "Body must include input, uuid, and result",
    });
  }

  const id = String(body.uuid);
  const now = new Date().toISOString();
  const inputStr = toStoreValue(body.input);
  const resultStr = toStoreValue(body.result);
  const patientStr = body.patient != null ? toStoreValue(body.patient) : "";
  const userId = body.userId != null ? String(body.userId).trim() : "";

  const item = {
    id: { S: id },
    createdAt: { S: now },
    input: { S: inputStr },
    result: { S: resultStr },
  };
  if (patientStr) item.patient = { S: patientStr };
  if (userId) item.userId = { S: userId };

  try {
    await dynamo.send(
      new PutItemCommand({
        TableName: TABLE_NAME,
        Item: item,
      })
    );
  } catch (err) {
    console.error("DynamoDB put error:", err);
    return response(500, { error: "Failed to store result", details: String(err) });
  }

  return response(200, { id, createdAt: now, stored: true, patientStored: Boolean(patientStr), userIdStored: Boolean(userId) });
};
