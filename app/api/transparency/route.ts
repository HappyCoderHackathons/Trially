import { DynamoDBClient, QueryCommand } from "@aws-sdk/client-dynamodb";

const TABLE_NAME = process.env.PIPELINE_STEPS_TABLE ?? "trially-pipeline-steps";
const dynamo = new DynamoDBClient({ region: process.env.AWS_REGION ?? "us-east-1" });

const STEP_ORDER = ["medical_parsing", "connect_llm", "trials_search", "show_result"];

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const uuid = searchParams.get("uuid");

  if (!uuid) {
    return Response.json({ error: "Missing uuid query parameter" }, { status: 400 });
  }

  try {
    const result = await dynamo.send(new QueryCommand({
      TableName: TABLE_NAME,
      KeyConditionExpression: "uuid = :uuid",
      ExpressionAttributeValues: { ":uuid": { S: uuid } },
    }));

    const items = result.Items ?? [];
    if (items.length === 0) {
      return Response.json({ error: "No pipeline data found for this session" }, { status: 404 });
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

    return Response.json({ uuid, steps });
  } catch (err) {
    console.error("[transparency] DynamoDB error:", err);
    return Response.json({ error: "Failed to load pipeline data" }, { status: 500 });
  }
}
