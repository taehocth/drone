import { createFileRoute } from "@tanstack/react-router"
import { FlightLogDashboard } from "@/components/Dashboard/FlightLogDashboard"

export const Route = createFileRoute("/_layout/flight-log")({
  component: FlightLog,
})

function FlightLog() {
  return (
    <div className="page page-flight-log">
      <div className="container page-shell">
        <div className="m-4 pt-12 page-content">
          <FlightLogDashboard />
        </div>
      </div>
    </div>
  )
}

