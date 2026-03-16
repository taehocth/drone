import { createFileRoute } from "@tanstack/react-router"

import { PageTitle } from "@/components/layout/PageTitle"
import { Typography } from "@/components/Common/Typography"
import DroneSimulation from "@/components/Dashboard/DroneSimulation"
import { DashboardBackground } from "@/components/layout/DashboardBackground"

export const Route = createFileRoute("/_layout/simulation")({
  component: Simulation,
})

function Simulation() {
  return (
    <DashboardBackground variant="simulation">
      <div className="container">
        <div className="m-4 pt-12">
          <div className="mb-6 flex items-center justify-between">
            <div>
              <PageTitle>드론 시뮬레이션</PageTitle>
              <Typography variant="h4">드론 시뮬레이션 대시보드</Typography>
            </div>
            <Typography className="text-muted-foreground text-sm">
              실시간 모니터링
            </Typography>
          </div>

          <DroneSimulation />
        </div>
      </div>
    </DashboardBackground>
  )
}
