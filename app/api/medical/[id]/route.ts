import { NextRequest } from "next/server";

const apiBase = process.env.NEXT_PUBLIC_CHAT_API_URL?.replace(/\/?$/, "") ?? "";
const medicalGetUrl =
  process.env.MEDICAL_GET_API_URL?.trim() || (apiBase ? `${apiBase}/medical/get` : "");

const headers = { "Access-Control-Allow-Origin": "*" as const };

/** GET /api/medical/[id] - fetch stored medical record by uuid (for inspection). */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const uuid = id?.trim();
  if (!uuid) {
    return Response.json({ error: "Missing id" }, { status: 400, headers });
  }

  if (!medicalGetUrl) {
    return Response.json(
      { error: "Medical get not configured" },
      { status: 500, headers }
    );
  }

  const res = await fetch(medicalGetUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ uuid }),
  });
  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    return Response.json(
      data?.error ? data : { error: "Failed to get record", status: res.status },
      { status: res.status, headers }
    );
  }

  return Response.json(data, { status: 200, headers });
}
