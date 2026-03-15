"use client"

import { Suspense, useState, useEffect } from "react"
import { useSearchParams } from "next/navigation"
import Link from "next/link"
import { AppHeader } from "@/components/app-header"
import { getIdToken } from "@/lib/aws-credentials"
import type { TrialDetail } from "@/app/api/compare/route"

// ── Status display helpers ───────────────────────────────────────────────────

const STATUS_LABELS: Record<string, string> = {
  RECRUITING: "Recruiting",
  NOT_YET_RECRUITING: "Not Yet Recruiting",
  ACTIVE_NOT_RECRUITING: "Active, Not Recruiting",
  COMPLETED: "Completed",
  TERMINATED: "Terminated",
  WITHDRAWN: "Withdrawn",
  SUSPENDED: "Suspended",
  ENROLLING_BY_INVITATION: "By Invitation",
}

const STATUS_COLORS: Record<string, string> = {
  RECRUITING: "text-emerald-600 dark:text-emerald-400",
  NOT_YET_RECRUITING: "text-amber-600 dark:text-amber-400",
  ACTIVE_NOT_RECRUITING: "text-sky-600 dark:text-sky-400",
  COMPLETED: "text-slate-500 dark:text-slate-400",
}

function normalizeStatus(s: string) {
  return (
    STATUS_LABELS[s] ??
    s.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase())
  )
}

function statusColor(s: string) {
  return STATUS_COLORS[s] ?? "text-muted-foreground"
}

// ── Cell components ──────────────────────────────────────────────────────────

function EmptyCell() {
  return <span className="text-muted-foreground/40 italic text-[12px]">—</span>
}

function TextCell({ value }: { value: string | number | null | undefined }) {
  if (value == null || value === "") return <EmptyCell />
  return <span className="text-[13px] leading-relaxed">{String(value)}</span>
}

function ExpandableCell({ text, maxLen = 300 }: { text: string; maxLen?: number }) {
  const [expanded, setExpanded] = useState(false)
  if (!text) return <EmptyCell />
  if (text.length <= maxLen) {
    return <span className="text-[13px] leading-relaxed whitespace-pre-wrap">{text}</span>
  }
  return (
    <span>
      <span className="text-[13px] leading-relaxed whitespace-pre-wrap">
        {expanded ? text : text.slice(0, maxLen) + "…"}
      </span>
      <button
        onClick={() => setExpanded((e) => !e)}
        className="ml-1.5 text-[11px] text-primary underline underline-offset-2 hover:no-underline shrink-0"
      >
        {expanded ? "Show less" : "Show more"}
      </button>
    </span>
  )
}

function ListCell({ items }: { items: string[] }) {
  if (!items.length) return <EmptyCell />
  return (
    <ul className="space-y-1.5">
      {items.map((item, i) => (
        <li key={i} className="text-[13px] leading-relaxed">
          {item}
        </li>
      ))}
    </ul>
  )
}

// ── Row definitions ──────────────────────────────────────────────────────────

interface RowDef {
  label: string
  render: (trial: TrialDetail) => React.ReactNode
}

const ROWS: RowDef[] = [
  {
    label: "Status",
    render: (t) => (
      <span className={`text-[13px] font-medium ${statusColor(t.status)}`}>
        {normalizeStatus(t.status)}
      </span>
    ),
  },
  { label: "Phase", render: (t) => <TextCell value={t.phases || "—"} /> },
  { label: "Sponsor", render: (t) => <TextCell value={t.sponsor} /> },
  { label: "Conditions", render: (t) => <TextCell value={t.conditions} /> },
  {
    label: "Enrollment",
    render: (t) => (
      <TextCell
        value={t.enrollment != null ? `${t.enrollment.toLocaleString()} participants` : null}
      />
    ),
  },
  { label: "Start Date", render: (t) => <TextCell value={t.startDate} /> },
  { label: "Age Range", render: (t) => <TextCell value={t.ageRange} /> },
  { label: "Sex", render: (t) => <TextCell value={t.sex} /> },
  { label: "Locations", render: (t) => <ListCell items={t.locations} /> },
  { label: "Contacts", render: (t) => <ListCell items={t.centralContacts} /> },
  { label: "Primary Outcomes", render: (t) => <ListCell items={t.primaryOutcomes} /> },
  { label: "Secondary Outcomes", render: (t) => <ListCell items={t.secondaryOutcomes} /> },
  {
    label: "Brief Summary",
    render: (t) => <ExpandableCell text={t.briefSummary} />,
  },
  {
    label: "Eligibility Criteria",
    render: (t) => <ExpandableCell text={t.eligibilityCriteria} maxLen={500} />,
  },
]

// ── Skeleton ─────────────────────────────────────────────────────────────────

function TableSkeleton({ count }: { count: number }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-border animate-pulse">
      <table className="w-full border-collapse">
        <thead>
          <tr className="border-b border-border">
            <th className="w-36 px-4 py-4 border-r border-border">
              <div className="h-3 w-10 bg-muted rounded" />
            </th>
            {Array.from({ length: count }).map((_, i) => (
              <th key={i} className="px-5 py-4 border-r last:border-0 border-border">
                <div className="h-3 w-20 bg-muted rounded mb-2" />
                <div className="h-4 w-40 bg-muted rounded" />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {ROWS.map((_, ri) => (
            <tr key={ri} className="border-b last:border-0 border-border">
              <td className="px-4 py-3.5 border-r border-border">
                <div className="h-3 w-24 bg-muted rounded" />
              </td>
              {Array.from({ length: count }).map((_, i) => (
                <td key={i} className="px-5 py-3.5 border-r last:border-0 border-border">
                  <div className="h-3 w-32 bg-muted rounded" />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ── Main page content ────────────────────────────────────────────────────────

function ComparePageContent() {
  const searchParams = useSearchParams()
  const ids = (searchParams.get("ids") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 3)

  const [trials, setTrials] = useState<TrialDetail[]>([])
  const [comparison, setComparison] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (ids.length < 2) return
    const controller = new AbortController()
    const { signal } = controller
    const token = getIdToken()
    setLoading(true)
    setError(null)

    fetch("/api/compare", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ nctIds: ids }),
      signal,
    })
      .then((res) => res.json())
      .then((data: { error?: string; trials?: TrialDetail[] }) => {
        if (data.error) {
          setError(data.error)
          return
        }
        const trials = data.trials ?? []
        setTrials(trials)

        // Fire off LLM comparison request using the same trials
        if (trials.length >= 2) {
          return fetch("/api/compare/llm", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              ...(token ? { Authorization: `Bearer ${token}` } : {}),
            },
            body: JSON.stringify({ trials }),
            signal,
          })
            .then((res) => res.json())
            .then((llmData: { error?: string; comparison?: string }) => {
              if (llmData.comparison) {
                setComparison(llmData.comparison)
              }
            })
            .catch(() => {
              // LLM failure is non-fatal; comparison section will just keep showing loader
            })
        }
      })
      .catch((err: unknown) => {
        if ((err as { name?: string }).name !== "AbortError") setError(String(err))
      })
      .finally(() => setLoading(false))

    return () => controller.abort()
  }, [ids.join(",")])

  return (
    <main className="min-h-screen bg-background">
      <div className="fixed inset-0 bg-[radial-gradient(ellipse_80%_50%_at_50%_-10%,hsl(var(--primary)/0.04),transparent)] pointer-events-none" />

      <AppHeader
        backLink={{ href: "/dashboard", label: "Dashboard" }}
        showDashboardLink
        className="sticky top-0 z-20 bg-background/90 backdrop-blur-sm border-border/60"
      />

      <div className="px-6 py-10 pb-24 max-w-7xl mx-auto">
        {/* Heading */}
        <div className="mb-8">
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground mb-1">
            Trial Comparison
          </p>
          <h1 className="font-serif text-2xl text-foreground">
            Comparing {ids.length} {ids.length === 1 ? "trial" : "trials"}
          </h1>
        </div>

        {/* No IDs */}
        {ids.length < 2 && (
          <div className="flex flex-col items-center justify-center py-24 gap-3 text-center">
            <p className="text-[14px] text-muted-foreground">
              Select 2–3 saved trials to compare.
            </p>
            <Link
              href="/dashboard"
              className="text-[12px] font-medium px-4 py-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
            >
              Go to saved trials
            </Link>
          </div>
        )}

        {/* Loading */}
        {loading && <TableSkeleton count={ids.length} />}

        {/* Error */}
        {!loading && error && (
          <div className="flex flex-col items-center justify-center py-24 gap-3 text-center">
            <p className="text-[13px] text-destructive">{error}</p>
            <Link
              href="/dashboard"
              className="text-[12px] text-primary underline underline-offset-4"
            >
              Back to dashboard
            </Link>
          </div>
        )}

        {/* Content */}
        {!loading && !error && trials.length >= 2 && (
          <div className="space-y-8">
            {/* Comparison table */}
            <div className="overflow-x-auto rounded-xl border border-border">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="border-b border-border bg-muted/30">
                    <th className="sticky left-0 z-10 bg-muted/30 w-36 min-w-[9rem] px-4 py-4 text-left border-r border-border">
                      <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                        Field
                      </span>
                    </th>
                    {trials.map((trial, i) => (
                      <th
                        key={trial.nctId}
                        className={`min-w-[14rem] w-72 px-5 py-4 text-left align-top ${
                          i < trials.length - 1 ? "border-r border-border" : ""
                        }`}
                      >
                        <Link
                          href={`https://clinicaltrials.gov/study/${trial.nctId}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[10px] font-mono text-primary hover:underline underline-offset-2 block mb-1.5"
                        >
                          {trial.nctId}
                        </Link>
                        <span className="text-[13px] font-semibold text-foreground leading-snug">
                          {trial.title}
                        </span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {ROWS.map((row, ri) => (
                    <tr
                      key={row.label}
                      className={`border-b border-border last:border-0 ${
                        ri % 2 === 1 ? "bg-muted/10" : "bg-background"
                      }`}
                    >
                      <td className="sticky left-0 z-10 bg-inherit px-4 py-3.5 border-r border-border align-top">
                        <span className="text-[11px] font-medium text-muted-foreground">
                          {row.label}
                        </span>
                      </td>
                      {trials.map((trial, i) => (
                        <td
                          key={trial.nctId}
                          className={`px-5 py-3.5 align-top ${
                            i < trials.length - 1 ? "border-r border-border" : ""
                          }`}
                        >
                          {row.render(trial)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* AI Analysis */}
            {comparison && (
              <section className="rounded-xl border border-border bg-card/50 px-6 py-5">
                <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground mb-4">
                  AI Analysis
                </p>
                <p className="text-[13px] leading-[1.85] text-foreground/75 whitespace-pre-wrap">
                  {comparison}
                </p>
              </section>
            )}

            {/* AI analysis loading / fallback */}
            {!comparison && (
              <div className="flex items-center justify-center gap-2 py-3 text-[12px] text-muted-foreground">
                <div className="w-3 h-3 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                <span>Analyzing these trials with AI…</span>
              </div>
            )}
          </div>
        )}
      </div>
    </main>
  )
}

export default function ComparePage() {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen flex items-center justify-center bg-background">
          <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </main>
      }
    >
      <ComparePageContent />
    </Suspense>
  )
}
