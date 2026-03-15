import { AppHeader } from "@/components/app-header"
import { PatientProfilePanel } from "@/components/patient-profile-panel"

export default function DashboardPage() {
  return (
    <main className="flex h-screen flex-col overflow-hidden bg-background">
      <AppHeader showDashboardLink />

      <div className="flex flex-1 min-h-0">
        {/* Left half — placeholder for future component (do not modify) */}
        <div className="flex-1 border-r border-border" />

        {/* Right half — patient profile */}
        <div className="flex flex-1 flex-col overflow-hidden">
          <PatientProfilePanel />
        </div>
      </div>
    </main>
  )
}
