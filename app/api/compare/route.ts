import { NextRequest } from "next/server"

const corsHeaders = { "Access-Control-Allow-Origin": "*" as const }

// ClinicalTrials.gov v2 API types (partial)
interface CtgStudy {
  protocolSection: {
    identificationModule?: { nctId?: string; briefTitle?: string; officialTitle?: string }
    statusModule?: { overallStatus?: string; startDateStruct?: { date?: string } }
    sponsorCollaboratorsModule?: { leadSponsor?: { name?: string } }
    descriptionModule?: { briefSummary?: string }
    conditionsModule?: { conditions?: string[] }
    designModule?: { phases?: string[]; enrollmentInfo?: { count?: number } }
    eligibilityModule?: {
      eligibilityCriteria?: string
      sex?: string
      minimumAge?: string
      maximumAge?: string
    }
    contactsLocationsModule?: {
      centralContacts?: Array<{ name?: string; phone?: string; email?: string }>
      locations?: Array<{ facility?: string; city?: string; state?: string; country?: string }>
    }
    outcomesModule?: {
      primaryOutcomes?: Array<{ measure?: string }>
      secondaryOutcomes?: Array<{ measure?: string }>
    }
  }
}

export interface TrialDetail {
  nctId: string
  title: string
  status: string
  phases: string
  enrollment: number | null
  sponsor: string
  conditions: string
  startDate: string
  ageRange: string
  sex: string
  locations: string[]
  centralContacts: string[]
  primaryOutcomes: string[]
  secondaryOutcomes: string[]
  briefSummary: string
  eligibilityCriteria: string
}

async function fetchTrialFromCtg(nctId: string): Promise<TrialDetail | null> {
  try {
    const res = await fetch(
      `https://clinicaltrials.gov/api/v2/studies/${nctId}?format=json`,
      { signal: AbortSignal.timeout(10000) }
    )
    if (!res.ok) return null
    const data = (await res.json()) as CtgStudy
    const p = data.protocolSection
    return {
      nctId: p.identificationModule?.nctId ?? nctId,
      title:
        p.identificationModule?.officialTitle ??
        p.identificationModule?.briefTitle ??
        "",
      status: p.statusModule?.overallStatus ?? "",
      phases: (p.designModule?.phases ?? []).join(", "),
      enrollment: p.designModule?.enrollmentInfo?.count ?? null,
      sponsor: p.sponsorCollaboratorsModule?.leadSponsor?.name ?? "",
      conditions: (p.conditionsModule?.conditions ?? []).join(", "),
      startDate: p.statusModule?.startDateStruct?.date ?? "",
      ageRange: [
        p.eligibilityModule?.minimumAge,
        p.eligibilityModule?.maximumAge,
      ]
        .filter(Boolean)
        .join(" – "),
      sex: p.eligibilityModule?.sex ?? "",
      locations: (p.contactsLocationsModule?.locations ?? [])
        .slice(0, 8)
        .map((l) =>
          [l.facility, l.city, l.state, l.country].filter(Boolean).join(", ")
        ),
      centralContacts: (p.contactsLocationsModule?.centralContacts ?? []).map(
        (c) => [c.name, c.email, c.phone].filter(Boolean).join(" · ")
      ),
      primaryOutcomes: (p.outcomesModule?.primaryOutcomes ?? [])
        .map((o) => o.measure ?? "")
        .filter(Boolean),
      secondaryOutcomes: (p.outcomesModule?.secondaryOutcomes ?? [])
        .map((o) => o.measure ?? "")
        .filter(Boolean),
      briefSummary: p.descriptionModule?.briefSummary ?? "",
      eligibilityCriteria: p.eligibilityModule?.eligibilityCriteria ?? "",
    }
  } catch {
    return null
  }
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null)
  const nctIds: string[] = Array.isArray(body?.nctIds)
    ? (body.nctIds as string[]).slice(0, 3)
    : []

  if (nctIds.length < 2) {
    return Response.json(
      { error: "Provide 2–3 nctIds" },
      { status: 400, headers: corsHeaders }
    )
  }

  // Fetch all trial details from ClinicalTrials.gov in parallel
  const trials = (await Promise.all(nctIds.map(fetchTrialFromCtg))).filter(
    (t): t is TrialDetail => t !== null
  )

  if (trials.length < 2) {
    return Response.json(
      { error: "Could not fetch trial data from ClinicalTrials.gov" },
      { status: 502, headers: corsHeaders }
    )
  }

  return Response.json({ trials }, { status: 200, headers: corsHeaders })
}
