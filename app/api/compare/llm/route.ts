import { NextRequest } from "next/server"
import type { TrialDetail } from "../route"

const corsHeaders = { "Access-Control-Allow-Origin": "*" as const }

const apiBase = process.env.NEXT_PUBLIC_CHAT_API_URL?.replace(/\/?$/, "") ?? ""
const profileGetUrl =
  process.env.PATIENT_PROFILE_GET_API_URL?.trim() ||
  (apiBase ? `${apiBase}/patient-profile/get` : "")
const connectLlmUrl =
  process.env.CONNECT_LLM_URL?.trim() || (apiBase ? `${apiBase}/connect` : "")
const connectLlmModel =
  process.env.COMPARE_LLM_MODEL?.trim() || "Qwen/Qwen2.5-7B-Instruct"

function decodeJwtSub(token: string): string | null {
  try {
    const payload = token.split(".")[1]
    const decoded = JSON.parse(Buffer.from(payload, "base64url").toString("utf-8"))
    return decoded.sub ?? null
  } catch {
    return null
  }
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null)
  const trials: TrialDetail[] = Array.isArray(body?.trials) ? body.trials : []

  if (!trials.length) {
    return Response.json(
      { error: "Provide trials array for LLM comparison" },
      { status: 400, headers: corsHeaders },
    )
  }

  const authHeader = request.headers.get("Authorization")
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null

  // Fetch patient profile (optional) so comparison can be personalized
  let patient: Record<string, unknown> | null = null
  if (token && profileGetUrl) {
    const userId = decodeJwtSub(token)
    if (userId) {
      try {
        const res = await fetch(profileGetUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId }),
        })
        const data = (await res.json().catch(() => ({}))) as Record<string, unknown>
        if (res.ok) patient = (data.patient ?? null) as Record<string, unknown> | null
      } catch {
        /* non-fatal */
      }
    }
  }

  if (!connectLlmUrl) {
    return Response.json(
      { error: "CONNECT_LLM_URL is not configured" },
      { status: 503, headers: corsHeaders },
    )
  }

  const patientSection = patient
    ? `Patient health profile:\n${JSON.stringify(patient, null, 2)}`
    : "No patient profile available."

  const trialsSection = trials
    .map(
      (t, i) =>
        `Trial ${i + 1} (${t.nctId}):\nTitle: ${t.title}\nStatus: ${t.status}\nPhase: ${t.phases}\nSponsor: ${t.sponsor}\nConditions: ${t.conditions}\nAge Range: ${t.ageRange}\nSex eligibility: ${t.sex}\nLocations: ${t.locations
          .slice(0, 3)
          .join("; ")}\nPrimary Outcomes: ${t.primaryOutcomes
          .slice(0, 3)
          .join("; ")}\nEligibility Criteria:\n${t.eligibilityCriteria.slice(0, 1500)}`,
    )
    .join("\n\n---\n\n")

  const prompt = `You are a clinical trial advisor helping a patient decide between clinical trials.

${patientSection}

Compare the following clinical trials from this patient's perspective:

${trialsSection}

Write a thorough comparison covering:
1. Eligibility fit — which trials the patient likely qualifies for based on their profile
2. Treatment approach — how each trial's intervention and goals differ
3. Practical considerations — location, recruiting status, phase, trial size
4. Recommendation — which trial(s) are the best fit and why

Be specific. Reference NCT IDs. Write in clear paragraphs, not bullet points.`

  let comparison: string | null = null

  const llmBody = JSON.stringify({ model_name: connectLlmModel, model_message: prompt })
  const maxAttempts = 4
  const retryDelays = [2000, 5000, 10000]

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    if (request.signal.aborted) {
      return Response.json({ error: "Request cancelled" }, { status: 499, headers: corsHeaders })
    }

    let res: Response
    try {
      res = await fetch(connectLlmUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: llmBody,
        signal: request.signal,
      })
    } catch {
      return Response.json({ error: "Failed to reach LLM service" }, { status: 502, headers: corsHeaders })
    }

    if (res.status === 429 && attempt < maxAttempts - 1) {
      const delay = retryDelays[attempt]
      console.warn(`[compare/llm] 429 concurrency limit, retrying in ${delay}ms (attempt ${attempt + 1})`)
      await new Promise((resolve) => setTimeout(resolve, delay))
      continue
    }

    if (!res.ok) {
      const errText = await res.text().catch(() => "")
      console.error("[compare/llm] LLM service error", res.status, errText.slice(0, 500))
      return Response.json(
        { error: `LLM service returned ${res.status}`, detail: errText.slice(0, 200) },
        { status: 502, headers: corsHeaders },
      )
    }

    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>
    if (typeof data.body === "string") {
      try {
        const inner = JSON.parse(data.body) as Record<string, unknown>
        if (typeof inner.reply === "string") comparison = inner.reply
      } catch {
        /* ignore parse error */
      }
    }
    if (!comparison && typeof data.reply === "string") comparison = data.reply
    break
  }

  return Response.json({ comparison }, { status: 200, headers: corsHeaders })
}

