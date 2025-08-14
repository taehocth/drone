import { createFileRoute } from "@tanstack/react-router"

import { PageTitle } from "@/components/layout/PageTitle"
import { Typography } from "@/components/Common/Typography"
import { DroneSimulationCard } from "@/components/Dashboard/DroneSimulationCard"
import { WeatherInfoCard } from "@/components/Dashboard/WeatherInfoCard"

export const Route = createFileRoute("/_layout/simulation")({
  component: Simulation,
})

function Simulation() {
  return (
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

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <DroneSimulationCard />
          <WeatherInfoCard />
        </div>
      </div>
    </div>
  )
}
