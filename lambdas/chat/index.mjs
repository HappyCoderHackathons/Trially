function getRequestBody(event) {
  if (!event) {
    return {};
  }
  if (typeof event.body === "string") {
    return event.body.trim() ? JSON.parse(event.body) : {};
  }
  if (event.body && typeof event.body === "object") {
    return event.body;
  }
  return event;
}

export const handler = async (event) => {
  try {
    const body = getRequestBody(event);
    const message = (body.message ?? "").trim();

    if (!message) {
      return {
        statusCode: 400,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ error: "Missing message" }),
      };
    }

    // TODO: Replace with real model call (Bedrock, OpenAI, etc.)
    const reply =
      "Thanks for your message. This is a placeholder response from the Trially Lambda. Here's what you said: " +
      message;

    return {
      statusCode: 200,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ reply }),
    };
  } catch (err) {
    console.error("Chat Lambda error:", err);

    return {
      statusCode: 500,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ error: "Internal server error" }),
    };
  }
};
