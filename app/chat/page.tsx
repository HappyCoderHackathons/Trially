"use client"

import { Suspense, useState, useEffect, useRef } from "react"
import { useSearchParams, useRouter } from "next/navigation"
import { AppHeader } from "@/components/app-header"
import { ChatMessage } from "@/components/chat-message"
import { ChatInput } from "@/components/chat-input"
import { BackgroundDecorations } from "@/components/background-decorations"
import { getAwsCredentialProvider, getIdToken } from "@/lib/aws-credentials"
import { TextractClient, DetectDocumentTextCommand } from "@aws-sdk/client-textract"
import { PDFDocument } from "pdf-lib"
import { useConversation } from "@elevenlabs/react"

interface Message {
  id: string
  content: string
  sender: "user" | "ai"
  timestamp: string
}

const PENDING_FILE_KEY = "trially_pending_file"

function ChatPageContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const initialQuery = searchParams.get("q") || ""
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const initialQuerySent = useRef(false)

  const [messages, setMessages] = useState<Message[]>([])
  const [isTyping, setIsTyping] = useState(false)
  const [processingStatus, setProcessingStatus] = useState<string | null>(null)


  const getCurrentTime = () => {
    return new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  }

  const medicalApiUrl = "/api/medical"

  const medicalOperations = [
    "detect_entities",
    "detect_phi",
    "infer_icd10",
    "infer_rx_norm",
    "infer_snomed",
  ] as const

  async function sendToMedicalApi(body: {
    text: string
    operations: readonly string[]
  }): Promise<{ id?: string; [key: string]: unknown }> {
    const token = getIdToken()
    const res = await fetch(medicalApiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(body),
    })
    if (!res.ok) {
      throw new Error(await res.text().catch(() => `Medical API ${res.status}`))
    }
    return res.json().catch(() => ({}))
  }

  // Create Conversation with Error Handling
  const conversation = useConversation({
    textOnly: true,
    onMessage: ({ message, source }: { message: string; source: string }) => {
      if (source === "ai") {
        setIsTyping(false)

        const doneAt = message.indexOf("<done>")
        if (doneAt !== -1) {
          const afterDone = message.slice(doneAt + "<done>".length)
          const endTag = afterDone.indexOf("</done>")
          const text = (endTag === -1 ? afterDone : afterDone.slice(0, endTag)).trim()
          if (text) {
            console.log("text", text);
            const body = { text, operations: [...medicalOperations] }
            setProcessingStatus("Analyzing medical data…")
            sendToMedicalApi(body)
              .then((data) => {
                setProcessingStatus(null)
                setMessages((prev) => [
                  ...prev,
                  {
                    id: crypto.randomUUID(),
                    content: "Summary sent for medical processing and saved.",
                    sender: "ai",
                    timestamp: getCurrentTime(),
                  },
                ])
                const uuid = data?.id
                if (uuid) {
                  router.push(`/results?uuid=${encodeURIComponent(String(uuid))}`)
                }
              })
              .catch((err) => {
                setProcessingStatus(null)
                console.error("Medical API error:", err)
                setMessages((prev) => [
                  ...prev,
                  {
                    id: crypto.randomUUID(),
                    content: "Summary could not be sent for processing. Please try again.",
                    sender: "ai",
                    timestamp: getCurrentTime(),
                  },
                ])
              })
          }
          conversation.endSession()
          return
        }

        setMessages((prev) => [
          ...prev,
          {
            id: crypto.randomUUID(),
            content: message,
            sender: "ai",
            timestamp: getCurrentTime(),
          },
        ])
      }
    },
    onError: () => {
      setIsTyping(false)
      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          content: "Sorry, something went wrong with the Trially assistant. Please try again.",
          sender: "ai",
          timestamp: getCurrentTime(),
        },
      ])
    },
  })

  // Connect to ElevenLabs on mount with text chat
  useEffect(() => {
    async function connect() {
      try {
        const { signed_url } = await fetch("/api/signed-url").then((r) => r.json())
        await conversation.startSession({
          signedUrl: signed_url,
          connectionType: "websocket",
        })
      } catch (err) {
        console.error("Failed to connect to agent:", err)
      }
    }
    connect()
    return () => {
      conversation.endSession()
    }
  }, [])



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

  // Send initial query (and any pending attached file) once session is connected
  useEffect(() => {
    if (
      conversation.status !== "connected" ||
      !initialQuery ||
      initialQuerySent.current
    ) {
      return
    }

    initialQuerySent.current = true

    async function sendInitialMessage() {
      let combinedContent = initialQuery
      const files: File[] = []

      if (typeof window !== "undefined") {
        const raw = window.sessionStorage.getItem(PENDING_FILE_KEY)
        if (raw) {
          window.sessionStorage.removeItem(PENDING_FILE_KEY)
          try {
            const parsed = JSON.parse(raw) as {
              name?: string
              type?: string
              dataUrl?: string
            }
            if (parsed?.dataUrl && parsed?.name) {
              const res = await fetch(parsed.dataUrl)
              const blob = await res.blob()
              const file = new File([blob], parsed.name, {
                type: parsed.type || blob.type,
              })
              files.push(file)
            }
          } catch (e) {
            console.error("Failed to restore pending file:", e)
          }
        }
      }

      if (files.length > 0) {
        setProcessingStatus("Extracting text from documents…")
        try {
          const extractedText = await extractTextFromFiles(files)
          if (extractedText.trim()) {
            combinedContent = `${initialQuery}\n\n---\nAttached documents text:\n${extractedText}`
          }
        } catch (e) {
          const err = e instanceof Error ? e.message : String(e)
          setMessages((prev) => [
            ...prev,
            {
              id: crypto.randomUUID(),
              content: err.includes("signed in")
                ? "Please sign in to extract text from attached documents, then try again."
                : "Document text extraction failed. You can still continue chatting without it.",
              sender: "ai",
              timestamp: getCurrentTime(),
            },
          ])
        } finally {
          setProcessingStatus(null)
        }
      }

      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          content: combinedContent,
          sender: "user",
          timestamp: getCurrentTime(),
        },
      ])
      setIsTyping(true)
      conversation.sendUserMessage(combinedContent)
    }

    void sendInitialMessage()
  }, [conversation, initialQuery])

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages, isTyping])

  const handleSendMessage = async (content: string, files: File[] = []) => {
    let combinedContent = content
    if (files.length > 0) {
      setProcessingStatus("Extracting text from documents…")
      try {
        const extractedText = await extractTextFromFiles(files)
        if (extractedText.trim()) {
          combinedContent = `${content}\n\n---\nAttached documents text:\n${extractedText}`
        }
      } catch (e) {
        setProcessingStatus(null)
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
      setProcessingStatus(null)
    }

    setMessages((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        content: combinedContent,
        sender: "user",
        timestamp: getCurrentTime(),
      },
    ])
    setIsTyping(true)
    conversation.sendUserMessage(combinedContent)
  }

  return (
    <main className="min-h-screen flex flex-col bg-background">
      {/* Background elements */}
      <div className="fixed inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-primary/10 via-transparent to-transparent pointer-events-none" />
      <BackgroundDecorations />

      <AppHeader
        backLink={{ href: "/", label: "Back to home" }}
        showDashboardLink
        className="sticky top-0 z-20 bg-background/80 backdrop-blur-md border-border"
      />

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
          
          {/* Processing status indicator */}
          {processingStatus && (
            <div className="flex justify-start mb-4">
              <div className="bg-card border border-border rounded-2xl rounded-bl-md px-4 py-3 shadow-sm">
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin flex-shrink-0" />
                  <span className="text-sm text-muted-foreground">{processingStatus}</span>
                </div>
              </div>
            </div>
          )}

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

export default function ChatPage() {
  return (
    <Suspense fallback={
      <main className="min-h-screen flex flex-col bg-background items-center justify-center">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </main>
    }>
      <ChatPageContent />
    </Suspense>
  )
}
