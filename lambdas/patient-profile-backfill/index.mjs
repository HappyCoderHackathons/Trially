/**
 * One-time backfill: attaches a userId to existing records in trially-medical-results.
 *
 * Invoke with:
 *   { mappings: [{ id: "uuid-of-record", userId: "cognito-sub" }, ...] }
 *
 * For records created before the userId field was added, you must supply the
 * id → userId mapping out-of-band (e.g. from CloudWatch logs, user reports, etc).
 * New records will have userId written at creation time by the medical-process Lambda.
 */
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

export const handler = async (event) => {
  let body = event?.body ?? event;
  if (typeof body === "string") {
    try { body = JSON.parse(body); } catch { body = null; }
  }

  const mappings = body?.mappings;
  if (!Array.isArray(mappings) || mappings.length === 0) {
    return response(400, { error: "Body must include mappings: [{ id, userId }]" });
  }

  const results = { updated: 0, failed: 0, errors: [] };

  for (const { id, userId } of mappings) {
    if (!id || !userId) {
      results.failed++;
      results.errors.push({ id, userId, error: "Missing id or userId" });
      continue;
    }
    try {
      await dynamo.send(
        new UpdateCommand({
          TableName: TABLE_NAME,
          Key: { id: String(id) },
          UpdateExpression: "SET userId = :uid",
          ConditionExpression: "attribute_exists(id)",
          ExpressionAttributeValues: { ":uid": String(userId) },
        })
      );
      results.updated++;
    } catch (err) {
      results.failed++;
      results.errors.push({ id, userId, error: String(err) });
    }
  }

  return response(200, results);
};
