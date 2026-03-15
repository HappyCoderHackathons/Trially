import { DynamoDBClient, QueryCommand } from "@aws-sdk/client-dynamodb";

const TABLE_NAME = process.env.PIPELINE_STEPS_TABLE ?? "trially-pipeline-steps";
const dynamo = new DynamoDBClient({ region: process.env.AWS_REGION ?? "us-east-1" });

const STEP_ORDER = ["medical_parsing", "connect_llm", "trials_search", "show_result"];

function getBody(event) {
  if (!event) return {};
  if (typeof event.body === "string") return event.body.trim() ? JSON.parse(event.body) : {};
  if (event.body && typeof event.body === "object") return event.body;
  return event;
}

export const handler = async (event) => {
  const body = getBody(event);
  const uuid = body.uuid ?? event?.queryStringParameters?.uuid ?? null;

  if (!uuid) {
    return {
      statusCode: 400,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: "Missing uuid" }),
    };
  }

  try {
    const result = await dynamo.send(new QueryCommand({
      TableName: TABLE_NAME,
      KeyConditionExpression: "uuid = :uuid",
      ExpressionAttributeValues: { ":uuid": { S: String(uuid) } },
    }));

    const items = result.Items ?? [];
    if (items.length === 0) {
      return {
        statusCode: 404,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ error: "No pipeline data found for this session" }),
      };
    }

    const steps = items
      .map((item) => ({
        step_name:    item.step_name?.S ?? "",
        service:      item.service?.S ?? null,
        model:        item.model?.S ?? null,
        started_at:   item.started_at?.S ?? null,
        completed_at: item.completed_at?.S ?? null,
        metadata:     item.metadata?.S ? JSON.parse(item.metadata.S) : null,
      }))
      .sort((a, b) => {
        const ai = STEP_ORDER.indexOf(a.step_name);
        const bi = STEP_ORDER.indexOf(b.step_name);
        return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
      });

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ uuid, steps }),
    };
  } catch (err) {
    console.error("[pipeline-steps-get] error:", err);
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: "Failed to load pipeline data" }),
    };
  }
};
