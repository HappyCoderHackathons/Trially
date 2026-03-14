import { Conversation } from "@11labs/client";

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
  const response = await fetch(
    `https://api.elevenlabs.io/v1/convai/conversation/get-signed-url?agent_id=${process.env.AGENT_ID}`,
    { headers: { "xi-api-key": process.env.ELEVENLABS_API_KEY } }
  );
  const { signed_url } = await response.json();
  return {
    statusCode: 200,
    headers: { "Access-Control-Allow-Origin": "*" },
    body: JSON.stringify({ signed_url }),
  };
};
