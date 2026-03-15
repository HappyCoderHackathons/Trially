import https from "https";
import { LambdaClient, InvokeCommand } from "@aws-sdk/client-lambda";

const lambdaClient = new LambdaClient({ region: process.env.AWS_REGION ?? "us-east-1" });

async function invokePipelineLogger(payload) {
  try {
    await lambdaClient.send(new InvokeCommand({
      FunctionName: "pipeline-logger",
      InvocationType: "RequestResponse",
      Payload: Buffer.from(JSON.stringify(payload)),
    }));
  } catch (err) {
    console.warn("[pipeline-logger] invoke failed:", err.message);
  }
}

function httpsRequest(url, options, body) {
  return new Promise((resolve, reject) => {
    const req = https.request(url, options, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        try {
          const parsed = JSON.parse(data);
          console.log("HTTP Status  :", res.statusCode);
          console.log("Full response:", JSON.stringify(parsed, null, 2));
          resolve({ status: res.statusCode, data: parsed });
        } catch (e) {
          reject(new Error(`Failed to parse response: ${data}`));
        }
      });
    });

    req.on("error", (e) => reject(new Error(`Request error: ${e.message}`)));
    req.setTimeout(60000, () => {
      req.destroy();
      reject(new Error("Request timed out"));
    });

    if (body) req.write(body);
    req.end();
  });
}

// ── Extract only the fields needed for a meaningful summary ─────────────────
function extractTrialData(trials) {
  return trials.map((trial, index) => ({
    index       : index + 1,
    title       : trial.title       || "Untitled",
    status      : trial.status      || "Unknown",
    phase       : trial.phase       || "Not specified",
    sponsor     : trial.sponsor     || "Unknown",
    location    : trial.location    || "Not specified",
    participants: trial.participants ?? "Not specified",
    startDate   : trial.startDate   || "Not specified",
    // ── Trim description to first 300 chars to keep prompt lean ─────────
    description : trial.description
      ? trial.description.slice(0, 300).trim() + (trial.description.length > 300 ? "..." : "")
      : "No description available",
  }));
}

function getBody(event) {
  if (!event) return {};
  if (typeof event.body === "string") return event.body.trim() ? JSON.parse(event.body) : {};
  if (event.body && typeof event.body === "object") return event.body;
  return event;
}

export const handler = async (event) => {
  const { model_name, trials_json, patient_json, uuid } = getBody(event);
  const started_at = new Date().toISOString();

  // ── Validate input ───────────────────────────────────────────────────────
  if (!model_name) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: "Missing required parameter: 'model_name'" }),
    };
  }

  if (!trials_json) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: "Missing required parameter: 'trials_json'" }),
    };
  }

  // ── Parse trials JSON if passed as a string ──────────────────────────────
  let trials;
  try {
    trials = typeof trials_json === "string"
      ? JSON.parse(trials_json)
      : trials_json;

    if (!Array.isArray(trials)) {
      throw new Error("trials_json must be an array");
    }
  } catch (e) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: `Invalid trials_json: ${e.message}` }),
    };
  }

  // ── Extract and trim relevant fields ────────────────────────────────────
  const extractedTrials = extractTrialData(trials);
  const trialCount      = extractedTrials.length;

  console.log(`Processing ${trialCount} trial(s)`);

  // ── Build a compact plain-text representation of the trials ─────────────
  const trialsText = extractedTrials.map(t => (
    `Trial ${t.index}: ${t.title}\n` +
    `  Status      : ${t.status}\n` +
    `  Phase       : ${t.phase}\n` +
    `  Sponsor     : ${t.sponsor}\n` +
    `  Location    : ${t.location}\n` +
    `  Participants: ${t.participants}\n` +
    `  Start Date  : ${t.startDate}\n` +
    `  Summary     : ${t.description}`
  )).join("\n\n");

  // ── Build patient context snippet ────────────────────────────────────────
  let patientContext = "";
  if (patient_json) {
    try {
      const p = typeof patient_json === "string" ? JSON.parse(patient_json) : patient_json;
      const diagnosis = typeof p.diagnosis === "string"
        ? p.diagnosis
        : (p.diagnosis?.primary ?? null);
      const age  = p.demographics?.age ?? p.age ?? null;
      const sex  = p.demographics?.sex ?? p.sex ?? null;
      const loc  = p.demographics?.location?.city ?? p.location?.city ?? null;
      const meds = (p.currentMedications ?? []).map(m => m.name).filter(Boolean).slice(0, 4).join(", ");
      const prefs = p.trialPreferences?.goals?.desiredOutcomes?.slice(0, 3).join(", ") ?? null;
      const lines = [
        diagnosis && `Condition: ${diagnosis}`,
        (age || sex) && `Patient: ${[age && `${age}yo`, sex].filter(Boolean).join(", ")}`,
        loc && `Location: ${loc}`,
        meds && `Current medications: ${meds}`,
        prefs && `Goals: ${prefs}`,
      ].filter(Boolean);
      if (lines.length) patientContext = lines.join("\n");
    } catch { /* ignore parse errors */ }
  }

  // ── System prompt ────────────────────────────────────────────────────────
  const systemPrompt = `You are a clinical trial advisor. A patient has been matched to ${trialCount} trial(s). Your job is to give them direct, personal recommendations — not descriptions.

Rules:
- Address the patient directly ("This trial...", "Given your condition...", "You may want to prioritize...").
- Always refer to trials by their full title/name (e.g. "The [exact trial name] trial..." or "...[trial name]..."). Never refer to trials by number (e.g. "Trial 1", "the first trial", "trial #2").
- For each trial: one to two sentences on why it is or is not a strong fit for this patient specifically. Skip generic facts already visible in the listing.
- End with a single closing sentence on what to do next (e.g. speak to their doctor, contact the sponsor).
- No emojis. No bullet points. No trial numbering.
- Do not warn the patient to discuss these options with their doctor. The UI makes this VERY clear.
- Be terse. Total response under 220 words.`;

  // ── Call Featherless API ─────────────────────────────────────────────────
  try {
    const userContent = patientContext
      ? `Patient profile:\n${patientContext}\n\nMatched trials:\n${trialsText}\n\nProvide direct, terse recommendations for this patient.`
      : `Matched trials:\n${trialsText}\n\nProvide direct, terse recommendations.`;

    const payload = JSON.stringify({
      model     : model_name,
      messages  : [
        {
          role   : "system",
          content: systemPrompt,
        },
        {
          role   : "user",
          content: userContent,
        },
      ],
      max_tokens: 350,
    });

    console.log(`Payload size: ${Buffer.byteLength(payload)} bytes`);

    const { status, data } = await httpsRequest(
      "https://api.featherless.ai/v1/chat/completions",
      {
        method : "POST",
        headers: {
          "Content-Type"  : "application/json",
          "Content-Length": Buffer.byteLength(payload),
          Authorization   : `Bearer ${process.env.FEATHERLESS_API_KEY}`,
        },
      },
      payload
    );

    if (status !== 200) {
      return {
        statusCode: status,
        body: JSON.stringify({ error: data }),
      };
    }

    const reply = data.choices[0].message.content + "\n\nTo proceed, I recommend discussing these options with your doctor to determine the best course of action and to see if any of these trials may be a suitable fit for you.";
    console.log("Reply:", reply);

    if (uuid) {
      await invokePipelineLogger({
        uuid,
        step_name: "show_result",
        service: "Featherless",
        model: model_name,
        started_at,
        completed_at: new Date().toISOString(),
        metadata: JSON.stringify({ model: model_name, trials_processed: trialCount }),
      });
    }

    return {
      statusCode: 200,
      body: JSON.stringify({
        model           : model_name,
        trials_processed: trialCount,
        descriptions    : reply,
      }),
    };

  } catch (error) {
    console.error("[ERROR]", error.message);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message }),
    };
  }
};