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
    req.setTimeout(25000, () => reject(new Error("Request timed out")));

    if (body) req.write(body);
    req.end();
  });
}

function getBody(event) {
  let raw = event.body;
  if (raw == null) return null;
  if (typeof raw === "object" && !Buffer.isBuffer(raw)) {
    return raw;
  }
  const str = typeof raw === "string" ? raw : String(raw);
  if (event.isBase64Encoded) {
    try {
      raw = Buffer.from(str, "base64").toString("utf8");
    } catch (e) {
      console.warn("Base64 decode failed:", e.message);
      return null;
    }
  } else {
    raw = str;
  }
  try {
    return JSON.parse(raw);
  } catch (e) {
    console.warn("Body JSON parse failed:", e.message);
    return null;
  }
}

export const handler = async (event) => {
  let model_name = event.model_name;
  let model_message = event.model_message;
  let uuid = event.uuid ?? null;
  const body = getBody(event);
  if (body) {
    if (body.model_name != null) model_name = body.model_name;
    if (body.model_message != null) model_message = body.model_message;
    if (body.uuid != null) uuid = body.uuid;
  }

  // ── Validate input ───────────────────────────────────────────────────────
  if (!model_name || !model_message) {
    console.warn("Missing params; event.keys=", Object.keys(event), "hasBody=", !!event.body);
    return {
      statusCode: 400,
      body: JSON.stringify({
        error: "Missing required parameters: 'model_name' and 'model_message'",
      }),
    };
  }

  const started_at = new Date().toISOString();

  // ── Call Featherless API ─────────────────────────────────────────────────
  try {
    const payload = JSON.stringify({
      model: model_name,
      messages: [
        {
          role: "system",
          content: "You are a helpful assistant. Never use emojis in any of your responses.",
        },
        { role: "user", content: model_message },
      ],
    });

    const { status, data } = await httpsRequest(
      "https://api.featherless.ai/v1/chat/completions",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(payload),
          Authorization: `Bearer ${process.env.FEATHERLESS_API_KEY}`,
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

    if (uuid) {
      await invokePipelineLogger({
        uuid,
        step_name: "connect_llm",
        service: "Featherless",
        model: model_name,
        started_at,
        completed_at: new Date().toISOString(),
        metadata: JSON.stringify({
          model: model_name,
          prompt_length: Buffer.byteLength(model_message),
          reply_length: Buffer.byteLength(reply),
        }),
      });
    }

    return {
      statusCode: 200,
      body: JSON.stringify({ model: model_name, message: model_message, reply }),
    };

  } catch (error) {
    console.error("[ERROR]", error.message);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message }),
    };
  }
};