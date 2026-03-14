const medicaltodbUrl =
  process.env.MEDICALTODB_API_URL ??
  (process.env.NEXT_PUBLIC_CHAT_API_URL
    ? process.env.NEXT_PUBLIC_CHAT_API_URL.replace(/\/?$/, "") + "/medicaltodb"
    : "");
const medicalApiUrl =
  (process.env.MEDICAL_API_URL ??
    process.env.NEXT_PUBLIC_CHAT_API_URL?.replace(/\/?$/, "")) + "/medical";

/** GET /api/medicaltodb - confirm route exists */
export async function GET() {
  return Response.json(
    {
      ok: true,
      message:
        "POST with { text, operations } to run medical API and store via API Gateway /medicaltodb.",
    },
    { status: 200, headers: { "Access-Control-Allow-Origin": "*" } }
  );
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  if (!body || typeof body.text !== "string" || !Array.isArray(body.operations)) {
    return Response.json(
      { error: "Body must include text (string) and operations (array)" },
      { status: 400 }
    );
  }

  const headers = { "Access-Control-Allow-Origin": "*" as const };

  const medicalRes = await fetch(medicalApiUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const result = await medicalRes.json().catch(() => ({}));
  if (!medicalRes.ok) {
    return Response.json(
      {
        error: "Upstream medical API error",
        status: medicalRes.status,
        details: result,
      },
      { status: medicalRes.status, headers }
    );
  }

  if (!medicaltodbUrl) {
    return Response.json(
      { error: "MEDICALTODB_API_URL or NEXT_PUBLIC_CHAT_API_URL is not configured" },
      { status: 500, headers }
    );
  }

  const id = crypto.randomUUID();
  const storeRes = await fetch(medicaltodbUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      input: body,
      uuid: id,
      result,
    }),
  });

  const data = await storeRes.json().catch(() => ({}));
  if (!storeRes.ok) {
    return Response.json(
      data?.error ? data : { error: "Failed to store via medicaltodb", status: storeRes.status },
      { status: storeRes.status, headers }
    );
  }

  return Response.json(data, { status: 200, headers });
}
