const apiBase = process.env.NEXT_PUBLIC_CHAT_API_URL?.replace(/\/?$/, "") ?? "";
const showResultsUrl = process.env.SHOW_RESULTS_API_URL?.trim() || "";
const medicalGetUrl =
  process.env.MEDICAL_GET_API_URL?.trim() || (apiBase ? `${apiBase}/medical/get` : "");
const showResultsModelName =
  process.env.SHOW_RESULTS_MODEL_NAME?.trim() || "Qwen/Qwen2.5-7B-Instruct";

const headers = { "Access-Control-Allow-Origin": "*" as const };

/** POST /api/ai-summary — generate AI analysis for a set of matched trials */
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const uuid = body?.uuid != null ? String(body.uuid).trim() : null;
  const studies = body?.studies;

  if (!uuid || !Array.isArray(studies) || studies.length === 0) {
    return Response.json(
      { error: "Body must include uuid and non-empty studies array" },
      { status: 400, headers }
    );
  }

  if (!showResultsUrl) {
    return Response.json(
      { error: "AI summary not configured: set SHOW_RESULTS_API_URL" },
      { status: 500, headers }
    );
  }

  if (!medicalGetUrl) {
    return Response.json(
      { error: "Medical get not configured: set MEDICAL_GET_API_URL or NEXT_PUBLIC_CHAT_API_URL" },
      { status: 500, headers }
    );
  }

  // Fetch patient from stored medical record
  let patient: Record<string, unknown>;
  try {
    const res = await fetch(medicalGetUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ uuid }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.patient == null) {
      return Response.json(
        { error: "Could not retrieve patient for summary", uuid },
        { status: 404, headers }
      );
    }
    patient = data.patient as Record<string, unknown>;
  } catch (err) {
    return Response.json(
      { error: "Failed to look up patient", details: String(err) },
      { status: 502, headers }
    );
  }

  try {
    const res = await fetch(showResultsUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model_name: showResultsModelName,
        trials_json: studies,
        patient_json: patient,
        uuid,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      console.warn("[ai-summary] show_result %s %s", res.status, JSON.stringify(data).slice(0, 200));
      return Response.json(
        { error: "AI summary failed", status: res.status },
        { status: res.status, headers }
      );
    }
    if (!data.descriptions) {
      return Response.json({ error: "No summary returned" }, { status: 502, headers });
    }
    return Response.json({ aiSummary: data.descriptions }, { status: 200, headers });
  } catch (err) {
    console.error("[ai-summary] error:", err);
    return Response.json(
      { error: "AI summary request failed", details: String(err) },
      { status: 502, headers }
    );
  }
}
