// import { Box, Container, Divider, Heading } from "@chakra-ui/react"
import { createFileRoute, Link, useMatch } from "@tanstack/react-router"
// import { FaArrowLeft } from "react-icons/fa"

export const Route = createFileRoute("/_layout/uav/$uav")({
  component: UAVStatus,
})

function UAVStatus() {
  const match = useMatch({ from: "/_layout/uav/$uav" })
  const uavParam = match.params.uav

  return (
    <div className="w-full">
      <div className="">
        <Link to="/">go back</Link>
      </div>
      {uavParam}
      {/* <div maxW="full">
        <div>
          <Link as="div" to="/">
            <FaArrowLeft />
          </Link>
        </div>
        <h2 size="lg" textAlign={{ base: "center", md: "left" }} py={12}>
          UAV Status {uavParam && `- ${uavParam}`}
        </h2>
        <Divider />
        <div>hello</div>
      </div> */}
    </div>
  )
}
