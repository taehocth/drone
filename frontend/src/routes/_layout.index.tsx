import { createFileRoute } from "@tanstack/react-router"

import { PageTitle } from "@/components/layout/PageTitle"
// import { CustomAdvancedMarker } from "@/components/GoogleMap/CustomAdvancedMarker"
import { Typography } from "@/components/Common/Typography"
import { Separator } from "@/components/ui/separator"
import { UavDashboard } from "@/components/Dashboard/UavDashboard"
import { DashboardBackground } from "@/components/layout/DashboardBackground"

export const Route = createFileRoute("/_layout/")({
  component: Dashboard,
})

function Dashboard() {
  return (
    <DashboardBackground variant="dashboard">
      <div className="container">
        <div className="m-4 pt-12">
          <PageTitle>대시보드</PageTitle>
          <Typography variant="h4">실시간 비행 상태</Typography>
          <UavDashboard />
          <Separator />
          <div className="flex h-[40vh] w-full items-center justify-center"></div>
        </div>
      </div>
    </DashboardBackground>
  )
}
