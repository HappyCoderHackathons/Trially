import { cn } from "@/lib/utils"

interface ChatMessageProps {
  content: string
  sender: "user" | "ai"
  timestamp?: string
}

export function ChatMessage({ content, sender, timestamp }: ChatMessageProps) {
  const isUser = sender === "user"
  
  return (
    <div className={cn("flex w-full mb-4", isUser ? "justify-end" : "justify-start")}>
      <div className={cn("flex flex-col max-w-[75%] md:max-w-[60%]")}>
        <div
          className={cn(
            "px-4 py-3 rounded-2xl text-sm leading-relaxed",
            isUser
              ? "bg-primary text-primary-foreground rounded-br-md"
              : "bg-card border border-border text-card-foreground rounded-bl-md shadow-sm"
          )}
        >
          {content}
        </div>
        {timestamp && (
          <span
            className={cn(
              "text-xs text-muted-foreground mt-1",
              isUser ? "text-right" : "text-left"
            )}
          >
            {timestamp}
          </span>
        )}
      </div>
    </div>
  )
}
