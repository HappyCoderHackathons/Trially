export type ChatHistoryItem = {
  role: "user" | "assistant" | "system"
  content: string
}

export async function sendChatMessage(
  message: string,
  history: ChatHistoryItem[] = [],
): Promise<string> {
  const endpoint =
    (process.env.NEXT_PUBLIC_CHAT_API_URL ??
    "https://pfwjvqox9h.execute-api.us-east-1.amazonaws.com/prod/") + "chat"

  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ message, history }),
  })

  if (!res.ok) {
    const text = await res.text().catch(() => "")
    throw new Error(
      text || `Chat API request failed with status ${res.status}.`,
    )
  }

  const data = (await res.json().catch(() => ({}))) as { reply?: string }

  if (!data.reply) {
    throw new Error("Chat API response did not contain a reply.")
  }

  return data.reply
}

