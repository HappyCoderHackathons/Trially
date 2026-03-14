import { connectLlm, getConnectLlmUrl } from "@/lib/connect_llm";

const apiBase = process.env.NEXT_PUBLIC_CHAT_API_URL?.replace(/\/?$/, "") ?? "";
const medicalApiUrl =
  (process.env.MEDICAL_API_URL ?? apiBase) + (process.env.MEDICAL_API_URL ? "" : "/medical");
const medicalProcessUrl =
  process.env.MEDICAL_PROCESS_API_URL ?? (apiBase ? apiBase + "/medicaltodb" : "");

/** GET /api/medical - confirm route exists */
export async function GET() {
  return Response.json(
    { ok: true, message: "Medical API route. POST with { text, operations } to process and store." },
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

  // Upstream (Comprehend Medical) has a 20k character limit; avoid 413/500 from oversized text
  const MAX_MEDICAL_TEXT_LENGTH = 20_000;
  const text =
    body.text.length > MAX_MEDICAL_TEXT_LENGTH
      ? body.text.slice(0, MAX_MEDICAL_TEXT_LENGTH)
      : body.text;

  const medicalRes = await fetch(medicalApiUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, operations: body.operations }),
  });
  const result = await medicalRes.json().catch(() => ({}));
  if (!medicalRes.ok) {
    console.error(
      "[medical] upstream error:",
      medicalRes.status,
      medicalApiUrl.replace(/^https?:\/\/[^/]+/, "..."),
      result
    );
    return Response.json(
      {
        error: "Upstream medical API error",
        status: medicalRes.status,
        details: result,
      },
      { status: medicalRes.status, headers }
    );
  }

  const resultKeys = result?.results != null ? Object.keys(result.results) : Object.keys(result ?? {});
  console.info("[medical] Comprehend ok summaryLength=%d resultKeys=%s", text.length, resultKeys.join(", ") || "(none)");

  let patient: Record<string, unknown> | null = null;
  const connectUrl = getConnectLlmUrl();
  if (connectUrl) {
    console.info("[medical] calling connect_llm url=%s", connectUrl.replace(/^https?:\/\/[^/]+/, "..."));
    try {
      // connect_llm receives: patient prompt + Comprehend result + summary (text after <done>)
      patient = await connectLlm({
        summary: text,
        medicalData: result?.results ?? result,
      });
      console.info("[medical] connect_llm ok patientKeys=%s", Object.keys(patient).join(", "));
    } catch (err) {
      console.error("[medical] connect_llm error:", err);
      // Continue without patient; response will not include it
    }
  } else {
    console.info("[medical] connect_llm skipped (no CONNECT_LLM_URL or API base)");
  }

  if (!medicalProcessUrl) {
    return Response.json(
      { error: "MEDICAL_PROCESS_API_URL is not configured" },
      { status: 500, headers }
    );
  }

  const id = crypto.randomUUID();
  const storeRes = await fetch(medicalProcessUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      input: { text, operations: body.operations },
      uuid: id,
      result,
      ...(patient != null && { patient }),
    }),
  });

  const data = await storeRes.json().catch(() => ({}));
  if (!storeRes.ok) {
    return Response.json(
      data?.error ? data : { error: "Failed to store result", status: storeRes.status },
      { status: storeRes.status, headers }
    );
  }

  const payload = patient != null ? { ...data, patient } : data;
  console.info("[medical] stored id=%s patientInResponse=%s", data?.id ?? id, patient != null);
  return Response.json(payload, { status: 200, headers });
}
