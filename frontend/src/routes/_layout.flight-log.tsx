import { createFileRoute } from "@tanstack/react-router"
import { FlightLogDashboard } from "@/components/Dashboard/FlightLogDashboard"

export const Route = createFileRoute("/_layout/flight-log")({
  component: FlightLog,
})

function FlightLog() {
  return (
    <div className="container">
      <div className="m-4 pt-12 page-content">
        <FlightLogDashboard />
      </div>
    </div>
  )
}

