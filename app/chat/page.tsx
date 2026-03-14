"use client"

import { useState, useEffect, useRef } from "react"
import { useSearchParams, useRouter } from "next/navigation"
import Link from "next/link"
import Image from "next/image"
import { ArrowLeft } from "lucide-react"
import { ChatMessage } from "@/components/chat-message"
import { ChatInput } from "@/components/chat-input"
import { BackgroundDecorations } from "@/components/background-decorations"

interface Message {
  id: string
  content: string
  sender: "user" | "ai"
  timestamp: string
}

// Simulated AI clarifying questions based on context
const clarifyingQuestions = [
  "Thank you for reaching out! To help find the best clinical trials for you, I have a few questions. First, could you tell me more about your current diagnosis or the condition you're seeking treatment for?",
  "That's helpful information. What treatments have you tried so far, if any? This helps me understand what options might be most relevant for you.",
  "Got it. Are you looking for trials in a specific geographic location, or are you open to traveling for the right opportunity?",
  "One more question - do you have any preferences regarding the phase of clinical trials? Phase 1 trials test safety, Phase 2 tests effectiveness, and Phase 3 compares to standard treatments.",
  "Perfect! Based on your responses, I'm now searching for clinical trials that match your criteria. Let me find the most relevant options for you..."
]

export default function ChatPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const initialQuery = searchParams.get("q") || ""
  const messagesEndRef = useRef<HTMLDivElement>(null)
  
  const [messages, setMessages] = useState<Message[]>([])
  const [isTyping, setIsTyping] = useState(false)
  const [questionIndex, setQuestionIndex] = useState(0)

  const getCurrentTime = () => {
    return new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  }

  // Initialize with user's initial query
  useEffect(() => {
    if (initialQuery && messages.length === 0) {
      const userMessage: Message = {
        id: "1",
        content: initialQuery,
        sender: "user",
        timestamp: getCurrentTime()
      }
      setMessages([userMessage])
      
      // AI responds after a short delay
      setTimeout(() => {
        setIsTyping(true)
        setTimeout(() => {
          const aiMessage: Message = {
            id: "2",
            content: clarifyingQuestions[0],
            sender: "ai",
            timestamp: getCurrentTime()
          }
          setMessages(prev => [...prev, aiMessage])
          setIsTyping(false)
          setQuestionIndex(1)
        }, 1500)
      }, 500)
    }
  }, [initialQuery])

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages, isTyping])

  const handleSendMessage = (content: string) => {
    const userMessage: Message = {
      id: Date.now().toString(),
      content,
      sender: "user",
      timestamp: getCurrentTime()
    }
    setMessages(prev => [...prev, userMessage])

    // Check if we should redirect to results
    if (questionIndex >= clarifyingQuestions.length) {
      setTimeout(() => {
        router.push(`/results?q=${encodeURIComponent(initialQuery)}`)
      }, 1000)
      return
    }

    // AI responds with next clarifying question
    setTimeout(() => {
      setIsTyping(true)
      setTimeout(() => {
        const aiMessage: Message = {
          id: (Date.now() + 1).toString(),
          content: clarifyingQuestions[questionIndex],
          sender: "ai",
          timestamp: getCurrentTime()
        }
        setMessages(prev => [...prev, aiMessage])
        setIsTyping(false)
        setQuestionIndex(prev => prev + 1)

        // Redirect to results after final question
        if (questionIndex === clarifyingQuestions.length - 1) {
          setTimeout(() => {
            router.push(`/results?q=${encodeURIComponent(initialQuery)}`)
          }, 3000)
        }
      }, 1500)
    }, 500)
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
