const defaultWsUrl =
  process.env.NEXT_PUBLIC_CHAT_WS_URL ??
  "wss://gwe4f7s6k4.execute-api.us-east-1.amazonaws.com/production/"

export type ChatHistoryItem = {
  role: "user" | "assistant" | "system"
  content: string
}

export async function sendChatMessage(
  message: string,
  history: ChatHistoryItem[] = [],
): Promise<string> {
  if (typeof window === "undefined") {
    throw new Error("Chat WebSocket is only available in the browser.")
  }

  const url = defaultWsUrl

  if (!url) {
    throw new Error(
      "Chat WebSocket URL is not configured. Set NEXT_PUBLIC_CHAT_WS_URL or update lib/chat-api.ts.",
    )
  }

  return new Promise<string>((resolve, reject) => {
    let settled = false

    const socket = new WebSocket(url)

    const cleanup = () => {
      if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING) {
        socket.close()
      }
      socket.onopen = null
      socket.onmessage = null
      socket.onerror = null
      socket.onclose = null
    }

    const timeoutId = window.setTimeout(() => {
      if (settled) return
      settled = true
      cleanup()
      reject(new Error("Chat WebSocket request timed out."))
    }, 15000)

    socket.onopen = () => {
      try {
        const payload = JSON.stringify({ message, history })
        socket.send(payload)
      } catch (err) {
        window.clearTimeout(timeoutId)
        if (!settled) {
          settled = true
          cleanup()
          reject(err instanceof Error ? err : new Error("Failed to send message over WebSocket."))
        }
      }
    }

    socket.onmessage = (event) => {
      if (settled) return
      window.clearTimeout(timeoutId)

      try {
        const data = typeof event.data === "string" ? JSON.parse(event.data) : event.data
        const reply =
          (data && typeof data === "object" && "reply" in data && data.reply) ||
          (typeof event.data === "string" ? event.data : null)

        if (!reply || typeof reply !== "string") {
          throw new Error("Chat WebSocket response did not contain a reply.")
        }

        settled = true
        cleanup()
        resolve(reply)
      } catch (err) {
        if (!settled) {
          settled = true
          cleanup()
          reject(
            err instanceof Error
              ? err
              : new Error("Failed to parse chat WebSocket response."),
          )
        }
      }
    }

    socket.onerror = () => {
      window.clearTimeout(timeoutId)
      if (!settled) {
        settled = true
        cleanup()
        reject(new Error("Chat WebSocket connection error."))
      }
    }

    socket.onclose = () => {
      window.clearTimeout(timeoutId)
      if (!settled) {
        settled = true
        cleanup()
        reject(new Error("Chat WebSocket closed before a reply was received."))
      }
    }
  })
}

