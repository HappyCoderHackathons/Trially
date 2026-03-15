import { NextRequest } from "next/server";

const apiBase = process.env.NEXT_PUBLIC_CHAT_API_URL?.replace(/\/?$/, "") ?? "";
const profileUpdateUrl =
  process.env.PATIENT_PROFILE_UPDATE_API_URL?.trim() ||
  (apiBase ? `${apiBase}/patient-profile/update` : "");

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

/** PUT /api/patient-profile/update - update the patient profile for a record */
export async function PUT(request: NextRequest) {
  const authHeader = request.headers.get("Authorization");
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!token) {
    return Response.json({ error: "Missing Authorization header" }, { status: 401, headers });
  }

  const userId = decodeJwtSub(token);
  if (!userId) {
    return Response.json({ error: "Invalid token: could not extract userId" }, { status: 401, headers });
  }

  const body = await request.json().catch(() => null);
  const id = body?.id != null ? String(body.id).trim() : null;
  const patient = body?.patient;

  if (!id || patient == null) {
    return Response.json({ error: "Body must include id and patient" }, { status: 400, headers });
  }

  if (!profileUpdateUrl) {
    return Response.json(
      { error: "Patient profile update not configured: set PATIENT_PROFILE_UPDATE_API_URL" },
      { status: 500, headers }
    );
  }

  const res = await fetch(profileUpdateUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id, patient }),
  });
  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    return Response.json(
      data?.error ? data : { error: "Failed to update profile", status: res.status },
      { status: res.status, headers }
    );
  }

  return Response.json(data, { status: 200, headers });
}
