"use client"

import { useState, useEffect, useCallback } from "react"
import Link from "next/link"
import {
  ChevronDown, Pencil, X, Plus, Trash2, Check, Loader2, Search,
} from "lucide-react"
import { Input } from "@/components/ui/input"
import { getIdToken } from "@/lib/aws-credentials"
import { cn } from "@/lib/utils"

// ─── Types ────────────────────────────────────────────────────────────────────

interface PatientDemographics {
  age?: number | string
  sex?: string
  ethnicity?: string
  nationality?: string
  countryOfResidence?: string
  occupation?: string
  employmentStatus?: string
  isHealthyVolunteer?: boolean
  location?: { city?: string; state?: string; zip?: string }
}

interface PatientDiagnosis {
  primary?: string
  secondary?: string[]
  stage?: string
  severity?: string
  duration?: string
  diagnosedDate?: string
  affectedAreas?: string[]
  icd10Code?: string
}

interface Symptoms {
  current?: string[]
  painScore?: number | string
  morningStiffnessDuration?: string
  functionalLimitations?: string[]
}

interface Medication {
  name?: string
  dosage?: string
  frequency?: string
  duration?: string
  indication?: string
  effectiveness?: string
  controlled?: boolean
}

interface PreviousMedication {
  name?: string
  dosage?: string
  duration?: string
  discontinuedReason?: string
  adverseEffects?: string
}

interface Comorbidity {
  condition?: string
  severity?: string
  controlled?: boolean
  onsetDate?: string
  notes?: string
}

interface LabResult {
  test?: string
  value?: string
  unit?: string
  referenceRange?: string
  flag?: string
  date?: string
}

interface VitalSigns {
  height?: { value?: number | string; unit?: string }
  weight?: { value?: number | string; unit?: string }
  bmi?: number | string
  bloodPressure?: { systolic?: number | string; diastolic?: number | string }
  heartRate?: number | string
}

interface Allergy {
  substance?: string
  reaction?: string
  severity?: string
}

interface SurgicalHistoryItem {
  procedure?: string
  date?: string
  outcome?: string
  notes?: string
}

interface FamilyHistoryItem {
  relation?: string
  condition?: string
}

interface Lifestyle {
  smokingStatus?: string
  alcoholUse?: string
  exerciseFrequency?: string
  diet?: string
}

interface TrialPreferences {
  preferredPhases?: string[]
  excludedInterventionTypes?: string[]
  maxTravelDistance?: number | string
  maxVisitFrequency?: string
  willingToParticipate?: boolean
  previousTrialParticipation?: boolean
  goals?: { desiredOutcomes?: string[]; targetPainScore?: number | string }
}

interface Insurance {
  provider?: string
  plan?: string
  coverageType?: string
}

interface Patient {
  demographics?: PatientDemographics
  diagnosis?: string | PatientDiagnosis
  symptoms?: Symptoms
  currentMedications?: Medication[]
  previousMedications?: PreviousMedication[]
  comorbidities?: Comorbidity[]
  labResults?: LabResult[]
  vitalSigns?: VitalSigns
  allergies?: Allergy[]
  surgicalHistory?: SurgicalHistoryItem[]
  familyHistory?: FamilyHistoryItem[]
  lifestyle?: Lifestyle
  trialPreferences?: TrialPreferences
  insurance?: Insurance
}

// ─── Primitive helpers ─────────────────────────────────────────────────────────

function str(v: unknown): string {
  if (v == null) return ""
  if (typeof v === "boolean") return v ? "Yes" : "No"
  return String(v)
}

function hasContent(v: unknown): boolean {
  if (v == null) return false
  if (typeof v === "string") return v.trim() !== ""
  if (Array.isArray(v)) return v.length > 0
  if (typeof v === "object") return Object.values(v as object).some(hasContent)
  return true
}

// ─── Field components ──────────────────────────────────────────────────────────

function Field({ label, value }: { label: string; value: unknown }) {
  const display = str(value)
  return (
    <div className="flex items-baseline gap-3 py-[3px]">
      <span className="text-[11px] text-muted-foreground w-40 shrink-0 leading-5">{label}</span>
      {display ? (
        <span className="text-[13px] text-foreground leading-5">{display}</span>
      ) : (
        <span className="text-[12px] text-muted-foreground/40 italic">—</span>
      )}
    </div>
  )
}

function EditField({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
}) {
  return (
    <div className="flex items-center gap-3 py-[3px]">
      <label className="text-[11px] text-muted-foreground w-40 shrink-0 leading-5">{label}</label>
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder ?? label}
        className="h-7 text-[12px] px-2 flex-1"
      />
    </div>
  )
}

function ListField({ label, items }: { label: string; items?: string[] }) {
  if (!items || items.length === 0) return <Field label={label} value={null} />
  return (
    <div className="flex gap-3 py-[3px]">
      <span className="text-[11px] text-muted-foreground w-40 shrink-0 leading-5 pt-0.5">{label}</span>
      <ul className="flex flex-col gap-0.5">
        {items.map((item, i) => (
          <li key={i} className="text-[13px] text-foreground leading-5">
            {item}
          </li>
        ))}
      </ul>
    </div>
  )
}

function EditListField({
  label,
  items,
  onChange,
}: {
  label: string
  items: string[]
  onChange: (items: string[]) => void
}) {
  return (
    <div className="flex gap-3 py-[3px]">
      <span className="text-[11px] text-muted-foreground w-40 shrink-0 leading-5 pt-2">{label}</span>
      <div className="flex-1 flex flex-col gap-1">
        {items.map((item, i) => (
          <div key={i} className="flex items-center gap-1.5">
            <Input
              value={item}
              onChange={(e) => {
                const next = [...items]
                next[i] = e.target.value
                onChange(next)
              }}
              className="h-7 text-[12px] px-2 flex-1"
            />
            <button
              onClick={() => onChange(items.filter((_, j) => j !== i))}
              className="p-1 text-muted-foreground hover:text-destructive transition-colors"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
        ))}
        <button
          onClick={() => onChange([...items, ""])}
          className="self-start inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors mt-0.5"
        >
          <Plus className="w-3 h-3" />
          Add
        </button>
      </div>
    </div>
  )
}

// ─── Array item card ───────────────────────────────────────────────────────────

function ArrayCard({
  children,
  onRemove,
}: {
  children: React.ReactNode
  onRemove?: () => void
}) {
  return (
    <div className="relative rounded-lg border border-border bg-background px-4 py-3 mb-2">
      {children}
      {onRemove && (
        <button
          onClick={onRemove}
          className="absolute top-2.5 right-2.5 p-1 text-muted-foreground hover:text-destructive transition-colors"
        >
          <Trash2 className="w-3 h-3" />
        </button>
      )}
    </div>
  )
}

// ─── Section wrapper ───────────────────────────────────────────────────────────

function Section({
  id,
  title,
  hasData,
  open,
  onToggle,
  editing,
  onEdit,
  onSave,
  onCancel,
  saving,
  saveError,
  children,
}: {
  id: string
  title: string
  hasData: boolean
  open: boolean
  onToggle: () => void
  editing: boolean
  onEdit: () => void
  onSave: () => void
  onCancel: () => void
  saving: boolean
  saveError: string | null
  children: React.ReactNode
}) {
  return (
    <div className="border-b border-border last:border-0">
      <div className="flex items-center h-11 px-5 gap-2">
        <button
          onClick={onToggle}
          className="flex-1 flex items-center gap-2.5 text-left"
        >
          <ChevronDown
            className={cn(
              "w-3.5 h-3.5 text-muted-foreground transition-transform duration-200 shrink-0",
              open && "rotate-180"
            )}
          />
          <span className="text-[12px] font-semibold tracking-wide text-foreground uppercase">
            {title}
          </span>
          {!hasData && (
            <span className="text-[10px] text-muted-foreground/50 font-normal normal-case tracking-normal">
              not provided
            </span>
          )}
        </button>
        {!editing && (
          <button
            onClick={(e) => {
              e.stopPropagation()
              onEdit()
            }}
            className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            aria-label={`Edit ${title}`}
          >
            <Pencil className="w-3 h-3" />
          </button>
        )}
      </div>

      {open && (
        <div className={cn("px-5 pb-5", editing && "bg-muted/20 rounded-b-lg")}>
          <div className="pt-1">{children}</div>
          {editing && (
            <div className="flex items-center gap-2 mt-4 pt-3 border-t border-border">
              <button
                onClick={onSave}
                disabled={saving}
                className="inline-flex items-center gap-1.5 text-[12px] font-medium px-3 py-1.5 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
              >
                {saving ? (
                  <Loader2 className="w-3 h-3 animate-spin" />
                ) : (
                  <Check className="w-3 h-3" />
                )}
                Save
              </button>
              <button
                onClick={onCancel}
                className="inline-flex items-center gap-1.5 text-[12px] text-muted-foreground hover:text-foreground px-3 py-1.5 rounded-md hover:bg-muted transition-colors"
              >
                <X className="w-3 h-3" />
                Cancel
              </button>
              {saveError && (
                <span className="text-[11px] text-destructive ml-1">{saveError}</span>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Section content ───────────────────────────────────────────────────────────

function DemographicsContent({
  data,
  editing,
  draft,
  setDraft,
}: {
  data?: PatientDemographics
  editing: boolean
  draft: PatientDemographics
  setDraft: (d: PatientDemographics) => void
}) {
  if (!editing) {
    return (
      <div>
        <Field label="Age" value={data?.age} />
        <Field label="Sex" value={data?.sex} />
        <Field label="Ethnicity" value={data?.ethnicity} />
        <Field label="Nationality" value={data?.nationality} />
        <Field label="Country" value={data?.countryOfResidence} />
        <Field label="Occupation" value={data?.occupation} />
        <Field label="Employment" value={data?.employmentStatus} />
        <Field label="Healthy volunteer" value={data?.isHealthyVolunteer != null ? (data.isHealthyVolunteer ? "Yes" : "No") : null} />
        <Field label="City" value={data?.location?.city} />
        <Field label="State" value={data?.location?.state} />
        <Field label="ZIP" value={data?.location?.zip} />
      </div>
    )
  }
  const set = (key: keyof PatientDemographics, val: string) =>
    setDraft({ ...draft, [key]: val || undefined })
  const setLoc = (key: keyof NonNullable<PatientDemographics["location"]>, val: string) =>
    setDraft({ ...draft, location: { ...draft.location, [key]: val || undefined } })

  return (
    <div>
      <EditField label="Age" value={str(draft.age)} onChange={(v) => set("age", v)} />
      <EditField label="Sex" value={str(draft.sex)} onChange={(v) => set("sex", v)} />
      <EditField label="Ethnicity" value={str(draft.ethnicity)} onChange={(v) => set("ethnicity", v)} />
      <EditField label="Nationality" value={str(draft.nationality)} onChange={(v) => set("nationality", v)} />
      <EditField label="Country" value={str(draft.countryOfResidence)} onChange={(v) => set("countryOfResidence", v)} />
      <EditField label="Occupation" value={str(draft.occupation)} onChange={(v) => set("occupation", v)} />
      <EditField label="Employment" value={str(draft.employmentStatus)} onChange={(v) => set("employmentStatus", v)} />
      <EditField label="City" value={str(draft.location?.city)} onChange={(v) => setLoc("city", v)} />
      <EditField label="State" value={str(draft.location?.state)} onChange={(v) => setLoc("state", v)} />
      <EditField label="ZIP" value={str(draft.location?.zip)} onChange={(v) => setLoc("zip", v)} />
    </div>
  )
}

function normalizeDiagnosis(d?: string | PatientDiagnosis): PatientDiagnosis {
  if (!d) return {}
  if (typeof d === "string") return { primary: d }
  return d
}

function DiagnosisContent({
  data,
  editing,
  draft,
  setDraft,
}: {
  data?: string | PatientDiagnosis
  editing: boolean
  draft: PatientDiagnosis
  setDraft: (d: PatientDiagnosis) => void
}) {
  const norm = normalizeDiagnosis(data)
  const set = (key: keyof PatientDiagnosis, val: string) =>
    setDraft({ ...draft, [key]: val || undefined })

  if (!editing) {
    return (
      <div>
        <Field label="Primary" value={norm.primary} />
        <ListField label="Secondary" items={norm.secondary} />
        <Field label="Stage" value={norm.stage} />
        <Field label="Severity" value={norm.severity} />
        <Field label="Duration" value={norm.duration} />
        <Field label="Diagnosed date" value={norm.diagnosedDate} />
        <ListField label="Affected areas" items={norm.affectedAreas} />
        <Field label="ICD-10 code" value={norm.icd10Code} />
      </div>
    )
  }
  return (
    <div>
      <EditField label="Primary" value={str(draft.primary)} onChange={(v) => set("primary", v)} />
      <EditListField
        label="Secondary"
        items={draft.secondary ?? []}
        onChange={(items) => setDraft({ ...draft, secondary: items.length ? items : undefined })}
      />
      <EditField label="Stage" value={str(draft.stage)} onChange={(v) => set("stage", v)} />
      <EditField label="Severity" value={str(draft.severity)} onChange={(v) => set("severity", v)} />
      <EditField label="Duration" value={str(draft.duration)} onChange={(v) => set("duration", v)} />
      <EditField label="Diagnosed date" value={str(draft.diagnosedDate)} onChange={(v) => set("diagnosedDate", v)} />
      <EditListField
        label="Affected areas"
        items={draft.affectedAreas ?? []}
        onChange={(items) => setDraft({ ...draft, affectedAreas: items.length ? items : undefined })}
      />
      <EditField label="ICD-10 code" value={str(draft.icd10Code)} onChange={(v) => set("icd10Code", v)} />
    </div>
  )
}

function SymptomsContent({
  data,
  editing,
  draft,
  setDraft,
}: {
  data?: Symptoms
  editing: boolean
  draft: Symptoms
  setDraft: (d: Symptoms) => void
}) {
  if (!editing) {
    return (
      <div>
        <ListField label="Current symptoms" items={data?.current} />
        <Field label="Pain score" value={data?.painScore} />
        <Field label="Morning stiffness" value={data?.morningStiffnessDuration} />
        <ListField label="Functional limitations" items={data?.functionalLimitations} />
      </div>
    )
  }
  return (
    <div>
      <EditListField
        label="Current symptoms"
        items={draft.current ?? []}
        onChange={(items) => setDraft({ ...draft, current: items.length ? items : undefined })}
      />
      <EditField
        label="Pain score"
        value={str(draft.painScore)}
        onChange={(v) => setDraft({ ...draft, painScore: v || undefined })}
        placeholder="0–10"
      />
      <EditField
        label="Morning stiffness"
        value={str(draft.morningStiffnessDuration)}
        onChange={(v) => setDraft({ ...draft, morningStiffnessDuration: v || undefined })}
      />
      <EditListField
        label="Functional limitations"
        items={draft.functionalLimitations ?? []}
        onChange={(items) => setDraft({ ...draft, functionalLimitations: items.length ? items : undefined })}
      />
    </div>
  )
}

function MedArrayContent<T extends Record<string, unknown>>({
  items,
  editing,
  draft,
  setDraft,
  fields,
  emptyItem,
}: {
  items?: T[]
  editing: boolean
  draft: T[]
  setDraft: (d: T[]) => void
  fields: { key: keyof T; label: string }[]
  emptyItem: T
}) {
  if (!editing) {
    if (!items || items.length === 0) {
      return <p className="text-[12px] text-muted-foreground/50 italic py-1">None recorded</p>
    }
    return (
      <div className="flex flex-col gap-2">
        {items.map((item, i) => (
          <div key={i} className="rounded-lg border border-border bg-background px-4 py-3">
            {fields.map(({ key, label }) =>
              item[key] != null && str(item[key]) ? (
                <Field key={String(key)} label={label} value={item[key]} />
              ) : null
            )}
          </div>
        ))}
      </div>
    )
  }
  return (
    <div className="flex flex-col gap-2">
      {draft.map((item, i) => (
        <ArrayCard key={i} onRemove={() => setDraft(draft.filter((_, j) => j !== i))}>
          {fields.map(({ key, label }) => (
            <EditField
              key={String(key)}
              label={label}
              value={str(item[key])}
              onChange={(v) => {
                const next = [...draft]
                next[i] = { ...item, [key]: v || undefined }
                setDraft(next)
              }}
            />
          ))}
        </ArrayCard>
      ))}
      <button
        onClick={() => setDraft([...draft, { ...emptyItem }])}
        className="self-start inline-flex items-center gap-1.5 text-[11px] text-muted-foreground hover:text-foreground transition-colors mt-1"
      >
        <Plus className="w-3 h-3" />
        Add entry
      </button>
    </div>
  )
}

function VitalSignsContent({
  data,
  editing,
  draft,
  setDraft,
}: {
  data?: VitalSigns
  editing: boolean
  draft: VitalSigns
  setDraft: (d: VitalSigns) => void
}) {
  if (!editing) {
    const bp = data?.bloodPressure
    return (
      <div>
        <Field label="Height" value={data?.height ? `${data.height.value ?? ""} ${data.height.unit ?? ""}`.trim() : null} />
        <Field label="Weight" value={data?.weight ? `${data.weight.value ?? ""} ${data.weight.unit ?? ""}`.trim() : null} />
        <Field label="BMI" value={data?.bmi} />
        <Field label="Blood pressure" value={bp ? `${bp.systolic ?? "?"}/${bp.diastolic ?? "?"}` : null} />
        <Field label="Heart rate" value={data?.heartRate} />
      </div>
    )
  }
  return (
    <div>
      <EditField
        label="Height value"
        value={str(draft.height?.value)}
        onChange={(v) => setDraft({ ...draft, height: { ...draft.height, value: v || undefined } })}
      />
      <EditField
        label="Height unit"
        value={str(draft.height?.unit)}
        onChange={(v) => setDraft({ ...draft, height: { ...draft.height, unit: v || undefined } })}
        placeholder="cm / in"
      />
      <EditField
        label="Weight value"
        value={str(draft.weight?.value)}
        onChange={(v) => setDraft({ ...draft, weight: { ...draft.weight, value: v || undefined } })}
      />
      <EditField
        label="Weight unit"
        value={str(draft.weight?.unit)}
        onChange={(v) => setDraft({ ...draft, weight: { ...draft.weight, unit: v || undefined } })}
        placeholder="kg / lbs"
      />
      <EditField
        label="BMI"
        value={str(draft.bmi)}
        onChange={(v) => setDraft({ ...draft, bmi: v || undefined })}
      />
      <EditField
        label="Systolic"
        value={str(draft.bloodPressure?.systolic)}
        onChange={(v) => setDraft({ ...draft, bloodPressure: { ...draft.bloodPressure, systolic: v || undefined } })}
      />
      <EditField
        label="Diastolic"
        value={str(draft.bloodPressure?.diastolic)}
        onChange={(v) => setDraft({ ...draft, bloodPressure: { ...draft.bloodPressure, diastolic: v || undefined } })}
      />
      <EditField
        label="Heart rate"
        value={str(draft.heartRate)}
        onChange={(v) => setDraft({ ...draft, heartRate: v || undefined })}
        placeholder="bpm"
      />
    </div>
  )
}

function LifestyleContent({
  data,
  editing,
  draft,
  setDraft,
}: {
  data?: Lifestyle
  editing: boolean
  draft: Lifestyle
  setDraft: (d: Lifestyle) => void
}) {
  const set = (key: keyof Lifestyle, val: string) =>
    setDraft({ ...draft, [key]: val || undefined })
  if (!editing) {
    return (
      <div>
        <Field label="Smoking" value={data?.smokingStatus} />
        <Field label="Alcohol" value={data?.alcoholUse} />
        <Field label="Exercise" value={data?.exerciseFrequency} />
        <Field label="Diet" value={data?.diet} />
      </div>
    )
  }
  return (
    <div>
      <EditField label="Smoking" value={str(draft.smokingStatus)} onChange={(v) => set("smokingStatus", v)} />
      <EditField label="Alcohol" value={str(draft.alcoholUse)} onChange={(v) => set("alcoholUse", v)} />
      <EditField label="Exercise" value={str(draft.exerciseFrequency)} onChange={(v) => set("exerciseFrequency", v)} />
      <EditField label="Diet" value={str(draft.diet)} onChange={(v) => set("diet", v)} />
    </div>
  )
}

function InsuranceContent({
  data,
  editing,
  draft,
  setDraft,
}: {
  data?: Insurance
  editing: boolean
  draft: Insurance
  setDraft: (d: Insurance) => void
}) {
  const set = (key: keyof Insurance, val: string) =>
    setDraft({ ...draft, [key]: val || undefined })
  if (!editing) {
    return (
      <div>
        <Field label="Provider" value={data?.provider} />
        <Field label="Plan" value={data?.plan} />
        <Field label="Coverage type" value={data?.coverageType} />
      </div>
    )
  }
  return (
    <div>
      <EditField label="Provider" value={str(draft.provider)} onChange={(v) => set("provider", v)} />
      <EditField label="Plan" value={str(draft.plan)} onChange={(v) => set("plan", v)} />
      <EditField label="Coverage type" value={str(draft.coverageType)} onChange={(v) => set("coverageType", v)} />
    </div>
  )
}

function TrialPreferencesContent({
  data,
  editing,
  draft,
  setDraft,
}: {
  data?: TrialPreferences
  editing: boolean
  draft: TrialPreferences
  setDraft: (d: TrialPreferences) => void
}) {
  if (!editing) {
    return (
      <div>
        <ListField label="Preferred phases" items={data?.preferredPhases} />
        <ListField label="Excluded types" items={data?.excludedInterventionTypes} />
        <Field label="Max travel (mi)" value={data?.maxTravelDistance} />
        <Field label="Visit frequency" value={data?.maxVisitFrequency} />
        <Field label="Willing to participate" value={data?.willingToParticipate != null ? (data.willingToParticipate ? "Yes" : "No") : null} />
        <Field label="Prior trial" value={data?.previousTrialParticipation != null ? (data.previousTrialParticipation ? "Yes" : "No") : null} />
        <ListField label="Desired outcomes" items={data?.goals?.desiredOutcomes} />
        <Field label="Target pain score" value={data?.goals?.targetPainScore} />
      </div>
    )
  }
  return (
    <div>
      <EditListField
        label="Preferred phases"
        items={draft.preferredPhases ?? []}
        onChange={(items) => setDraft({ ...draft, preferredPhases: items.length ? items : undefined })}
      />
      <EditListField
        label="Excluded types"
        items={draft.excludedInterventionTypes ?? []}
        onChange={(items) => setDraft({ ...draft, excludedInterventionTypes: items.length ? items : undefined })}
      />
      <EditField
        label="Max travel (mi)"
        value={str(draft.maxTravelDistance)}
        onChange={(v) => setDraft({ ...draft, maxTravelDistance: v || undefined })}
      />
      <EditField
        label="Visit frequency"
        value={str(draft.maxVisitFrequency)}
        onChange={(v) => setDraft({ ...draft, maxVisitFrequency: v || undefined })}
      />
      <EditListField
        label="Desired outcomes"
        items={draft.goals?.desiredOutcomes ?? []}
        onChange={(items) =>
          setDraft({ ...draft, goals: { ...draft.goals, desiredOutcomes: items.length ? items : undefined } })
        }
      />
      <EditField
        label="Target pain score"
        value={str(draft.goals?.targetPainScore)}
        onChange={(v) =>
          setDraft({ ...draft, goals: { ...draft.goals, targetPainScore: v || undefined } })
        }
        placeholder="0–10"
      />
    </div>
  )
}

// ─── Loading skeleton ──────────────────────────────────────────────────────────

function Skeleton() {
  return (
    <div className="flex flex-col h-full">
      <div className="px-5 py-4 border-b border-border">
        <div className="h-5 w-32 bg-muted rounded animate-pulse" />
      </div>
      <div className="px-5 py-4 space-y-4">
        {[...Array(6)].map((_, i) => (
          <div key={i} className="space-y-2">
            <div className="h-3 w-24 bg-muted rounded animate-pulse" />
            <div className="h-3 w-48 bg-muted/60 rounded animate-pulse" />
            <div className="h-3 w-36 bg-muted/40 rounded animate-pulse" />
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Main component ────────────────────────────────────────────────────────────

export function PatientProfilePanel() {
  const [patient, setPatient] = useState<Patient | null>(null)
  const [recordId, setRecordId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [openSections, setOpenSections] = useState<Set<string>>(
    new Set(["demographics", "diagnosis"])
  )
  const [editingSection, setEditingSection] = useState<string | null>(null)
  const [draft, setDraft] = useState<unknown>(null)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  useEffect(() => {
    const token = getIdToken()
    if (!token) {
      setLoading(false)
      setError("Not signed in")
      return
    }
    fetch("/api/patient-profile", {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => res.json())
      .then((data) => {
        if (data.error) {
          if (data.error === "No profile found for user") {
            setPatient(null)
          } else {
            setError(data.error)
          }
          return
        }
        setPatient(data.patient ?? null)
        setRecordId(data.id ?? null)
      })
      .catch((err) => setError(String(err)))
      .finally(() => setLoading(false))
  }, [])

  const toggleSection = useCallback((key: string) => {
    setOpenSections((prev) => {
      const next = new Set(prev)
      next.has(key) ? next.delete(key) : next.add(key)
      return next
    })
  }, [])

  const startEdit = useCallback(
    (key: string, initialDraft: unknown) => {
      setEditingSection(key)
      setDraft(initialDraft)
      setSaveError(null)
      setOpenSections((prev) => new Set([...prev, key]))
    },
    []
  )

  const cancelEdit = useCallback(() => {
    setEditingSection(null)
    setDraft(null)
    setSaveError(null)
  }, [])

  const saveSection = useCallback(
    async (key: string) => {
      if (!recordId || !patient) return
      setSaving(true)
      setSaveError(null)
      const updatedPatient = { ...patient, [key]: draft }
      const token = getIdToken()
      try {
        const res = await fetch("/api/patient-profile/update", {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({ id: recordId, patient: updatedPatient }),
        })
        const data = await res.json().catch(() => ({}))
        if (!res.ok) {
          setSaveError(data?.error ?? "Failed to save")
          return
        }
        setPatient(updatedPatient)
        setEditingSection(null)
        setDraft(null)
      } catch (err) {
        setSaveError(String(err))
      } finally {
        setSaving(false)
      }
    },
    [recordId, patient, draft]
  )

  function sectionProps(key: string, initialDraft: unknown) {
    return {
      id: key,
      open: openSections.has(key),
      onToggle: () => toggleSection(key),
      editing: editingSection === key,
      onEdit: () => startEdit(key, initialDraft),
      onSave: () => saveSection(key),
      onCancel: cancelEdit,
      saving,
      saveError: editingSection === key ? saveError : null,
    }
  }

  // ── Render states ────────────────────────────────────────────────────────────

  if (loading) return <Skeleton />

  if (error && error !== "Not signed in") {
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

  if (!patient) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-5 px-8 text-center">
        <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center">
          <Search className="w-5 h-5 text-muted-foreground" />
        </div>
        <div className="space-y-1.5">
          <p className="text-[14px] font-medium text-foreground">No profile found</p>
          <p className="text-[12px] text-muted-foreground leading-relaxed max-w-[200px]">
            Run a search to build your patient profile.
          </p>
        </div>
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-[12px] font-medium px-4 py-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          <Search className="w-3.5 h-3.5" />
          Start a search
        </Link>
      </div>
    )
  }

  // ── Loaded ───────────────────────────────────────────────────────────────────

  const p = patient

  return (
    <div className="flex flex-col h-full bg-card border-l border-border">
      {/* Header */}
      <div className="px-5 py-4 border-b border-border shrink-0">
        <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground mb-0.5">
          Patient Profile
        </p>
        <p className="font-serif text-xl text-foreground leading-tight">
          {typeof p.diagnosis === "string"
            ? p.diagnosis
            : p.diagnosis?.primary ?? "Profile"}
        </p>
      </div>

      {/* Sections */}
      <div className="flex-1 overflow-y-auto">
        {/* Demographics */}
        <Section
          title="Demographics"
          hasData={hasContent(p.demographics)}
          {...sectionProps("demographics", p.demographics ?? {})}
        >
          <DemographicsContent
            data={p.demographics}
            editing={editingSection === "demographics"}
            draft={(draft as PatientDemographics | null) ?? p.demographics ?? {}}
            setDraft={(d) => setDraft(d)}
          />
        </Section>

        {/* Diagnosis */}
        <Section
          title="Diagnosis"
          hasData={hasContent(p.diagnosis)}
          {...sectionProps("diagnosis", normalizeDiagnosis(p.diagnosis))}
        >
          <DiagnosisContent
            data={p.diagnosis}
            editing={editingSection === "diagnosis"}
            draft={(draft as PatientDiagnosis | null) ?? normalizeDiagnosis(p.diagnosis)}
            setDraft={(d) => setDraft(d)}
          />
        </Section>

        {/* Symptoms */}
        <Section
          title="Symptoms"
          hasData={hasContent(p.symptoms)}
          {...sectionProps("symptoms", p.symptoms ?? {})}
        >
          <SymptomsContent
            data={p.symptoms}
            editing={editingSection === "symptoms"}
            draft={(draft as Symptoms | null) ?? p.symptoms ?? {}}
            setDraft={(d) => setDraft(d)}
          />
        </Section>

        {/* Current Medications */}
        <Section
          title="Current Medications"
          hasData={hasContent(p.currentMedications)}
          {...sectionProps("currentMedications", p.currentMedications ?? [])}
        >
          <MedArrayContent<Medication>
            items={p.currentMedications}
            editing={editingSection === "currentMedications"}
            draft={(draft as Medication[] | null) ?? p.currentMedications ?? []}
            setDraft={(d) => setDraft(d)}
            fields={[
              { key: "name", label: "Name" },
              { key: "dosage", label: "Dosage" },
              { key: "frequency", label: "Frequency" },
              { key: "duration", label: "Duration" },
              { key: "indication", label: "Indication" },
              { key: "effectiveness", label: "Effectiveness" },
            ]}
            emptyItem={{}}
          />
        </Section>

        {/* Previous Medications */}
        <Section
          title="Previous Medications"
          hasData={hasContent(p.previousMedications)}
          {...sectionProps("previousMedications", p.previousMedications ?? [])}
        >
          <MedArrayContent<PreviousMedication>
            items={p.previousMedications}
            editing={editingSection === "previousMedications"}
            draft={(draft as PreviousMedication[] | null) ?? p.previousMedications ?? []}
            setDraft={(d) => setDraft(d)}
            fields={[
              { key: "name", label: "Name" },
              { key: "dosage", label: "Dosage" },
              { key: "duration", label: "Duration" },
              { key: "discontinuedReason", label: "Discontinued reason" },
              { key: "adverseEffects", label: "Adverse effects" },
            ]}
            emptyItem={{}}
          />
        </Section>

        {/* Comorbidities */}
        <Section
          title="Comorbidities"
          hasData={hasContent(p.comorbidities)}
          {...sectionProps("comorbidities", p.comorbidities ?? [])}
        >
          <MedArrayContent<Comorbidity>
            items={p.comorbidities}
            editing={editingSection === "comorbidities"}
            draft={(draft as Comorbidity[] | null) ?? p.comorbidities ?? []}
            setDraft={(d) => setDraft(d)}
            fields={[
              { key: "condition", label: "Condition" },
              { key: "severity", label: "Severity" },
              { key: "controlled", label: "Controlled" },
              { key: "onsetDate", label: "Onset date" },
              { key: "notes", label: "Notes" },
            ]}
            emptyItem={{}}
          />
        </Section>

        {/* Lab Results */}
        <Section
          title="Lab Results"
          hasData={hasContent(p.labResults)}
          {...sectionProps("labResults", p.labResults ?? [])}
        >
          <MedArrayContent<LabResult>
            items={p.labResults}
            editing={editingSection === "labResults"}
            draft={(draft as LabResult[] | null) ?? p.labResults ?? []}
            setDraft={(d) => setDraft(d)}
            fields={[
              { key: "test", label: "Test" },
              { key: "value", label: "Value" },
              { key: "unit", label: "Unit" },
              { key: "referenceRange", label: "Reference range" },
              { key: "flag", label: "Flag" },
              { key: "date", label: "Date" },
            ]}
            emptyItem={{}}
          />
        </Section>

        {/* Vital Signs */}
        <Section
          title="Vital Signs"
          hasData={hasContent(p.vitalSigns)}
          {...sectionProps("vitalSigns", p.vitalSigns ?? {})}
        >
          <VitalSignsContent
            data={p.vitalSigns}
            editing={editingSection === "vitalSigns"}
            draft={(draft as VitalSigns | null) ?? p.vitalSigns ?? {}}
            setDraft={(d) => setDraft(d)}
          />
        </Section>

        {/* Allergies */}
        <Section
          title="Allergies"
          hasData={hasContent(p.allergies)}
          {...sectionProps("allergies", p.allergies ?? [])}
        >
          <MedArrayContent<Allergy>
            items={p.allergies}
            editing={editingSection === "allergies"}
            draft={(draft as Allergy[] | null) ?? p.allergies ?? []}
            setDraft={(d) => setDraft(d)}
            fields={[
              { key: "substance", label: "Substance" },
              { key: "reaction", label: "Reaction" },
              { key: "severity", label: "Severity" },
            ]}
            emptyItem={{}}
          />
        </Section>

        {/* Surgical History */}
        <Section
          title="Surgical History"
          hasData={hasContent(p.surgicalHistory)}
          {...sectionProps("surgicalHistory", p.surgicalHistory ?? [])}
        >
          <MedArrayContent<SurgicalHistoryItem>
            items={p.surgicalHistory}
            editing={editingSection === "surgicalHistory"}
            draft={(draft as SurgicalHistoryItem[] | null) ?? p.surgicalHistory ?? []}
            setDraft={(d) => setDraft(d)}
            fields={[
              { key: "procedure", label: "Procedure" },
              { key: "date", label: "Date" },
              { key: "outcome", label: "Outcome" },
              { key: "notes", label: "Notes" },
            ]}
            emptyItem={{}}
          />
        </Section>

        {/* Family History */}
        <Section
          title="Family History"
          hasData={hasContent(p.familyHistory)}
          {...sectionProps("familyHistory", p.familyHistory ?? [])}
        >
          <MedArrayContent<FamilyHistoryItem>
            items={p.familyHistory}
            editing={editingSection === "familyHistory"}
            draft={(draft as FamilyHistoryItem[] | null) ?? p.familyHistory ?? []}
            setDraft={(d) => setDraft(d)}
            fields={[
              { key: "relation", label: "Relation" },
              { key: "condition", label: "Condition" },
            ]}
            emptyItem={{}}
          />
        </Section>

        {/* Lifestyle */}
        <Section
          title="Lifestyle"
          hasData={hasContent(p.lifestyle)}
          {...sectionProps("lifestyle", p.lifestyle ?? {})}
        >
          <LifestyleContent
            data={p.lifestyle}
            editing={editingSection === "lifestyle"}
            draft={(draft as Lifestyle | null) ?? p.lifestyle ?? {}}
            setDraft={(d) => setDraft(d)}
          />
        </Section>

        {/* Trial Preferences */}
        <Section
          title="Trial Preferences"
          hasData={hasContent(p.trialPreferences)}
          {...sectionProps("trialPreferences", p.trialPreferences ?? {})}
        >
          <TrialPreferencesContent
            data={p.trialPreferences}
            editing={editingSection === "trialPreferences"}
            draft={(draft as TrialPreferences | null) ?? p.trialPreferences ?? {}}
            setDraft={(d) => setDraft(d)}
          />
        </Section>

        {/* Insurance */}
        <Section
          title="Insurance"
          hasData={hasContent(p.insurance)}
          {...sectionProps("insurance", p.insurance ?? {})}
        >
          <InsuranceContent
            data={p.insurance}
            editing={editingSection === "insurance"}
            draft={(draft as Insurance | null) ?? p.insurance ?? {}}
            setDraft={(d) => setDraft(d)}
          />
        </Section>
      </div>
    </div>
  )
}
