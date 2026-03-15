"use client"

import Link from "next/link"
import { Star } from "lucide-react"
import { useState } from "react"

export interface Trial {
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

interface TrialCardProps {
  trial: Trial
}

const STATUS_CONFIG: Record<Trial["enrollmentStatus"], { dot: string; badge: string; accent: string }> = {
  Recruiting:       { dot: "bg-emerald-500", badge: "text-emerald-700 bg-emerald-50 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-300 dark:border-emerald-800", accent: "border-l-emerald-500" },
  "Not Recruiting": { dot: "bg-amber-400",   badge: "text-amber-700 bg-amber-50 border-amber-200 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-800",             accent: "border-l-amber-400"   },
  Active:           { dot: "bg-sky-500",      badge: "text-sky-700 bg-sky-50 border-sky-200 dark:bg-sky-950 dark:text-sky-300 dark:border-sky-800",                         accent: "border-l-sky-500"     },
  Completed:        { dot: "bg-slate-400",    badge: "text-slate-600 bg-slate-50 border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700",             accent: "border-l-slate-400"   },
}

export function TrialCard({ trial }: TrialCardProps) {
  const [starred, setStarred] = useState(false)
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
      {/* Status badge + phase + star */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
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
        <button
          type="button"
          onClick={() => setStarred((prev) => !prev)}
          className="p-1 -mr-1 rounded-md text-muted-foreground hover:text-amber-400 hover:bg-muted/40 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label={starred ? "Unstar trial" : "Star trial"}
        >
          <Star className={`w-4 h-4 transition-colors ${starred ? "fill-amber-400 text-amber-400" : ""}`} />
        </button>
      </div>

      {/* Title */}
      <h3 className="font-serif text-[1.05rem] leading-snug text-foreground mb-2">
        {trial.nctId ? (
          <Link
            href={`https://clinicaltrials.gov/study/${trial.nctId}`}
            target="_blank"
            rel="noopener noreferrer"
            className="hover:underline underline-offset-2"
          >
            {trial.name}
          </Link>
        ) : (
          trial.name
        )}
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
