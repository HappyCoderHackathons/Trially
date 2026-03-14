export async function GET() {
  const response = await fetch(
    `https://api.elevenlabs.io/v1/convai/conversation/get-signed-url?agent_id=${process.env.AGENT_ID}`,
    { headers: { "xi-api-key": process.env.ELEVENLABS_API_KEY! } }
  );

  const { signed_url } = await response.json();

  return Response.json({ signed_url });
}