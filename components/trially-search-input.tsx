"use client"

import { useState, useRef } from "react"
import { Paperclip, Mic, Send, X } from "lucide-react"
import { useScribe } from "@elevenlabs/react";


interface TriallySearchInputProps {
  onSubmit?: (value: string, file?: File | null) => void
}

export function TriallySearchInput({ onSubmit }: TriallySearchInputProps) {
  const [inputValue, setInputValue] = useState("")
  const [isRecording, setIsRecording] = useState(false)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleFileClick = () => {
    fileInputRef.current?.click()
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] ?? null
    setSelectedFile(file)
  }

  const handleRemoveFile = () => {
    setSelectedFile(null)
    if (fileInputRef.current) {
      fileInputRef.current.value = ""
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      handleSend()
    }
  }

  const handleSend = () => {
    if (inputValue.trim()) {
      onSubmit?.(inputValue, selectedFile ?? null)
      setInputValue("")
      setSelectedFile(null)
      if (fileInputRef.current) {
        fileInputRef.current.value = ""
      }
    }
  }

  const scribe = useScribe({
      modelId: "scribe_v2_realtime",
      onPartialTranscript: (data) => {
        console.log("Partial:", data.text);
        setInputValue(data.text);
      },
      onCommittedTranscript: (data) => {
        console.log("Committed:", data.text);
        setInputValue(data.text); // Update with final committed text
      },
      onCommittedTranscriptWithTimestamps: (data) => {
        console.log("Committed with timestamps:", data.text);
        console.log("Timestamps:", data.words);
      },
    });
  
    const handleAudioClick = async () => {
      if(!scribe.isConnected){
      // Fetch a single use token from the server
      const token = await fetch("/api/transcribe").then(res => res.text());
      await scribe.connect({
        token,
        microphone: {
          echoCancellation: true,
          noiseSuppression: true,
        },
      });
      setIsRecording(true);
      } else {
        scribe.disconnect();
        setIsRecording(false);
      }
    };

  return (
    <div className="w-full max-w-2xl space-y-2">
      {/* Attached file chip */}
      {selectedFile && (
        <div className="flex flex-wrap gap-2">
          <span
            className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm bg-muted text-muted-foreground"
          >
            <span className="max-w-[180px] truncate" title={selectedFile.name}>
              {selectedFile.name}
            </span>
            <button
              type="button"
              onClick={handleRemoveFile}
              className="rounded-full p-0.5 hover:bg-muted-foreground/20 focus:outline-none focus:ring-2 focus:ring-ring"
              aria-label={`Remove ${selectedFile.name}`}
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </span>
        </div>
      )}

      <div className="relative flex items-center bg-primary rounded-full px-2 py-2 shadow-lg">
        {/* File Upload Button */}
        <button
          onClick={handleFileClick}
          className="flex items-center justify-center w-12 h-12 rounded-full hover:bg-accent transition-colors text-primary-foreground"
          aria-label="Upload file"
        >
          <Paperclip className="w-5 h-5" />
        </button>
        
        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileChange}
          className="hidden"
          accept=".pdf,.doc,.docx,.txt,.jpg,.png"
        />

        {/* Text Input */}
        <input
          type="text"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Enter Text Here"
          className="flex-1 bg-transparent text-center text-primary-foreground placeholder:text-black focus:outline-none px-4 py-2 font-mono text-sm tracking-wide"
        />

        {/* Audio Button */}
        <button
          onClick={handleAudioClick}
          className={`flex items-center justify-center w-10 h-10 rounded-full transition-colors text-primary-foreground ${
            isRecording ? "bg-red-400/50" : "hover:bg-accent"
          }`}
          aria-label={isRecording ? "Stop recording" : "Start audio input"}
        >
          <Mic className={`w-5 h-5 ${isRecording ? "animate-pulse" : ""}`} />
        </button>

        {/* Send Button */}
        <button
          onClick={handleSend}
          className="flex items-center justify-center w-10 h-10 rounded-full bg-accent hover:bg-accent/80 transition-colors text-primary-foreground ml-1"
          aria-label="Send message"
        >
          <Send className="w-4 h-4" />
        </button>
      </div>
    </div>
  )
}
