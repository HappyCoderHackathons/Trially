import { DynamoDBClient, PutItemCommand } from "@aws-sdk/client-dynamodb";

const TABLE_NAME = process.env.PIPELINE_STEPS_TABLE ?? "trially-pipeline-steps";
const dynamo = new DynamoDBClient({ region: process.env.AWS_REGION ?? "us-east-1" });

export const handler = async (event) => {
  const { uuid, step_name, service, model, started_at, completed_at, metadata } = event ?? {};

  if (!uuid || !step_name) {
    return { ok: false, error: "Missing required fields: uuid, step_name" };
  }

  const ttl = Math.floor(Date.now() / 1000) + 7 * 24 * 3600;

  const item = {
    uuid:         { S: String(uuid) },
    step_name:    { S: String(step_name) },
    ttl:          { N: String(ttl) },
    ...(service      && { service:      { S: String(service) } }),
    ...(model        && { model:        { S: String(model) } }),
    ...(started_at   && { started_at:   { S: String(started_at) } }),
    ...(completed_at && { completed_at: { S: String(completed_at) } }),
    ...(metadata     && { metadata:     { S: typeof metadata === "string" ? metadata : JSON.stringify(metadata) } }),
  };

  try {
    await dynamo.send(new PutItemCommand({ TableName: TABLE_NAME, Item: item }));
    return { ok: true };
  } catch (err) {
    console.error("[pipeline-logger] DynamoDB error:", err);
    return { ok: false, error: String(err) };
  }
};
