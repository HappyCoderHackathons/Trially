"use client"

import { useRouter } from "next/navigation"
import { TriallyLogo } from "@/components/trially-logo"
import { TriallySearchInput } from "@/components/trially-search-input"
import { BackgroundDecorations } from "@/components/background-decorations"

export default function Home() {
  const router = useRouter()

  const handleSearch = (query: string) => {
    if (query.trim()) {
      router.push(`/results?q=${encodeURIComponent(query)}`)
    }
  }

  return (
    <main className="min-h-screen flex flex-col items-center justify-center px-4 bg-background">
      {/* Subtle background gradient overlay */}
      <div className="fixed inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-primary/10 via-transparent to-transparent pointer-events-none" />
      
      {/* Medical-themed background decorations */}
      <BackgroundDecorations />
      
      <div className="relative z-10 flex flex-col items-center gap-16 w-full">
        {/* Logo Section */}
        <TriallyLogo size="lg" />

        {/* Search Input Section */}
        <TriallySearchInput onSubmit={handleSearch} />

        {/* Helpful text */}
        <p className="text-muted-foreground text-sm text-center max-w-md leading-relaxed">
          Search for clinical trials, upload medical documents, or use voice input to find the right trial for you.
        </p>
      </div>

      {/* Bottom decorative element */}
      <div className="fixed bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-primary/5 to-transparent pointer-events-none" />
    </main>
  )
}
