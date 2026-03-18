import { createFileRoute } from "@tanstack/react-router"
import { PageTitle } from "@/components/layout/PageTitle"
import { FlightChecklistDashboard } from "@/components/Dashboard/FlightChecklistDashboard"

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
    <div className="container">
      <div className="m-4 pt-12 page-content">
        <div className="page-hero">
          <PageTitle>{formattedDate}자 비행 체크리스트</PageTitle>
        </div>
        <FlightChecklistDashboard />
      </div>
    </div>
  )
}
