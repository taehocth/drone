import { createFileRoute, Link } from "@tanstack/react-router"

export const Route = createFileRoute("/_layout/uav/$uav")({
  component: UAVStatus,
})

function UAVStatus() {
  const params = Route.useParams() as { uav?: string }

  return (
    <div className="container">
      <div className="m-4 pt-12 page-content">
        <div className="page-hero">
          <Link to="/">go back</Link>
        </div>
        {params.uav}
      </div>
    </div>
  )
}
