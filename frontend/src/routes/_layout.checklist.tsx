import { createFileRoute } from "@tanstack/react-router"

import { PageTitle } from "@/components/layout/PageTitle"
import { FlightChecklistDashboard } from "@/components/Dashboard/FlightChecklistDashboard"

export const Route = createFileRoute("/_layout/checklist")({
  component: Checklist,
})

function Checklist() {
  return (
    <div className="container">
      <div className="m-4 pt-12">
        <div className="mb-6">
          <PageTitle>비행 체크리스트 - 테스트 변경</PageTitle>
        </div>
        <FlightChecklistDashboard />
      </div>
    </div>
  )
}
