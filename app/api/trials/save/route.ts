const apiBase = process.env.NEXT_PUBLIC_CHAT_API_URL?.replace(/\/?$/, "") ?? "";
const starredTrialsUrl = process.env.STARRED_TRIALS_API_URL?.trim() || (apiBase ? `${apiBase}/starred-trials` : "");

function decodeJwtSub(token: string): string | null {
  try {
    const payload = token.split(".")[1];
    const decoded = JSON.parse(Buffer.from(payload, "base64url").toString("utf-8"));
    return decoded.sub ?? null;
  } catch {
    return null;
  }
}

function jsonResponse(body: unknown, status = 200) {
  return Response.json(body, {
    status,
    headers: { "Access-Control-Allow-Origin": "*" },
  });
}

function getUserId(request: Request): string | null {
  const auth = request.headers.get("Authorization");
  const token = auth?.startsWith("Bearer ") ? auth.slice(7) : null;
  return token ? decodeJwtSub(token) : null;
}

export async function POST(request: Request) {
  const userId = getUserId(request);
  if (!userId) return jsonResponse({ error: "Unauthorized" }, 401);

  if (!starredTrialsUrl) return jsonResponse({ error: "STARRED_TRIALS_API_URL not configured" }, 500);

  const body = await request.json().catch(() => null);
  if (!body || typeof body.trialId !== "string") return jsonResponse({ error: "Missing trialId" }, 400);

  const res = await fetch(starredTrialsUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userId, trialId: body.trialId, trial: body.trial }),
  });
  const data = await res.json().catch(() => ({}));
  return jsonResponse(data, res.status);
}

export async function DELETE(request: Request) {
  const userId = getUserId(request);
  if (!userId) return jsonResponse({ error: "Unauthorized" }, 401);

  if (!starredTrialsUrl) return jsonResponse({ error: "STARRED_TRIALS_API_URL not configured" }, 500);

  const body = await request.json().catch(() => null);
  if (!body || typeof body.trialId !== "string") return jsonResponse({ error: "Missing trialId" }, 400);

  const res = await fetch(starredTrialsUrl, {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userId, trialId: body.trialId }),
  });
  const data = await res.json().catch(() => ({}));
  return jsonResponse(data, res.status);
}
