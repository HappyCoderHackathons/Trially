import { NextRequest } from "next/server";

const apiBase = process.env.NEXT_PUBLIC_CHAT_API_URL?.replace(/\/?$/, "") ?? "";
const profileGetUrl =
  process.env.PATIENT_PROFILE_GET_API_URL?.trim() ||
  (apiBase ? `${apiBase}/patient-profile/get` : "");

const headers = { "Access-Control-Allow-Origin": "*" as const };

function decodeJwtSub(token: string): string | null {
  try {
    const payload = token.split(".")[1];
    const decoded = JSON.parse(Buffer.from(payload, "base64url").toString("utf-8"));
    return decoded.sub ?? null;
  } catch {
    return null;
  }
}

/** GET /api/patient-profile - fetch the logged-in user's patient profile */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("Authorization");
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!token) {
    return Response.json({ error: "Missing Authorization header" }, { status: 401, headers });
  }

  const userId = decodeJwtSub(token);
  if (!userId) {
    return Response.json({ error: "Invalid token: could not extract userId" }, { status: 401, headers });
  }

  if (!profileGetUrl) {
    return Response.json(
      { error: "Patient profile get not configured: set PATIENT_PROFILE_GET_API_URL" },
      { status: 500, headers }
    );
  }

  const res = await fetch(profileGetUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userId }),
  });
  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    return Response.json(
      data?.error ? data : { error: "Failed to get profile", status: res.status },
      { status: res.status, headers }
    );
  }

  return Response.json(data, { status: 200, headers });
}
