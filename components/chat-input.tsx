"use client"

import { useState, useRef } from "react"
import { Paperclip, Mic, Send, X } from "lucide-react"

interface ChatInputProps {
  onSend: (message: string, files: File[]) => void
  disabled?: boolean
}

export function ChatInput({ onSend, disabled = false }: ChatInputProps) {
  const [inputValue, setInputValue] = useState("")
  const [isRecording, setIsRecording] = useState(false)
  const [selectedFiles, setSelectedFiles] = useState<File[]>([])
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleFileClick = () => {
    fileInputRef.current?.click()
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files || files.length === 0) {
      setSelectedFiles([])
      return
    }
    setSelectedFiles(Array.from(files))
  }

  const removeFile = (index: number) => {
    setSelectedFiles((prev) => prev.filter((_, i) => i !== index))
  }

  const handleAudioClick = () => {
    setIsRecording(!isRecording)
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const handleSend = () => {
    if (inputValue.trim() && !disabled) {
      onSend(inputValue.trim(), selectedFiles)
      setInputValue("")
      setSelectedFiles([])
      if (fileInputRef.current) {
        fileInputRef.current.value = ""
      }
    }
  }

  return (
    <div className="w-full space-y-2">
      {selectedFiles.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {selectedFiles.map((file, index) => (
            <span
              key={`${file.name}-${index}`}
              className="inline-flex items-center gap-1.5 rounded-full bg-muted px-3 py-1.5 text-sm text-muted-foreground"
            >
              <span className="max-w-[180px] truncate" title={file.name}>
                {file.name}
              </span>
              <button
                type="button"
                onClick={() => removeFile(index)}
                className="rounded-full p-0.5 hover:bg-muted-foreground/20 focus:outline-none focus:ring-2 focus:ring-ring"
                aria-label={`Remove ${file.name}`}
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </span>
          ))}
        </div>
      )}
      <div className="relative flex items-center bg-primary rounded-full px-2 py-2 shadow-lg">
        {/* File Upload Button */}
        <button
          onClick={handleFileClick}
          disabled={disabled}
          className="flex items-center justify-center w-10 h-10 rounded-full hover:bg-accent transition-colors text-primary-foreground disabled:opacity-50"
          aria-label="Upload file"
        >
          <Paperclip className="w-4 h-4" />
        </button>
        
        <input
          type="file"
          ref={fileInputRef}
          className="hidden"
          accept=".pdf,.doc,.docx,.txt,.jpg,.png"
          multiple
          onChange={handleFileChange}
        />

        {/* Text Input */}
        <input
          type="text"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Type your response..."
          disabled={disabled}
          className="flex-1 bg-transparent text-primary-foreground placeholder:text-black/60 focus:outline-none px-3 py-2 text-sm disabled:opacity-50"
        />

        {/* Audio Button */}
        <button
          onClick={handleAudioClick}
          disabled={disabled}
          className={`flex items-center justify-center w-9 h-9 rounded-full transition-colors text-primary-foreground disabled:opacity-50 ${
            isRecording ? "bg-red-400/50" : "hover:bg-accent"
          }`}
          aria-label={isRecording ? "Stop recording" : "Start audio input"}
        >
          <Mic className={`w-4 h-4 ${isRecording ? "animate-pulse" : ""}`} />
        </button>

        {/* Send Button */}
        <button
          onClick={handleSend}
          disabled={disabled || !inputValue.trim()}
          className="flex items-center justify-center w-9 h-9 rounded-full bg-accent hover:bg-accent/80 transition-colors text-primary-foreground ml-1 disabled:opacity-50 disabled:cursor-not-allowed"
          aria-label="Send message"
        >
          <Send className="w-4 h-4" />
        </button>
      </div>
    </div>
  )
}
