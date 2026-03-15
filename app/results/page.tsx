"use client"

import { Suspense, useState, useEffect, useMemo } from "react"
import { useSearchParams } from "next/navigation"
import Link from "next/link"
import Image from "next/image"
import { TrialCard, Trial } from "@/components/trial-card"
import { Pagination } from "@/components/pagination"
import { BackgroundDecorations } from "@/components/background-decorations"
import { ArrowLeft } from "lucide-react"

interface ApiStudy {
  title: string | null
  description: string | null
  status: string | null
  location: string | null
  sponsor: string | null
  phase: string | null
  participants: number | null
  startDate: string | null
}

function mapEnrollmentStatus(status: string | null): Trial["enrollmentStatus"] {
  switch (status) {
    case "RECRUITING": return "Recruiting"
    case "NOT_YET_RECRUITING": return "Not Recruiting"
    case "ACTIVE_NOT_RECRUITING": return "Active"
    case "COMPLETED": return "Completed"
    default: return "Not Recruiting"
  }
}

function normalizePhase(phase: string | null): string {
  if (!phase) return "N/A"
  return phase.replace(/PHASE(\d)/gi, "$1")
}

const ITEMS_PER_PAGE = 4

function ResultsPageContent() {
  const searchParams = useSearchParams()
  const uuid = searchParams.get("uuid")
  const [currentPage, setCurrentPage] = useState(1)
  const [trials, setTrials] = useState<Trial[]>([])
  const [aiSummary, setAiSummary] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [total, setTotal] = useState(0)

  useEffect(() => {
    if (!uuid) return
    setLoading(true)
    setError(null)
    setTrials([])
    setAiSummary(null)

    fetch("/api/trials-search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ uuid }),
    })
      .then((res) => res.json())
      .then((data) => {
        if (data.error) {
          setError(data.error)
          return
        }
        const mapped: Trial[] = (data.studies ?? []).map((s: ApiStudy, i: number) => ({
          id: String(i + 1),
          name: s.title ?? "Untitled Trial",
          description: s.description ?? "",
          location: s.location ?? "Location not specified",
          sponsor: s.sponsor ?? "Unknown",
          phase: normalizePhase(s.phase),
          enrollmentStatus: mapEnrollmentStatus(s.status),
          startDate: s.startDate ?? "Unknown",
          participantsNeeded: s.participants ?? 0,
        }))
        setTrials(mapped)
        setTotal(data.total ?? mapped.length)
        setAiSummary(data.aiSummary ?? null)
      })
      .catch((err) => setError(String(err)))
      .finally(() => setLoading(false))
  }, [uuid])

  const totalPages = Math.ceil(trials.length / ITEMS_PER_PAGE)

  const paginatedTrials = useMemo(() => {
    const start = (currentPage - 1) * ITEMS_PER_PAGE
    return trials.slice(start, start + ITEMS_PER_PAGE)
  }, [trials, currentPage])

  const handlePageChange = (page: number) => {
    setCurrentPage(page)
    window.scrollTo({ top: 0, behavior: "smooth" })
  }

  return (
    <main className="min-h-screen bg-background">
      <div className="fixed inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-primary/10 via-transparent to-transparent pointer-events-none" />
      <BackgroundDecorations />

      {/* Header */}
      <header className="sticky top-0 z-20 bg-background/80 backdrop-blur-md border-b">
        <div className="max-w-6xl mx-auto px-4 py-4">
          <div className="flex items-center gap-6">
            <Link
              href="/"
              className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors"
            >
              <ArrowLeft className="w-5 h-5" />
              <span className="hidden sm:inline">Back</span>
            </Link>

            <Link href="/" className="flex items-center gap-3">
              <Image
                src="/trially-logo.jpg"
                alt="Trially"
                width={36}
                height={36}
                className="rounded-full"
              />
              <span className="text-xl font-light text-primary">Trially</span>
            </Link>
          </div>
        </div>
      </header>

      {/* Results Section */}
      <section className="relative z-10 max-w-6xl mx-auto px-4 py-8">
        {!uuid ? (
          <div className="text-center py-16">
            <p className="text-lg text-muted-foreground">No patient session found. Please start from the home page.</p>
            <Link href="/" className="mt-4 inline-block text-primary underline">Go home</Link>
          </div>
        ) : loading ? (
          <div className="flex flex-col items-center justify-center py-24 gap-4">
            <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            <p className="text-muted-foreground">Finding matching clinical trials…</p>
          </div>
        ) : error ? (
          <div className="text-center py-16">
            <p className="text-lg text-destructive">Error: {error}</p>
            <Link href="/" className="mt-4 inline-block text-primary underline">Go home</Link>
          </div>
        ) : (
          <>
            <div className="mb-8">
              <h1 className="text-2xl font-semibold text-foreground mb-2">
                Matched Clinical Trials
              </h1>
              <p className="text-muted-foreground">
                Found {total} clinical {total === 1 ? "trial" : "trials"} matching your profile
              </p>
            </div>

            {paginatedTrials.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-10">
                {paginatedTrials.map((trial) => (
                  <TrialCard key={trial.id} trial={trial} />
                ))}
              </div>
            ) : (
              <div className="text-center py-16">
                <p className="text-lg text-muted-foreground">
                  No matching trials found for your profile.
                </p>
              </div>
            )}

            {totalPages > 1 && (
              <Pagination
                currentPage={currentPage}
                totalPages={totalPages}
                onPageChange={handlePageChange}
              />
            )}

            {aiSummary && (
              <div className="mt-10 p-6 rounded-2xl bg-card/80 border border-border backdrop-blur-sm">
                <h2 className="text-lg font-semibold text-foreground mb-3">AI Analysis</h2>
                <p className="text-sm text-muted-foreground whitespace-pre-wrap leading-relaxed">{aiSummary}</p>
              </div>
            )}
          </>
        )}
      </section>

      <div className="fixed bottom-0 left-0 right-0 h-24 bg-gradient-to-t from-primary/5 to-transparent pointer-events-none" />
    </main>
  )
}

export default function ResultsPage() {
  return (
    <Suspense fallback={
      <main className="min-h-screen flex flex-col bg-background items-center justify-center">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </main>
    }>
      <ResultsPageContent />
    </Suspense>
  )
}
