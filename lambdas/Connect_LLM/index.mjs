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
    req.setTimeout(25000, () => reject(new Error("Request timed out")));

    if (body) req.write(body);
    req.end();
  });
}

export const handler = async (event) => {
  const { model_name, model_message } = event;

  // ── Validate input ───────────────────────────────────────────────────────
  if (!model_name || !model_message) {
    return {
      statusCode: 400,
      body: JSON.stringify({
        error: "Missing required parameters: 'model_name' and 'model_message'",
      }),
    };
  }

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