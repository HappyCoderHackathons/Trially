"use client"

import { Suspense, useEffect, useState } from "react"
import { useSearchParams } from "next/navigation"
import Link from "next/link"
import { AppHeader } from "@/components/app-header"

interface PipelineStep {
  step_name: string
  service: string | null
  model: string | null
  started_at: string | null
  completed_at: string | null
  metadata: Record<string, unknown> | null
}

const STEP_CONFIG: Record<string, { label: string; description: string }> = {
  medical_parsing: {
    label: "Medical Entity Extraction",
    description: "Analyzed your health summary using AWS Comprehend Medical to identify conditions, medications, and codes.",
  },
  connect_llm: {
    label: "Patient Profile Generation",
    description: "Built a structured patient profile from your extracted medical data to use as a search query.",
  },
  trials_search: {
    label: "Trial Search",
    description: "Searched ClinicalTrials.gov for active recruiting trials matching your profile.",
  },
  show_result: {
    label: "AI Summary",
    description: "Generated personalized recommendations from the matched trials.",
  },
}

function formatDuration(started: string | null, completed: string | null): string | null {
  if (!started || !completed) return null
  const ms = new Date(completed).getTime() - new Date(started).getTime()
  if (isNaN(ms) || ms < 0) return null
  return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`
}

function StepDetail({ step }: { step: PipelineStep }) {
  const m = step.metadata
  if (!m) return null

  const parts: string[] = []

  if (step.step_name === "medical_parsing") {
    const counts = m.entity_counts as Record<string, number> | undefined
    if (counts) {
      if (counts.medical_entities) parts.push(`${counts.medical_entities} medical entities`)
      if (counts.phi_data) parts.push(`${counts.phi_data} PHI items`)
      if (counts.icd10_codes) parts.push(`${counts.icd10_codes} ICD-10 codes`)
      if (counts.rx_norm) parts.push(`${counts.rx_norm} medications`)
      if (counts.snomed_ct) parts.push(`${counts.snomed_ct} SNOMED codes`)
    }
  }

  if (step.step_name === "connect_llm") {
    if (m.model) parts.push(String(m.model).split("/").pop() ?? String(m.model))
    if (m.prompt_length) parts.push(`${m.prompt_length} char prompt`)
  }

  if (step.step_name === "trials_search") {
    if (m.query_cond) parts.push(`Query: "${m.query_cond}"`)
    if (m.raw_total != null) parts.push(`${m.raw_total} found`)
    if (m.filtered_total != null) parts.push(`${m.filtered_total} matched`)
    if (m.cache_hit != null) parts.push(m.cache_hit ? "cache hit" : "cache miss")
  }

  if (step.step_name === "show_result") {
    if (m.model) parts.push(String(m.model).split("/").pop() ?? String(m.model))
    if (m.trials_processed != null) parts.push(`${m.trials_processed} trials summarized`)
  }

  if (parts.length === 0) return null

  return (
    <p className="text-[11px] text-primary/80 mt-1.5">
      {parts.join(" · ")}
    </p>
  )
}

function TransparencyPageContent() {
  const searchParams = useSearchParams()
  const uuid = searchParams.get("uuid")

  const [steps, setSteps] = useState<PipelineStep[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!uuid) return
    setLoading(true)
    fetch(`/api/transparency?uuid=${encodeURIComponent(uuid)}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.error) { setError(data.error); return }
        setSteps(data.steps ?? [])
      })
      .catch((err) => setError(String(err)))
      .finally(() => setLoading(false))
  }, [uuid])

  return (
    <main className="min-h-screen bg-background">
      <div className="fixed inset-0 bg-[radial-gradient(ellipse_80%_50%_at_50%_-10%,hsl(var(--primary)/0.04),transparent)] pointer-events-none" />

      <AppHeader
        backLink={{
          href: uuid ? `/results?uuid=${encodeURIComponent(uuid)}` : "/",
          label: "Back",
        }}
        showDashboardLink
        className="sticky top-0 z-20 bg-background/90 backdrop-blur-sm border-border/60"
      />

      <div className="max-w-2xl mx-auto px-6 py-10 pb-20">
        <div className="mb-8">
          <h1 className="font-serif text-2xl text-foreground mb-1">How we found your results</h1>
          <p className="text-[13px] text-muted-foreground">A step-by-step breakdown of the Trially pipeline for this search.</p>
        </div>

        {!uuid && (
          <div className="flex flex-col items-center justify-center min-h-[40vh] gap-3 text-center">
            <p className="text-sm text-muted-foreground">No session found.</p>
            <Link href="/" className="text-xs text-primary underline underline-offset-4">Start a new search</Link>
          </div>
        )}

        {uuid && loading && (
          <div className="flex items-center justify-center min-h-[40vh]">
            <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        )}

        {uuid && !loading && error && (
          <div className="flex flex-col items-center justify-center min-h-[40vh] gap-3 text-center">
            <p className="text-sm text-muted-foreground">{error}</p>
            <Link href="/" className="text-xs text-primary underline underline-offset-4">Start a new search</Link>
          </div>
        )}

        {uuid && !loading && !error && steps.length > 0 && (
          <div className="relative">
            {/* Vertical timeline line */}
            <div className="absolute left-[19px] top-6 bottom-6 w-px bg-border/60" />

            <div className="space-y-0">
              {steps.map((step, i) => {
                const cfg = STEP_CONFIG[step.step_name]
                const duration = formatDuration(step.started_at, step.completed_at)
                return (
                  <div key={step.step_name} className="relative flex gap-5 pb-8 last:pb-0">
                    {/* Step number circle */}
                    <div className="relative z-10 flex-shrink-0 w-10 h-10 rounded-full bg-background border border-border flex items-center justify-center">
                      <span className="text-[11px] font-semibold text-primary">{i + 1}</span>
                    </div>

                    {/* Card */}
                    <div className="flex-1 bg-card border border-border rounded-xl px-5 py-4 mt-0.5">
                      <div className="flex items-start justify-between gap-3 mb-1">
                        <p className="text-[13px] font-semibold text-foreground">
                          {cfg?.label ?? step.step_name}
                        </p>
                        {duration && (
                          <span className="text-[10px] text-muted-foreground shrink-0">{duration}</span>
                        )}
                      </div>

                      {/* Service + model badge */}
                      <div className="flex flex-wrap gap-1.5 mb-2">
                        {step.service && (
                          <span className="inline-flex items-center text-[10px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground border border-border">
                            {step.service}
                          </span>
                        )}
                        {step.model && (
                          <span className="inline-flex items-center text-[10px] px-2 py-0.5 rounded-full bg-primary/8 text-primary border border-primary/20">
                            {step.model.split("/").pop()}
                          </span>
                        )}
                      </div>

                      {cfg && (
                        <p className="text-[12px] leading-relaxed text-foreground/70">
                          {cfg.description}
                        </p>
                      )}

                      <StepDetail step={step} />
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Footer note */}
        <p className="mt-12 text-[11px] text-muted-foreground/60 leading-relaxed text-center">
          Trially uses AI models hosted on Featherless.ai and AWS cloud services. Results are for informational purposes only and are not medical advice.
        </p>
      </div>
    </main>
  )
}

export default function TransparencyPage() {
  return (
    <Suspense fallback={
      <main className="min-h-screen flex items-center justify-center bg-background">
        <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </main>
    }>
      <TransparencyPageContent />
    </Suspense>
  )
}
