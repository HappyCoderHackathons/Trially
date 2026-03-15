"use client"

import { Suspense, useState, useEffect, useMemo } from "react"
import { useSearchParams } from "next/navigation"
import Link from "next/link"
import { Pagination } from "@/components/pagination"
import { AppHeader } from "@/components/app-header"
import { Skeleton } from "@/components/ui/skeleton"
import { TrialCard } from "@/components/trial-card"
import { getIdToken } from "@/lib/aws-credentials"

interface ApiStudy {
  nctId: string | null
  title: string | null
  description: string | null
  status: string | null
  location: string | null
  sponsor: string | null
  phase: string | null
  participants: number | null
  startDate: string | null
}

interface Trial {
  id: string
  nctId: string | null
  name: string
  description: string
  location: string | null
  sponsor: string | null
  phase: string
  enrollmentStatus: "Recruiting" | "Not Recruiting" | "Completed" | "Active"
  startDate: string | null
  participantsNeeded: number | null
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
  if (!phase) return ""
  return phase.replace(/PHASE(\d)/gi, "$1")
}

// Fully static class strings so Tailwind JIT can detect them
const STATUS_CONFIG: Record<Trial["enrollmentStatus"], { dot: string; badge: string; accent: string }> = {
  Recruiting:       { dot: "bg-emerald-500", badge: "text-emerald-700 bg-emerald-50 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-300 dark:border-emerald-800", accent: "border-l-emerald-500" },
  "Not Recruiting": { dot: "bg-amber-400",   badge: "text-amber-700 bg-amber-50 border-amber-200 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-800",             accent: "border-l-amber-400"   },
  Active:           { dot: "bg-sky-500",      badge: "text-sky-700 bg-sky-50 border-sky-200 dark:bg-sky-950 dark:text-sky-300 dark:border-sky-800",                         accent: "border-l-sky-500"     },
  Completed:        { dot: "bg-slate-400",    badge: "text-slate-600 bg-slate-50 border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700",             accent: "border-l-slate-400"   },
}

const ITEMS_PER_PAGE = 6

function TrialResultCard({ trial }: { trial: Trial }) {
  const cfg = STATUS_CONFIG[trial.enrollmentStatus]

  const meta = [
    trial.location,
    trial.sponsor,
    trial.participantsNeeded != null ? `${trial.participantsNeeded.toLocaleString()} participants` : null,
    trial.startDate ? `Started ${trial.startDate}` : null,
  ].filter(Boolean) as string[]

  return (
    <article
      className={`bg-card border border-border border-l-4 ${cfg.accent} rounded-r-xl pl-5 pr-6 py-5 hover:shadow-sm transition-shadow duration-150`}
    >
      {/* Status badge + Phase */}
      <div className="flex items-center justify-between mb-3">
        <span className={`inline-flex items-center gap-1.5 text-[11px] font-medium px-2 py-0.5 rounded-full border ${cfg.badge}`}>
          <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${cfg.dot}`} />
          {trial.enrollmentStatus}
        </span>
        {trial.phase && (
          <span className="text-[11px] font-medium text-muted-foreground bg-muted px-2 py-0.5 rounded-full border border-border">
            Phase {trial.phase}
          </span>
        )}
      </div>

      {/* Title — serif for warmth and authority */}
      <h3 className="font-serif text-[1.05rem] leading-snug text-foreground mb-2">
        {trial.name}
      </h3>

      {/* Meta */}
      {meta.length > 0 && (
        <p className="text-[11px] tracking-wide text-muted-foreground mb-3">
          {meta.join(" · ")}
        </p>
      )}

      {/* Description */}
      {trial.description && (
        <p className="text-[13px] leading-[1.75] text-foreground/70">
          {trial.description}
        </p>
      )}
    </article>
  )
}

function ResultsPageContent() {
  const searchParams = useSearchParams()
  const uuid = searchParams.get("uuid")

  const [currentPage, setCurrentPage] = useState(1)
  const [trials, setTrials] = useState<Trial[]>([])
  const [rawStudies, setRawStudies] = useState<ApiStudy[]>([])
  const [aiSummary, setAiSummary] = useState<string | null>(null)
  const [aiLoading, setAiLoading] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [total, setTotal] = useState(0)
  const [starredIds, setStarredIds] = useState<Set<string>>(new Set())

  // Phase 1: fetch trials
  useEffect(() => {
    if (!uuid) return
    const controller = new AbortController()

    setLoading(true)
    setError(null)
    setTrials([])
    setRawStudies([])
    setAiSummary(null)

    fetch("/api/trials-search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ uuid }),
      signal: controller.signal,
    })
      .then((res) => res.json())
      .then((data) => {
        if (data.error) { setError(data.error); setLoading(false); return }
        const raw: ApiStudy[] = data.studies ?? []
        const mapped: Trial[] = raw.map((s: ApiStudy, i: number) => ({
          id: String(i + 1),
          nctId: s.nctId ?? null,
          name: s.title ?? "Untitled Trial",
          description: s.description ?? "",
          location: s.location,
          sponsor: s.sponsor,
          phase: normalizePhase(s.phase),
          enrollmentStatus: mapEnrollmentStatus(s.status),
          startDate: s.startDate,
          participantsNeeded: s.participants,
        }))
        setTrials(mapped)
        setRawStudies(raw)
        setTotal(data.total ?? mapped.length)
        setLoading(false)
      })
      .catch((err) => {
        if ((err as Error).name === "AbortError") return
        setError(String(err))
        setLoading(false)
      })

    return () => controller.abort()
  }, [uuid])

  // Fetch starred trial IDs so cards can show correct initial state
  useEffect(() => {
    const token = getIdToken()
    if (!token) return
    fetch("/api/trials/starred", { headers: { Authorization: `Bearer ${token}` } })
      .then((res) => res.json())
      .then((data) => {
        const ids = new Set<string>(
          (data.items ?? []).map((item: { trialId: string }) => item.trialId)
        )
        setStarredIds(ids)
      })
      .catch(() => {/* non-fatal */})
  }, [])

  // Phase 2: fetch AI summary once trials are ready
  useEffect(() => {
    if (!uuid || rawStudies.length === 0) return
    const controller = new AbortController()

    setAiLoading(true)
    setAiSummary(null)

    fetch("/api/ai-summary", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ uuid, studies: rawStudies }),
      signal: controller.signal,
    })
      .then((res) => res.json())
      .then((data) => {
        if (data.aiSummary) setAiSummary(data.aiSummary)
        setAiLoading(false)
      })
      .catch((err) => {
        if ((err as Error).name === "AbortError") return
        setAiLoading(false)
      })

    return () => controller.abort()
  }, [uuid, rawStudies])

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
      {/* Subtle background wash */}
      <div className="fixed inset-0 bg-[radial-gradient(ellipse_80%_50%_at_50%_-10%,hsl(var(--primary)/0.04),transparent)] pointer-events-none" />

      <AppHeader
        backLink={{ href: "/", label: "Back" }}
        showDashboardLink
        className="sticky top-0 z-20 bg-background/90 backdrop-blur-sm border-border/60"
      />

      {/* Body */}
      <div className="max-w-2xl mx-auto px-6 py-10 pb-20">

        {/* — No UUID — */}
        {!uuid && (
          <div className="flex flex-col items-center justify-center min-h-[40vh] gap-3 text-center">
            <p className="text-sm text-muted-foreground">No session found.</p>
            <Link href="/" className="text-xs text-primary underline underline-offset-4">Start a new search</Link>
          </div>
        )}

        {/* — Loading — */}
        {uuid && loading && (
          <div className="space-y-8">
            <div className="flex items-baseline gap-2.5">
              <Skeleton className="h-9 w-12 rounded" />
              <Skeleton className="h-4 w-28 rounded" />
            </div>
            <div className="space-y-3">
              {[1, 2, 3, 4].map((i) => (
                <div
                  key={i}
                  className="rounded-r-xl border border-border border-l-4 border-l-border bg-card pl-5 pr-6 py-5"
                >
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex gap-2">
                      <Skeleton className="h-5 w-20 rounded-full" />
                      <Skeleton className="h-5 w-14 rounded-full" />
                    </div>
                  </div>
                  <Skeleton className="mb-2 h-4 w-full max-w-[90%] rounded" />
                  <Skeleton className="mb-3 h-3 w-3/4 rounded" />
                  <Skeleton className="h-3 w-full rounded" />
                  <Skeleton className="mt-1.5 h-3 w-full rounded" />
                  <Skeleton className="mt-1 h-3 w-5/6 rounded" />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* — Error — */}
        {uuid && !loading && error && (
          <div className="flex flex-col items-center justify-center min-h-[40vh] gap-3 text-center">
            <p className="text-sm text-destructive">{error}</p>
            <Link href="/" className="text-xs text-primary underline underline-offset-4">Start a new search</Link>
          </div>
        )}

        {/* — Results — */}
        {uuid && !loading && !error && (
          <div className="space-y-8">

            {/* Count heading */}
            <div className="flex items-baseline gap-2.5">
              <span className="font-serif text-3xl text-foreground">{total}</span>
              <span className="text-[13px] text-muted-foreground">
                {total === 1 ? "trial matched" : "trials matched"}
              </span>
            </div>

            {/* Trial cards */}
            {paginatedTrials.length > 0 ? (
              <div className="space-y-3">
                {paginatedTrials.map((trial) => (
                  <TrialCard
                    key={trial.nctId ?? trial.id}
                    trial={trial}
                    initialSaved={starredIds.has(trial.nctId ?? trial.id)}
                  />
                ))}
              </div>
            ) : (
              <p className="text-[13px] text-muted-foreground py-10 text-center">
                No matching trials found for your profile.
              </p>
            )}

            {/* Pagination */}
            {totalPages > 1 && (
              <Pagination
                currentPage={currentPage}
                totalPages={totalPages}
                onPageChange={handlePageChange}
              />
            )}

            {/* AI Analysis */}
            {(aiLoading || aiSummary) && (
              <section className="rounded-xl border border-border bg-card/50 px-5 py-5">
                <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground mb-3">
                  AI Analysis
                </p>
                {aiLoading ? (
                  <div className="flex items-center gap-2.5">
                    <div className="w-3.5 h-3.5 border-2 border-primary border-t-transparent rounded-full animate-spin shrink-0" />
                    <p className="text-[12px] text-muted-foreground">Generating analysis…</p>
                  </div>
                ) : (
                  <p className="text-[13px] leading-[1.8] text-foreground/75 whitespace-pre-wrap">{aiSummary}</p>
                )}
              </section>
            )}

            {/* Transparency link */}
            <div className="text-center pt-2">
              <Link
                href={`/transparency?uuid=${encodeURIComponent(uuid ?? "")}`}
                className="text-[12px] text-muted-foreground/60 hover:text-muted-foreground underline underline-offset-4 transition-colors"
              >
                How did we find these?
              </Link>
            </div>

          </div>
        )}
      </div>
    </main>
  )
}

export default function ResultsPage() {
  return (
    <Suspense fallback={
      <main className="min-h-screen flex items-center justify-center bg-background">
        <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </main>
    }>
      <ResultsPageContent />
    </Suspense>
  )
}
