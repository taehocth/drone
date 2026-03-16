import { createFileRoute } from "@tanstack/react-router"
import { PageTitle } from "@/components/layout/PageTitle"
import { FlightChecklistDashboard } from "@/components/Dashboard/FlightChecklistDashboard"
import { DashboardBackground } from "@/components/layout/DashboardBackground"

export const Route = createFileRoute("/_layout/checklist")({
  component: Checklist,
})

function Checklist() {
  // 오늘 날짜 구하기
  const today = new Date()
  const formattedDate = today.toLocaleDateString("ko-KR", {
    month: "long", // "월"SSS
    day: "numeric", // "일"
  })

  return (
    <DashboardBackground variant="checklist">
      <div className="container">
        <div className="m-4 pt-12">
          <div className="mb-6">
            <PageTitle>{formattedDate}자 비행 체크리스트</PageTitle>
          </div>
          <FlightChecklistDashboard />
        </div>
      </div>
    </DashboardBackground>
  )
}
