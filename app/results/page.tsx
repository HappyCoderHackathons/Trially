"use client"

import { useState, useMemo } from "react"
import { useSearchParams, useRouter } from "next/navigation"
import Link from "next/link"
import Image from "next/image"
import { TrialCard, Trial } from "@/components/trial-card"
import { Pagination } from "@/components/pagination"
import { TriallySearchInput } from "@/components/trially-search-input"
import { BackgroundDecorations } from "@/components/background-decorations"
import { ArrowLeft } from "lucide-react"

// Mock trial data
const mockTrials: Trial[] = [
  {
    id: "1",
    name: "Phase III Cardiovascular Health Study",
    description: "A randomized, double-blind study evaluating the efficacy of a new treatment for patients with chronic heart conditions and reduced ejection fraction.",
    location: "Boston, MA",
    sponsor: "CardioMed Research",
    phase: "III",
    enrollmentStatus: "Recruiting",
    startDate: "Jan 2024",
    participantsNeeded: 500,
  },
  {
    id: "2",
    name: "Diabetes Management Innovation Trial",
    description: "Investigating a novel glucose monitoring system combined with AI-driven insulin delivery for Type 2 diabetes patients.",
    location: "San Francisco, CA",
    sponsor: "DiabeTech Labs",
    phase: "II",
    enrollmentStatus: "Recruiting",
    startDate: "Mar 2024",
    participantsNeeded: 300,
  },
  {
    id: "3",
    name: "Alzheimer's Disease Prevention Study",
    description: "Long-term study examining early intervention strategies for individuals at high risk of developing Alzheimer's disease.",
    location: "Chicago, IL",
    sponsor: "NeuroScience Institute",
    phase: "II",
    enrollmentStatus: "Active",
    startDate: "Nov 2023",
    participantsNeeded: 1000,
  },
  {
    id: "4",
    name: "Oncology Immunotherapy Trial",
    description: "Evaluating a combination immunotherapy approach for patients with advanced non-small cell lung cancer.",
    location: "Houston, TX",
    sponsor: "OncoImmune Corp",
    phase: "III",
    enrollmentStatus: "Recruiting",
    startDate: "Feb 2024",
    participantsNeeded: 450,
  },
  {
    id: "5",
    name: "Pediatric Asthma Treatment Study",
    description: "Testing a new inhaled medication for children aged 6-12 with moderate to severe persistent asthma.",
    location: "Philadelphia, PA",
    sponsor: "PediCare Research",
    phase: "II",
    enrollmentStatus: "Not Recruiting",
    startDate: "Sep 2023",
    participantsNeeded: 200,
  },
  {
    id: "6",
    name: "Chronic Pain Management Trial",
    description: "Non-opioid pain management study for patients with chronic lower back pain using nerve stimulation technology.",
    location: "Denver, CO",
    sponsor: "PainFree Solutions",
    phase: "III",
    enrollmentStatus: "Recruiting",
    startDate: "Apr 2024",
    participantsNeeded: 350,
  },
  {
    id: "7",
    name: "Mental Health Digital Therapeutics",
    description: "Assessing the effectiveness of a digital cognitive behavioral therapy app for anxiety and depression.",
    location: "Seattle, WA",
    sponsor: "MindWell Digital",
    phase: "II",
    enrollmentStatus: "Active",
    startDate: "Dec 2023",
    participantsNeeded: 600,
  },
  {
    id: "8",
    name: "Rheumatoid Arthritis Biologic Study",
    description: "Comparing a new biologic agent with standard treatments for moderate to severe rheumatoid arthritis.",
    location: "New York, NY",
    sponsor: "ArthritisCare Pharma",
    phase: "III",
    enrollmentStatus: "Completed",
    startDate: "Jun 2022",
    participantsNeeded: 400,
  },
  {
    id: "9",
    name: "Sleep Disorder Intervention Trial",
    description: "Testing a combination of light therapy and cognitive techniques for patients with chronic insomnia.",
    location: "Los Angeles, CA",
    sponsor: "SleepWell Research",
    phase: "II",
    enrollmentStatus: "Recruiting",
    startDate: "May 2024",
    participantsNeeded: 250,
  },
]

const ITEMS_PER_PAGE = 4

export default function ResultsPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const query = searchParams.get("q") || ""
  const [currentPage, setCurrentPage] = useState(1)

  const handleSearch = (newQuery: string) => {
    if (newQuery.trim()) {
      router.push(`/results?q=${encodeURIComponent(newQuery)}`)
      setCurrentPage(1)
    }
  }

  const filteredTrials = useMemo(() => {
    if (!query) return mockTrials
    const lowerQuery = query.toLowerCase()
    return mockTrials.filter(
      (trial) =>
        trial.name.toLowerCase().includes(lowerQuery) ||
        trial.description.toLowerCase().includes(lowerQuery) ||
        trial.location.toLowerCase().includes(lowerQuery) ||
        trial.sponsor.toLowerCase().includes(lowerQuery)
    )
  }, [query])

  const totalPages = Math.ceil(filteredTrials.length / ITEMS_PER_PAGE)
  
  const paginatedTrials = useMemo(() => {
    const start = (currentPage - 1) * ITEMS_PER_PAGE
    return filteredTrials.slice(start, start + ITEMS_PER_PAGE)
  }, [filteredTrials, currentPage])

  const handlePageChange = (page: number) => {
    setCurrentPage(page)
    window.scrollTo({ top: 0, behavior: "smooth" })
  }

  return (
    <main className="min-h-screen bg-background">
      {/* Background elements */}
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

            <div className="flex-1 max-w-xl ml-auto">
              <TriallySearchInput onSubmit={handleSearch} />
            </div>
          </div>
        </div>
      </header>

      {/* Results Section */}
      <section className="relative z-10 max-w-6xl mx-auto px-4 py-8">
        {/* Results Header */}
        <div className="mb-8">
          <h1 className="text-2xl font-semibold text-foreground mb-2">
            {query ? `Results for "${query}"` : "All Clinical Trials"}
          </h1>
          <p className="text-muted-foreground">
            Found {filteredTrials.length} clinical {filteredTrials.length === 1 ? "trial" : "trials"}
          </p>
        </div>

        {/* Trial Cards Grid */}
        {paginatedTrials.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-10">
            {paginatedTrials.map((trial) => (
              <TrialCard key={trial.id} trial={trial} />
            ))}
          </div>
        ) : (
          <div className="text-center py-16">
            <p className="text-lg text-muted-foreground">
              No trials found matching your search. Try different keywords.
            </p>
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <Pagination
            currentPage={currentPage}
            totalPages={totalPages}
            onPageChange={handlePageChange}
          />
        )}
      </section>

      {/* Bottom gradient */}
      <div className="fixed bottom-0 left-0 right-0 h-24 bg-gradient-to-t from-primary/5 to-transparent pointer-events-none" />
    </main>
  )
}
