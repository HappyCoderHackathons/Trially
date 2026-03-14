import {
  PATIENT_FROM_SUMMARY_SYSTEM,
  buildPatientFromSummaryUserPrompt,
} from "./patient-prompt";

export type ConnectLlmOptions = {
  /** Free-text summary (e.g. from chat or notes). */
  summary: string;
  /** Medical extraction result (e.g. Comprehend Medical API response). */
  medicalData: unknown;
  /** Override system prompt; default is patient-for-trialsapi. */
  systemPrompt?: string;
  /** Override user prompt; default is built from summary + medicalData. */
  userPrompt?: string;
};

/**
 * Call the LLM with summary + medical data and the prompt to produce a single
 * patient JSON object for the trials API. Uses CONNECT_LLM_URL or API base + /connect.
 */
export async function connectLlm(options: ConnectLlmOptions): Promise<Record<string, unknown>> {
  const {
    summary,
    medicalData,
    systemPrompt = PATIENT_FROM_SUMMARY_SYSTEM,
    userPrompt = buildPatientFromSummaryUserPrompt(summary, medicalData),
  } = options;

  const medicalKeys =
    medicalData != null && typeof medicalData === "object" && !Array.isArray(medicalData)
      ? Object.keys(medicalData as Record<string, unknown>)
      : [];
  console.info("[connect_llm] input: summary length=%d, medicalData keys=%s", summary.length, medicalKeys.join(", ") || "(none)");

  const content = await callLlm(systemPrompt, userPrompt);
  console.info("[connect_llm] reply length=%d", content.length);

  const patient = parsePatientJson(content);
  console.info("[connect_llm] parsed patient keys=%s", Object.keys(patient).join(", "));
  return patient;
}

/** Resolve /connect URL: CONNECT_LLM_URL or API base + "/connect". */
export function getConnectLlmUrl(): string | null {
  const explicit = process.env.CONNECT_LLM_URL?.trim();
  if (explicit) return explicit;
  const base = process.env.NEXT_PUBLIC_CHAT_API_URL?.replace(/\/?$/, "") ?? "";
  return base ? `${base}/connect` : null;
}

async function callLlm(systemPrompt: string, userPrompt: string): Promise<string> {
  const url = getConnectLlmUrl();
  if (!url) {
    throw new Error(
      "LLM not configured: set CONNECT_LLM_URL or NEXT_PUBLIC_CHAT_API_URL (for /connect)."
    );
  }
  return callLlmViaUrl(url, systemPrompt, userPrompt);
}

async function callLlmViaUrl(
  url: string,
  systemPrompt: string,
  userPrompt: string
): Promise<string> {
  const modelName = process.env.CONNECT_LLM_MODEL ?? "Qwen/Qwen2.5-72B-Instruct";
  const modelMessage = `${systemPrompt}\n\n${userPrompt}`;
  const body = { model_name: modelName, model_message: modelMessage };
  console.info("[connect_llm] POST %s model=%s messageLength=%d", url.replace(/^https?:\/\/[^/]+/, "..."), modelName, modelMessage.length);

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    console.error("[connect_llm] %s %d %s", url.replace(/^https?:\/\/[^/]+/, "..."), res.status, text.slice(0, 200));
    throw new Error(`connect_llm (${url}) ${res.status}: ${text}`);
  }
  const data = (await res.json()) as Record<string, unknown>;
  console.info("[connect_llm] response ok status=%d", res.status);
  if (typeof data.body === "string") {
    try {
      const parsed = JSON.parse(data.body) as Record<string, unknown>;
      if (typeof parsed.reply === "string") return parsed.reply;
    } catch {
      // ignore
    }
  }
  if (typeof data.reply === "string") return data.reply;
  const choices = data.choices as Array<{ message?: { content?: string } }> | undefined;
  if (Array.isArray(choices) && choices[0]?.message?.content) return choices[0].message.content;
  if (typeof data.content === "string") return data.content;
  throw new Error("connect_llm response missing reply, content, or choices[0].message.content");
}

function parsePatientJson(raw: string): Record<string, unknown> {
  const trimmed = raw.trim();
  const noFence = trimmed.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, "").trim();
  try {
    const parsed = JSON.parse(noFence) as unknown;
    if (parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    // fallback: try to find first { ... } block
    const match = noFence.match(/\{[\s\S]*\}/);
    if (match) {
      const parsed = JSON.parse(match[0]) as unknown;
      if (parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    }
  }
  throw new Error("LLM response did not contain valid patient JSON");
}
