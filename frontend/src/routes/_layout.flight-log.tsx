import { createFileRoute } from "@tanstack/react-router"
import { FlightLogDashboard } from "@/components/Dashboard/FlightLogDashboard"
import { DashboardBackground } from "@/components/layout/DashboardBackground"

export const Route = createFileRoute("/_layout/flight-log")({
  component: FlightLog,
})

function FlightLog() {
  return (
    <DashboardBackground variant="flight-log">
      <div className="container">
        <div className="m-4 pt-12">
          <FlightLogDashboard />
        </div>
      </div>
    </DashboardBackground>
  )
}

