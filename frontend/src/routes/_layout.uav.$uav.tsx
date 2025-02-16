import { Box, Container, Divider, Heading } from "@chakra-ui/react"
import { createFileRoute, Link, useMatch } from "@tanstack/react-router"
import { FaArrowLeft } from "react-icons/fa"

export const Route = createFileRoute("/_layout/uav/$uav")({
  component: UAVStatus,
})

function UAVStatus() {
  const match = useMatch({ from: "/_layout/uav/$uav" })
  const uavParam = match.params.uav

  return (
    <Container maxW="full">
      <Box>
        <Link as="div" to="/">
          <FaArrowLeft />
        </Link>
      </Box>
      <Heading size="lg" textAlign={{ base: "center", md: "left" }} py={12}>
        UAV Status {uavParam && `- ${uavParam}`}
      </Heading>
      <Divider />
      <Box>hello</Box>
    </Container>
  )
}
