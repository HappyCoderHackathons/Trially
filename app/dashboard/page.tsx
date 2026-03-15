import { PatientProfilePanel } from "@/components/patient-profile-panel"

export default function DashboardPage() {
  return (
    <main className="flex h-screen overflow-hidden bg-background">
      {/* Left half — placeholder for future component */}
      <div className="flex-1 border-r border-border" />

      {/* Right half — patient profile */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <PatientProfilePanel />
      </div>
    </main>
  )
}
