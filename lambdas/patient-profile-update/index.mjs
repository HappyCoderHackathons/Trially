import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, UpdateCommand } from "@aws-sdk/lib-dynamodb";

const TABLE_NAME = process.env.MEDICAL_RESULTS_TABLE ?? "trially-medical-results";
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

function parseBody(event) {
  if (!event) return null;
  if (event.id != null && event.patient != null) return event;
  if (!event.body) return null;
  if (typeof event.body === "string") {
    try { return event.body.trim() ? JSON.parse(event.body) : null; } catch { return null; }
  }
  return event.body;
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

  const body = parseBody(event);
  if (!body?.id || body?.patient == null) {
    return response(400, { error: "Body must include id and patient" });
  }

  const { id, patient } = body;
  const patientStr = typeof patient === "string" ? patient : JSON.stringify(patient);

  try {
    await dynamo.send(
      new UpdateCommand({
        TableName: TABLE_NAME,
        Key: { id: String(id) },
        UpdateExpression: "SET patient = :p, updatedAt = :t",
        ExpressionAttributeValues: {
          ":p": patientStr,
          ":t": new Date().toISOString(),
        },
      })
    );

    return response(200, { id, updated: true });
  } catch (err) {
    console.error("DynamoDB update error:", err);
    return response(500, { error: "Failed to update profile", details: String(err) });
  }
};
