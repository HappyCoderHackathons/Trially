const apiBase = process.env.NEXT_PUBLIC_CHAT_API_URL?.replace(/\/?$/, "") ?? "";
const pipelineStepsUrl =
  process.env.PIPELINE_STEPS_GET_URL?.trim() || (apiBase ? `${apiBase}/pipeline-steps` : "");

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const uuid = searchParams.get("uuid");

  if (!uuid) {
    return Response.json({ error: "Missing uuid query parameter" }, { status: 400 });
  }

  if (!pipelineStepsUrl) {
    return Response.json({ error: "PIPELINE_STEPS_GET_URL is not configured" }, { status: 500 });
  }

  try {
    const res = await fetch(pipelineStepsUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ uuid }),
    });

    const data = await res.json().catch(() => ({}));
    return Response.json(data, { status: res.status });
  } catch (err) {
    console.error("[transparency] fetch error:", err);
    return Response.json({ error: "Failed to load pipeline data" }, { status: 502 });
  }
}
