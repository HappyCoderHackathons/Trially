"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { TriallyLogo } from "@/components/trially-logo"
import { TriallySearchInput } from "@/components/trially-search-input"
import { BackgroundDecorations } from "@/components/background-decorations"
import { Button } from "@/components/ui/button"
import { AppHeader } from "@/components/app-header"

type StoredSession = {
  idToken: string
  accessToken: string
  refreshToken: string
}

const PENDING_FILE_KEY = "trially_pending_file"

export default function Home() {
  const router = useRouter()
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [userEmail, setUserEmail] = useState<string | null>(null)

  useEffect(() => {
    if (typeof window === "undefined") return

    try {
      const raw = window.localStorage.getItem("trially_cognito_session")
      if (!raw) {
        setIsAuthenticated(false)
        setUserEmail(null)
        return
      }

      const parsed = JSON.parse(raw) as StoredSession
      if (!parsed?.idToken) {
        setIsAuthenticated(false)
        setUserEmail(null)
        return
      }

      // Decode the JWT payload to get the email claim, if present
      const [, payloadBase64] = parsed.idToken.split(".")
      if (payloadBase64) {
        const json = JSON.parse(
          atob(payloadBase64.replace(/-/g, "+").replace(/_/g, "/")),
        ) as { email?: string; [key: string]: unknown }
        if (json.email && typeof json.email === "string") {
          setUserEmail(json.email)
        }
      }

      setIsAuthenticated(true)
    } catch {
      setIsAuthenticated(false)
      setUserEmail(null)
    }
  }, [])

  const handleSearch = (query: string, file?: File | null) => {
    const trimmed = query.trim()
    if (!trimmed) return

    if (typeof window !== "undefined" && file) {
      const reader = new FileReader()
      reader.onload = () => {
        try {
          const payload = {
            name: file.name,
            type: file.type,
            dataUrl: reader.result as string,
          }
          window.sessionStorage.setItem(PENDING_FILE_KEY, JSON.stringify(payload))
        } catch {
          // If serialization fails, just fall back to sending query only
        }
        router.push(`/chat?q=${encodeURIComponent(trimmed)}`)
      }
      reader.readAsDataURL(file)
      return
    }

    router.push(`/chat?q=${encodeURIComponent(trimmed)}`)
  }

  const handleSignOut = () => {
    if (typeof window !== "undefined") {
      window.localStorage.removeItem("trially_cognito_session")
    }
    setIsAuthenticated(false)
    setUserEmail(null)
  }

  return (
    <main className="min-h-screen flex flex-col bg-background">
      <AppHeader showDashboardLink />

      <div className="flex flex-1 flex-col items-center justify-center px-4">
      {/* Subtle background gradient overlay */}
      <div className="fixed inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-primary/10 via-transparent to-transparent pointer-events-none" />

      {/* Medical-themed background decorations */}
      <BackgroundDecorations />

      <div className="relative z-10 flex flex-col items-center gap-10 w-full">
        {/* Logo + auth state */}
        <div className="flex flex-col items-center gap-4">
          <TriallyLogo size="lg" />
          {isAuthenticated ? (
            <div className="flex items-center gap-3">
              <div className="text-sm text-muted-foreground">
                <span className="block text-foreground font-medium">
                  {userEmail ?? "Signed in"}
                </span>
                <span className="text-xs">
                  You’re signed in to Trially.
                </span>
              </div>
              <Button variant="outline" size="sm" onClick={handleSignOut}>
                Sign out
              </Button>
            </div>
          ) : (
            <Link href="/auth">
              <Button variant="outline" size="lg" className="dark:bg-yellow-400 dark:text-yellow-950 dark:border-yellow-400 dark:hover:bg-yellow-300 dark:hover:border-yellow-300">
                Log in / Sign up
              </Button>
            </Link>
          )}
        </div>

        {/* Search Input Section */}
        <TriallySearchInput onSubmit={handleSearch} />

        {/* Helpful text */}
        <p className="text-muted-foreground text-sm text-center max-w-md leading-relaxed">
          Search for clinical trials, upload medical documents, or use voice input to find the right trial for you.
        </p>
      </div>

      {/* Bottom decorative element */}
      <div className="fixed bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-primary/5 to-transparent pointer-events-none" />
      </div>
    </main>
  )
}
