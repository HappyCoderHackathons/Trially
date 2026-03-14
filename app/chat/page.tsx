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
import { getAwsCredentialProvider } from "@/lib/aws-credentials"
import { TextractClient, DetectDocumentTextCommand } from "@aws-sdk/client-textract"
import { PDFDocument } from "pdf-lib"

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

  const region = process.env.NEXT_PUBLIC_COGNITO_REGION ?? "us-east-1"

  /** Textract sync API only supports single-page PDFs. Split multi-page PDFs into one buffer per page. */
  async function pdfToSinglePageBuffers(bytes: Uint8Array): Promise<Uint8Array<ArrayBuffer>[]> {
    if (bytes.length < 5 || new TextDecoder().decode(bytes.slice(0, 5)) !== "%PDF-") {
      return [new Uint8Array(bytes) as Uint8Array<ArrayBuffer>]
    }
    try {
      const pdfDoc = await PDFDocument.load(bytes)
      const pageCount = pdfDoc.getPageCount()
      if (pageCount <= 1) {
        return [new Uint8Array(bytes) as Uint8Array<ArrayBuffer>]
      }
      const buffers: Uint8Array<ArrayBuffer>[] = []
      for (let i = 0; i < pageCount; i++) {
        const subDoc = await PDFDocument.create()
        const [copiedPage] = await subDoc.copyPages(pdfDoc, [i])
        subDoc.addPage(copiedPage)
        const out = await subDoc.save()
        buffers.push(new Uint8Array(out) as Uint8Array<ArrayBuffer>)
      }
      return buffers
    } catch {
      return [new Uint8Array(bytes) as Uint8Array<ArrayBuffer>]
    }
  }

  async function extractTextFromFiles(files: File[]): Promise<string> {
    if (files.length === 0) return ""
    let credentials
    try {
      credentials = getAwsCredentialProvider()
    } catch (e) {
      console.error("AWS credentials for Textract:", e)
      throw e
    }
    const client = new TextractClient({
      region,
      credentials,
    })
    const pieces: string[] = []
    for (const file of files) {
      try {
        const bytes = new Uint8Array(await file.arrayBuffer()) as Uint8Array<ArrayBuffer>
        const isPdf = file.type === "application/pdf" || (bytes.length >= 5 && new TextDecoder().decode(bytes.slice(0, 5)) === "%PDF-")
        const pageBuffers = isPdf ? await pdfToSinglePageBuffers(bytes) : [bytes]
        const pageTexts: string[] = []
        for (let p = 0; p < pageBuffers.length; p++) {
          const response = await client.send(
            new DetectDocumentTextCommand({
              Document: { Bytes: pageBuffers[p] },
            }),
          )
          const blocks = response.Blocks ?? []
          const text = blocks
            .filter((b) => b.BlockType === "LINE" && b.Text)
            .map((b) => b.Text as string)
            .join("\n")
          if (text.trim()) {
            pageTexts.push(pageBuffers.length > 1 ? `Page ${p + 1}\n${text}` : text)
          }
        }
        if (pageTexts.length > 0) {
          pieces.push(`File: ${file.name}\n${pageTexts.join("\n\n")}`)
        }
      } catch (err) {
        console.error("Textract error for file:", file.name, err)
      }
    }
    return pieces.join("\n\n")
  }

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages, isTyping])

  const handleSendMessage = async (content: string, files: File[] = []) => {
    let combinedContent = content
    if (files.length > 0) {
      try {
        const extractedText = await extractTextFromFiles(files)
        if (extractedText.trim()) {
          combinedContent = `${content}\n\n---\nAttached documents text:\n${extractedText}`
        }
      } catch (e) {
        const err = e instanceof Error ? e.message : String(e)
        setMessages((prev) => [
          ...prev,
          {
            id: crypto.randomUUID(),
            content: err.includes("signed in")
              ? "Please sign in to extract text from attached documents, then try again."
              : "Document text extraction failed. You can still send your message without it.",
            sender: "ai",
            timestamp: getCurrentTime(),
          },
        ])
        return
      }
    }

    const userMessage: Message = {
      id: crypto.randomUUID(),
      content: combinedContent,
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
        { role: "user" as const, content: combinedContent },
      ]

      const reply = await sendChatMessage(combinedContent, history)

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
