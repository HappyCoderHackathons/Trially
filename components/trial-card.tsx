import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card"
import { MapPin, Calendar, Users, Building2, Clock, Star } from "lucide-react"
import { useState } from "react"

export interface Trial {
  id: string
  name: string
  description: string
  location: string | null
  sponsor: string
  phase: string
  enrollmentStatus: "Recruiting" | "Not Recruiting" | "Completed" | "Active"
  startDate: string
  participantsNeeded: number
}

interface TrialCardProps {
  trial: Trial
}

export function TrialCard({ trial }: TrialCardProps) {
  const [starred, setStarred] = useState(false)

  const statusColors = {
    Recruiting: "bg-green-100 text-green-700",
    "Not Recruiting": "bg-amber-100 text-amber-700",
    Completed: "bg-muted text-muted-foreground",
    Active: "bg-primary/20 text-primary-foreground",
  }

  return (
    <Card className="hover:shadow-md transition-shadow bg-card/80 backdrop-blur-sm">
      <CardHeader>
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1 flex-1">
            <CardTitle className="text-lg text-foreground">{trial.name}</CardTitle>
            <CardDescription className="line-clamp-2">{trial.description}</CardDescription>
          </div>
          <span className={`px-3 py-1 rounded-full text-xs font-medium whitespace-nowrap ${statusColors[trial.enrollmentStatus]}`}>
            {trial.enrollmentStatus}
          </span>

                  <button
            type="button"
            onClick={async () => {
              const next = !starred
              setStarred(next)

              // Send to backend for persisted favorites
              try {
                const tokenRaw = window.localStorage.getItem("trially_cognito_session")
                const idToken = tokenRaw ? (JSON.parse(tokenRaw) as { idToken?: string }).idToken : undefined
                const headers: Record<string, string> = { "Content-Type": "application/json" }
                if (idToken) headers.Authorization = `Bearer ${idToken}`

                await fetch("/api/trials/star", {
                  method: next ? "POST" : "DELETE",
                  headers,
                  body: JSON.stringify({ trialId: trial.id, trial }),
                })
              } catch (err) {
                console.error("Failed to sync starred trial:", err)
              }
            }}
            className="flex items-center justify-center rounded-full p-2 text-muted-foreground hover:bg-muted/40 focus:outline-none focus:ring-2 focus:ring-primary"
            aria-label={starred ? "Unstar trial" : "Star trial"}
          >
            <Star
              className={`w-5 h-5 ${starred ? "text-amber-400" : "text-muted-foreground"}`}
            />
          </button>
        </div>
      </CardHeader>
      
      <CardContent>
        <div className="grid grid-cols-2 gap-4">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <MapPin className="w-4 h-4 text-primary" />
            <span>{trial.location}</span>
          </div>
          
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Building2 className="w-4 h-4 text-primary" />
            <span>{trial.sponsor}</span>
          </div>
          
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Clock className="w-4 h-4 text-primary" />
            <span>Phase {trial.phase}</span>
          </div>
          
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Users className="w-4 h-4 text-primary" />
            <span>{trial.participantsNeeded} participants</span>
          </div>
          
          <div className="flex items-center gap-2 text-sm text-muted-foreground col-span-2">
            <Calendar className="w-4 h-4 text-primary" />
            <span>Started {trial.startDate}</span>
          </div>
        </div>
      </CardContent>
      
      <CardFooter>
        <button className="w-full py-2.5 px-4 bg-primary hover:bg-primary/90 text-primary-foreground rounded-full text-sm font-medium transition-colors">
          View Details
        </button>
      </CardFooter>
    </Card>
  )
}
