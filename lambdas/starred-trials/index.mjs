import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand, DeleteCommand, QueryCommand } from "@aws-sdk/lib-dynamodb";

const TABLE_NAME = process.env.STARRED_TRIALS_TABLE ?? "trially-starred-trials";
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
  if (event.userId != null) return event;
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
        "Access-Control-Allow-Methods": "GET,POST,DELETE,OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type,Authorization",
        "Access-Control-Max-Age": "0",
      },
      body: "",
    };
  }

  const body = parseBody(event);

  // GET — list starred trials for a user
  if (method === "GET") {
    const userId = event?.queryStringParameters?.userId ?? body?.userId;
    if (!userId) return response(400, { error: "Missing userId" });
    try {
      const res = await dynamo.send(
        new QueryCommand({
          TableName: TABLE_NAME,
          KeyConditionExpression: "userId = :uid",
          ExpressionAttributeValues: { ":uid": String(userId) },
        })
      );
      return response(200, { items: res.Items ?? [] });
    } catch (err) {
      console.error("DynamoDB query error:", err);
      return response(500, { error: "Failed to list starred trials", details: String(err) });
    }
  }

  // POST — star a trial
  if (method === "POST") {
    if (!body?.userId || !body?.trialId) {
      return response(400, { error: "Body must include userId and trialId" });
    }
    const item = {
      userId: String(body.userId),
      trialId: String(body.trialId),
      createdAt: new Date().toISOString(),
      ...(body.trial != null && { trial: typeof body.trial === "string" ? body.trial : JSON.stringify(body.trial) }),
    };
    try {
      await dynamo.send(new PutCommand({ TableName: TABLE_NAME, Item: item }));
      return response(200, { ok: true });
    } catch (err) {
      console.error("DynamoDB put error:", err);
      return response(500, { error: "Failed to star trial", details: String(err) });
    }
  }

  // DELETE — unstar a trial
  if (method === "DELETE") {
    if (!body?.userId || !body?.trialId) {
      return response(400, { error: "Body must include userId and trialId" });
    }
    try {
      await dynamo.send(
        new DeleteCommand({
          TableName: TABLE_NAME,
          Key: { userId: String(body.userId), trialId: String(body.trialId) },
        })
      );
      return response(200, { ok: true });
    } catch (err) {
      console.error("DynamoDB delete error:", err);
      return response(500, { error: "Failed to unstar trial", details: String(err) });
    }
  }

  return response(405, { error: "Method not allowed" });
};
