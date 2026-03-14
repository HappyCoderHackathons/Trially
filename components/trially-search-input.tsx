"use client"

import { useState, useRef } from "react"
import { Paperclip, Mic, Send } from "lucide-react"

interface TriallySearchInputProps {
  onSubmit?: (value: string, file?: File | null) => void
}

export function TriallySearchInput({ onSubmit }: TriallySearchInputProps) {
  const [inputValue, setInputValue] = useState("")
  const [isRecording, setIsRecording] = useState(false)
  const [fileName, setFileName] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleFileClick = () => {
    fileInputRef.current?.click()
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      setFileName(file.name)
    }
  }

  const handleAudioClick = () => {
    setIsRecording(!isRecording)
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      handleSend()
    }
  }

  const handleSend = () => {
    if (inputValue.trim()) {
      onSubmit?.(inputValue)
      setInputValue("")
    }
  }

  return (
    <div className="w-full max-w-2xl">
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
          className="flex-1 bg-transparent text-center text-primary-foreground placeholder:text-primary-foreground/60 focus:outline-none px-4 py-2 font-mono text-sm tracking-wide"
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

      {/* File name indicator */}
      {fileName && (
        <p className="text-center text-sm text-muted-foreground mt-2">
          File attached: {fileName}
        </p>
      )}
    </div>
  )
}
