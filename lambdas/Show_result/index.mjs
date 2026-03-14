import https from "https";

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

export const handler = async (event) => {
  const { model_name, trials_json } = event;

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

  // ── System prompt ────────────────────────────────────────────────────────
  const systemPrompt = `You are a clinical research analyst.
You have been given data on ${trialCount} clinical trial(s).
Your task is to write a short, clear, and professional description for each trial.

Rules:
- No emojis.
- Only use information explicitly present in the trial data provided.
- For each trial write 2 to 3 sentences covering:
    1. What the trial is investigating and why
    2. Who is involved (sponsor, participants, location)
    3. The current status and phase
- After all individual trial descriptions, write a brief overall summary paragraph 
  highlighting any patterns such as common conditions, phases, or statuses across the trials.
- Keep each trial description concise and factual.`;

  // ── Call Featherless API ─────────────────────────────────────────────────
  try {
    const payload = JSON.stringify({
      model     : model_name,
      messages  : [
        {
          role   : "system",
          content: systemPrompt,
        },
        {
          role   : "user",
          content: `Please write a short description for each of the following ${trialCount} clinical trial(s):\n\n${trialsText}`,
        },
      ],
      max_tokens: 1500,
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

    const reply = data.choices[0].message.content;
    console.log("Reply:", reply);

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