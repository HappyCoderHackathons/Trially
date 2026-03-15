import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, QueryCommand } from "@aws-sdk/lib-dynamodb";

const TABLE_NAME = process.env.MEDICAL_RESULTS_TABLE ?? "trially-medical-results";
const USER_ID_INDEX = "userId-index";
const dynamo = DynamoDBDocumentClient.from(
  new DynamoDBClient({ region: process.env.AWS_REGION ?? "us-east-1" })
);

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Content-Type": "application/json",
};

function response(statusCode, body) {
  return { statusCode, headers: corsHeaders, body: JSON.stringify(body) };
}

function getUserId(event) {
  let body = event?.body;
  if (typeof body === "string") {
    try { body = body.trim() ? JSON.parse(body) : null; } catch { return null; }
  }
  const userId = body?.userId ?? event?.userId;
  return userId != null ? String(userId).trim() : null;
}

export const handler = async (event) => {
  const method = (event?.httpMethod ?? event?.requestContext?.http?.method ?? "").toUpperCase();

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

  const userId = getUserId(event);
  if (!userId) {
    return response(400, { error: "Missing userId" });
  }

  try {
    const res = await dynamo.send(
      new QueryCommand({
        TableName: TABLE_NAME,
        IndexName: USER_ID_INDEX,
        KeyConditionExpression: "userId = :uid",
        ExpressionAttributeValues: { ":uid": userId },
        ScanIndexForward: false, // createdAt DESC (GSI sort key)
        Limit: 1,
      })
    );

    if (!res.Items || res.Items.length === 0) {
      return response(404, { error: "No profile found for user" });
    }

    const raw = res.Items[0];
    const parseIfString = (v) => {
      if (v == null) return null;
      if (typeof v === "string") { try { return JSON.parse(v); } catch { return v; } }
      return v;
    };

    const patient = parseIfString(raw.patient);
    if (!patient) {
      return response(404, { error: "Record has no patient profile" });
    }

    return response(200, { id: raw.id, createdAt: raw.createdAt ?? null, patient });
  } catch (err) {
    console.error("DynamoDB query error:", err);
    return response(500, { error: "Failed to get profile", details: String(err) });
  }
};
