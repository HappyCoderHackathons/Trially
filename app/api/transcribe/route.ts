import { ElevenLabsClient } from "@elevenlabs/elevenlabs-js";
const elevenlabs = new ElevenLabsClient({
  apiKey: process.env.ELEVENLABS_API_KEY,
});

export async function GET() {
  try {
    const token = await elevenlabs.tokens.singleUse.create("realtime_scribe");
    return new Response(token.token, { status: 200 });
  } catch (error) {
    console.error("Error creating ElevenLabs token:", error);
    return new Response("Error creating token", { status: 500 });
  }
}