"use client"
import React from "react";
import { useScribe } from "@elevenlabs/react";

function MyComponent() {
  const scribe = useScribe({
    modelId: "scribe_v2_realtime",
    onPartialTranscript: (data) => {
      console.log("Partial:", data.text);
    },
    onCommittedTranscript: (data) => {
      console.log("Committed:", data.text);
    },
    onCommittedTranscriptWithTimestamps: (data) => {
      console.log("Committed with timestamps:", data.text);
      console.log("Timestamps:", data.words);
    },
  });

  const handleStart = async () => {
    // Fetch a single use token from the server
    const token = await fetch("/api/transcribe").then(res => res.text());
    await scribe.connect({
      token,
      microphone: {
        echoCancellation: true,
        noiseSuppression: true,
      },
    });
  };
  return (
    <div>
      <button onClick={handleStart} disabled={scribe.isConnected}>
        Start Recording
      </button>
      <button onClick={scribe.disconnect} disabled={!scribe.isConnected}>
        Stop
      </button>
      {scribe.partialTranscript && <p>Live: {scribe.partialTranscript}</p>}
      <div>
        {scribe.committedTranscripts.map((t) => (
          <p key={t.id}>{t.text}</p>
        ))}
      </div>
    </div>
  );
}

export default MyComponent;