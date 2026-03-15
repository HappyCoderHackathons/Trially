const apiBase = process.env.NEXT_PUBLIC_CHAT_API_URL?.replace(/\/?$/, "") ?? "";
const trialsSearchUrl =
  process.env.TRIALS_SEARCH_API_URL?.trim() || (apiBase ? `${apiBase}/search` : "");
const medicalGetUrl =
  process.env.MEDICAL_GET_API_URL?.trim() || (apiBase ? `${apiBase}/medical/get` : "");
const showResultsUrl = process.env.SHOW_RESULTS_API_URL?.trim() || "";
const showResultsModelName =
  process.env.SHOW_RESULTS_MODEL_NAME?.trim() || "meta-llama/Meta-Llama-3.1-8B-Instruct";

const headers = { "Access-Control-Allow-Origin": "*" as const };

/** GET /api/trials-search - confirm route exists */
export async function GET() {
  return Response.json(
    {
      ok: true,
      message:
        "POST with { uuid } to search clinical trials. Optional: pageSize, pageToken. Looks up patient from stored medical result via API.",
    },
    { status: 200, headers }
  );
}

/** POST /api/trials-search - look up patient by uuid (via medical-get API), then search clinical trials. */
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const uuid = body?.uuid != null ? String(body.uuid).trim() : null;
  if (!uuid) {
    return Response.json(
      { error: "Body must include uuid (id from /api/medical response)" },
      { status: 400, headers }
    );
  }

  if (!medicalGetUrl) {
    return Response.json(
      {
        error:
          "Medical get not configured: set MEDICAL_GET_API_URL or NEXT_PUBLIC_CHAT_API_URL",
      },
      { status: 500, headers }
    );
  }

  let patient: Record<string, unknown>;
  try {
    const res = await fetch(medicalGetUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ uuid }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      if (res.status === 404) {
        return Response.json(
          { error: "Record not found or has no patient", uuid },
          { status: 404, headers }
        );
      }
      console.warn("[trials-search] medical-get %s %s", res.status, JSON.stringify(data).slice(0, 200));
      return Response.json(
        data?.error ? data : { error: "Failed to look up record", status: res.status, details: data },
        { status: res.status, headers }
      );
    }
    if (data.patient == null || typeof data.patient !== "object") {
      return Response.json(
        {
          error: "Record has no patient",
          uuid,
          hint: "This usually means the connect_llm step failed or timed out (503). Use a uuid from a run where /api/medical returned a patient.",
        },
        { status: 404, headers }
      );
    }
    patient = data.patient as Record<string, unknown>;
  } catch (err) {
    console.error("[trials-search] lookup error:", err);
    return Response.json(
      { error: "Failed to look up record by uuid", details: String(err) },
      { status: 502, headers }
    );
  }

  if (!trialsSearchUrl) {
    return Response.json(
      {
        error:
          "Trials search not configured: set TRIALS_SEARCH_API_URL or NEXT_PUBLIC_CHAT_API_URL",
      },
      { status: 500, headers }
    );
  }

  const searchBody = {
    patient,
    pageSize: body?.pageSize ?? 10,
    ...(body?.pageToken != null && { pageToken: body.pageToken }),
  };

  try {
    const res = await fetch(trialsSearchUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(searchBody),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      console.warn(
        "[trials-search] upstream %s %s",
        res.status,
        JSON.stringify(data).slice(0, 200)
      );
      return Response.json(
        data?.error ? data : { error: "Trials search failed", status: res.status, details: data },
        { status: res.status, headers }
      );
    }
    console.info(
      "[trials-search] ok uuid=%s total=%s studies=%d",
      uuid,
      data.total ?? "?",
      data.studies?.length ?? 0
    );

    let aiSummary: string | null = null;
    if (showResultsUrl && Array.isArray(data.studies) && data.studies.length > 0) {
      try {
        const showRes = await fetch(showResultsUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ model_name: showResultsModelName, trials_json: data.studies }),
        });
        const showData = await showRes.json().catch(() => ({}));
        if (showRes.ok && showData.descriptions) {
          aiSummary = showData.descriptions;
        } else {
          console.warn("[trials-search] show_result %s %s", showRes.status, JSON.stringify(showData).slice(0, 200));
        }
      } catch (err) {
        console.warn("[trials-search] show_result error:", err);
      }
    }

    return Response.json({ ...data, ...(aiSummary != null && { aiSummary }) }, { status: 200, headers });
  } catch (err) {
    console.error("[trials-search] error:", err);
    return Response.json(
      { error: "Trials search request failed", details: String(err) },
      { status: 502, headers }
    );
  }
}
