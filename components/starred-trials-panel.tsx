"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { Star } from "lucide-react"
import { TrialCard, type Trial } from "@/components/trial-card"
import { getIdToken } from "@/lib/aws-credentials"

interface StarredTrialRecord {
  userId: string
  trialId: string
  createdAt: string
  trial?: string
}

function parseTrialRecord(record: StarredTrialRecord): Trial | null {
  try {
    const raw = typeof record.trial === "string" ? JSON.parse(record.trial) : record.trial
    if (!raw || typeof raw !== "object") return null
    return {
      id: record.trialId,
      nctId: raw.nctId ?? null,
      name: raw.name ?? "Untitled Trial",
      description: raw.description ?? "",
      location: raw.location ?? null,
      sponsor: raw.sponsor ?? null,
      phase: raw.phase ?? "",
      enrollmentStatus: raw.enrollmentStatus ?? "Not Recruiting",
      startDate: raw.startDate ?? null,
      participantsNeeded: raw.participantsNeeded ?? null,
    }
  } catch {
    return null
  }
}

// ── Skeleton ────────────────────────────────────────────────────────────────

function Skeleton() {
  return (
    <div className="flex flex-col h-full">
      <div className="px-5 py-4 border-b border-border shrink-0">
        <div className="h-3 w-24 bg-muted rounded animate-pulse mb-2" />
        <div className="h-6 w-36 bg-muted rounded animate-pulse" />
      </div>
      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="rounded-r-xl border border-border border-l-4 border-l-border bg-card pl-5 pr-6 py-5">
            <div className="flex gap-2 mb-3">
              <div className="h-5 w-20 bg-muted rounded-full animate-pulse" />
              <div className="h-5 w-14 bg-muted rounded-full animate-pulse" />
            </div>
            <div className="h-4 w-5/6 bg-muted rounded animate-pulse mb-2" />
            <div className="h-3 w-3/4 bg-muted/60 rounded animate-pulse mb-3" />
            <div className="h-3 w-full bg-muted/40 rounded animate-pulse" />
            <div className="h-3 w-5/6 bg-muted/40 rounded animate-pulse mt-1.5" />
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Main component ───────────────────────────────────────────────────────────

export function StarredTrialsPanel() {
  const [trials, setTrials] = useState<Trial[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const token = getIdToken()
    if (!token) {
      setLoading(false)
      setError("Not signed in")
      return
    }

    fetch("/api/trials/starred", {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => res.json())
      .then((data) => {
        if (data.error) { setError(data.error); return }
        const parsed = (data.items ?? [])
          .map(parseTrialRecord)
          .filter((t: Trial | null): t is Trial => t !== null)
        setTrials(parsed)
      })
      .catch((err) => setError(String(err)))
      .finally(() => setLoading(false))
  }, [])

  // ── Render states ────────────────────────────────────────────────────────

  if (loading) return <Skeleton />

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 px-6 text-center">
        <p className="text-[13px] text-destructive">{error}</p>
        <button
          onClick={() => window.location.reload()}
          className="text-[12px] text-primary underline underline-offset-4"
        >
          Retry
        </button>
      </div>
    )
  }

  if (trials.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-5 px-8 text-center">
        <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center">
          <Star className="w-5 h-5 text-muted-foreground" />
        </div>
        <div className="space-y-1.5">
          <p className="text-[14px] font-medium text-foreground">No saved trials</p>
          <p className="text-[12px] text-muted-foreground leading-relaxed max-w-[200px]">
            Save trials from your results to keep track of them here.
          </p>
        </div>
        <Link
          href="/"
          className="text-[12px] font-medium px-4 py-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          Start a search
        </Link>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full bg-card">
      {/* Header */}
      <div className="px-5 py-4 border-b border-border shrink-0">
        <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground mb-0.5">
          Saved Trials
        </p>
        <p className="font-serif text-xl text-foreground leading-tight">
          {trials.length} {trials.length === 1 ? "trial" : "trials"} saved
        </p>
      </div>

      {/* Trial list */}
      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
        {trials.map((trial) => (
          <TrialCard key={trial.id} trial={trial} initialSaved={true} />
        ))}
      </div>
    </div>
  )
}
