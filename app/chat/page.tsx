"use client"

import { useState, useEffect, useRef } from "react"
import { useSearchParams } from "next/navigation"
import Link from "next/link"
import Image from "next/image"
import { ArrowLeft } from "lucide-react"
import { ChatMessage } from "@/components/chat-message"
import { ChatInput } from "@/components/chat-input"
import { BackgroundDecorations } from "@/components/background-decorations"
import { sendChatMessage } from "@/lib/chat-api"

interface Message {
  id: string
  content: string
  sender: "user" | "ai"
  timestamp: string
}

export default function ChatPage() {
  const searchParams = useSearchParams()
  const initialQuery = searchParams.get("q") || ""
  const messagesEndRef = useRef<HTMLDivElement>(null)
  
  const [messages, setMessages] = useState<Message[]>([])
  const [isTyping, setIsTyping] = useState(false)

  const getCurrentTime = () => {
    return new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  }

  // Initialize with user's initial query and send it to the chat service
  useEffect(() => {
    const run = async () => {
      if (!initialQuery || messages.length > 0) return

      const userMessage: Message = {
        id: crypto.randomUUID(),
        content: initialQuery,
        sender: "user",
        timestamp: getCurrentTime(),
      }
      setMessages([userMessage])

      try {
        setIsTyping(true)
        const reply = await sendChatMessage(initialQuery, [
          { role: "user", content: initialQuery },
        ])
        const aiMessage: Message = {
          id: crypto.randomUUID(),
          content: reply,
          sender: "ai",
          timestamp: getCurrentTime(),
        }
        setMessages((prev) => [...prev, aiMessage])
      } catch {
        const errorMessage: Message = {
          id: crypto.randomUUID(),
          content:
            "Sorry, something went wrong while contacting the Trially assistant. Please try again.",
          sender: "ai",
          timestamp: getCurrentTime(),
        }
        setMessages((prev) => [...prev, errorMessage])
      } finally {
        setIsTyping(false)
      }
    }

    void run()
  }, [initialQuery, messages.length])

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages, isTyping])

  const handleSendMessage = async (content: string) => {
    const userMessage: Message = {
      id: crypto.randomUUID(),
      content,
      sender: "user",
      timestamp: getCurrentTime(),
    }
    setMessages((prev) => [...prev, userMessage])

    try {
      setIsTyping(true)

      const history = [
        ...messages.map((m) => ({
          role: (m.sender === "user" ? "user" : "assistant") as
            | "user"
            | "assistant",
          content: m.content,
        })),
        { role: "user" as const, content },
      ]

      const reply = await sendChatMessage(content, history)

      const aiMessage: Message = {
        id: crypto.randomUUID(),
        content: reply,
        sender: "ai",
        timestamp: getCurrentTime(),
      }
      setMessages((prev) => [...prev, aiMessage])
    } catch {
      const errorMessage: Message = {
        id: crypto.randomUUID(),
        content:
          "Sorry, something went wrong while contacting the Trially assistant. Please try again.",
        sender: "ai",
        timestamp: getCurrentTime(),
      }
      setMessages((prev) => [...prev, errorMessage])
    } finally {
      setIsTyping(false)
    }
  }

  return (
    <main className="min-h-screen flex flex-col bg-background">
      {/* Background elements */}
      <div className="fixed inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-primary/10 via-transparent to-transparent pointer-events-none" />
      <BackgroundDecorations />

      {/* Header */}
      <header className="sticky top-0 z-20 bg-background/80 backdrop-blur-md border-b border-border">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center gap-4">
          <Link
            href="/"
            className="flex items-center justify-center w-10 h-10 rounded-full hover:bg-muted transition-colors"
            aria-label="Back to home"
          >
            <ArrowLeft className="w-5 h-5 text-foreground" />
          </Link>
          
          <div className="flex items-center gap-3">
            <Image
              src="/trially-logo.jpg"
              alt="Trially"
              width={36}
              height={36}
              className="rounded-full"
            />
            <div>
              <h1 className="text-lg font-medium text-foreground">Trially Assistant</h1>
              <p className="text-xs text-muted-foreground">Finding the right trial for you</p>
            </div>
          </div>
        </div>
      </header>

      {/* Chat Messages */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-4xl mx-auto px-4 py-6">
          {messages.map((message) => (
            <ChatMessage
              key={message.id}
              content={message.content}
              sender={message.sender}
              timestamp={message.timestamp}
            />
          ))}
          
          {/* Typing indicator */}
          {isTyping && (
            <div className="flex justify-start mb-4">
              <div className="bg-card border border-border rounded-2xl rounded-bl-md px-4 py-3 shadow-sm">
                <div className="flex gap-1">
                  <span className="w-2 h-2 bg-muted-foreground/50 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                  <span className="w-2 h-2 bg-muted-foreground/50 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                  <span className="w-2 h-2 bg-muted-foreground/50 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
                </div>
              </div>
            </div>
          )}
          
          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Chat Input */}
      <div className="sticky bottom-0 z-20 bg-background/80 backdrop-blur-md border-t border-border">
        <div className="max-w-4xl mx-auto px-4 py-4">
          <ChatInput onSend={handleSendMessage} disabled={isTyping} />
        </div>
      </div>
    </main>
  )
}
