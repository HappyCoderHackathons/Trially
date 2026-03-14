export const handler = async (event) => {
  const method =
    event?.httpMethod ??
    event?.requestContext?.http?.method ??
    event?.requestContext?.httpMethod;

  if (method === "OPTIONS") {
    return {
      statusCode: 200,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET,OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type,Authorization",
        "Access-Control-Max-Age": "0",
      },
      body: "",
    };
  }

  try {
    const response = await fetch(
      `https://api.elevenlabs.io/v1/convai/conversation/get-signed-url?agent_id=${process.env.AGENT_ID}`,
      { headers: { "xi-api-key": process.env.ELEVENLABS_API_KEY ?? "" } }
    );
    const { signed_url } = await response.json();

    return {
      statusCode: 200,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ signed_url }),
    };
  } catch (err) {
    console.error("Signed URL Lambda error:", err);
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
