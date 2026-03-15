import { NextRequest } from "next/server";

const apiBase = process.env.NEXT_PUBLIC_CHAT_API_URL?.replace(/\/?$/, "") ?? "";
const starredTrialsUrl =
  process.env.STARRED_TRIALS_API_URL?.trim() || (apiBase ? `${apiBase}/starred-trials` : "");

function decodeJwtSub(token: string): string | null {
  try {
    const payload = token.split(".")[1];
    const decoded = JSON.parse(Buffer.from(payload, "base64url").toString("utf-8"));
    return decoded.sub ?? null;
  } catch {
    return null;
  }
}

const headers = { "Access-Control-Allow-Origin": "*" as const };

/** GET /api/trials/starred — fetch all starred trials for the logged-in user */
export async function GET(request: NextRequest) {
  const auth = request.headers.get("Authorization");
  const token = auth?.startsWith("Bearer ") ? auth.slice(7) : null;
  const userId = token ? decodeJwtSub(token) : null;

  if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401, headers });
  if (!starredTrialsUrl) return Response.json({ error: "STARRED_TRIALS_API_URL not configured" }, { status: 500, headers });

  const url = new URL(starredTrialsUrl);
  url.searchParams.set("userId", userId);

  const res = await fetch(url.toString(), {
    method: "GET",
    headers: { "Content-Type": "application/json" },
  });
  const data = await res.json().catch(() => ({}));
  return Response.json(data, { status: res.status, headers });
}
