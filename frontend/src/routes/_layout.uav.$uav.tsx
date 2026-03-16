import { createFileRoute, Link } from "@tanstack/react-router"
import { DashboardBackground } from "@/components/layout/DashboardBackground"

export const Route = createFileRoute("/_layout/uav/$uav")({
  component: UAVStatus,
})

function UAVStatus() {
  const params = Route.useParams() as { uav?: string }

  return (
    <DashboardBackground variant="uav">
      <div className="container">
        <div className="m-4 pt-12">
          <div>
            <Link to="/">go back</Link>
          </div>
          {params.uav}
        </div>
      </div>
    </DashboardBackground>
  )
}
