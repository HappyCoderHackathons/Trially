import { DynamoDBClient, DeleteItemCommand, PutItemCommand } from "@aws-sdk/client-dynamodb";

const TABLE_NAME = process.env.TRIALS_STAR_TABLE ?? "trially-starred-trials";
const dynamo = new DynamoDBClient({ region: process.env.AWS_REGION ?? "us-east-1" });

function getUserIdFromAuthHeader(authHeader?: string): string | null {
  if (!authHeader?.startsWith("Bearer ")) return null;
  const token = authHeader.slice(7);
  const parts = token.split(".");
  if (parts.length < 2) return null;

  try {
    const payload = JSON.parse(
      atob(parts[1].replace(/-/g, "+").replace(/_/g, "/")),
    ) as { sub?: string };
    return typeof payload.sub === "string" ? payload.sub : null;
  } catch {
    return null;
  }
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
  });
}

export async function POST(request: Request) {
  const userId = getUserIdFromAuthHeader(request.headers.get("authorization") ?? undefined);
  if (!userId) return jsonResponse({ error: "Unauthorized" }, 401);

  const body = await request.json().catch(() => null);
  if (!body || typeof body.trialId !== "string") {
    return jsonResponse({ error: "Missing trialId" }, 400);
  }

  const item: Record<string, any> = {
    userId: { S: userId },
    trialId: { S: body.trialId },
    createdAt: { S: new Date().toISOString() },
  };

  if (body.trial) {
    item.trial = { S: JSON.stringify(body.trial) };
  }

  try {
    await dynamo.send(
      new PutItemCommand({
        TableName: TABLE_NAME,
        Item: item,
      }),
    );
  } catch (err) {
    console.error("Failed to store starred trial:", err);
    return jsonResponse({ error: "Failed to store starred trial" }, 500);
  }

  return jsonResponse({ ok: true });
}

export async function DELETE(request: Request) {
  const userId = getUserIdFromAuthHeader(request.headers.get("authorization") ?? undefined);
  if (!userId) return jsonResponse({ error: "Unauthorized" }, 401);

  const body = await request.json().catch(() => null);
  if (!body || typeof body.trialId !== "string") {
    return jsonResponse({ error: "Missing trialId" }, 400);
  }

  try {
    await dynamo.send(
      new DeleteItemCommand({
        TableName: TABLE_NAME,
        Key: {
          userId: { S: userId },
          trialId: { S: body.trialId },
        },
      }),
    );
  } catch (err) {
    console.error("Failed to delete starred trial:", err);
    return jsonResponse({ error: "Failed to delete starred trial" }, 500);
  }

  return jsonResponse({ ok: true });
}
