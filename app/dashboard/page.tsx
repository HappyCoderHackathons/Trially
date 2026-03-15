import { AppHeader } from "@/components/app-header"
import { PatientProfilePanel } from "@/components/patient-profile-panel"
import { StarredTrialsPanel } from "@/components/starred-trials-panel"

export default function DashboardPage() {
  return (
    <main className="flex h-screen flex-col overflow-hidden bg-background">
      <AppHeader showDashboardLink />

      <div className="flex flex-1 min-h-0">
        {/* Left half — starred trials */}
        <div className="flex flex-1 flex-col overflow-hidden border-r border-border">
          <StarredTrialsPanel />
        </div>

        {/* Right half — patient profile */}
        <div className="flex flex-1 flex-col overflow-hidden">
          <PatientProfilePanel />
        </div>
      </div>
    </main>
  )
}
