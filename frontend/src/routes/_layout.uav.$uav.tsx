import { Box, Container, Divider, Heading } from "@chakra-ui/react"
import { createFileRoute, useMatch } from "@tanstack/react-router"

export const Route = createFileRoute("/_layout/uav/$uav")({
  component: UAVStatus,
})

function UAVStatus() {
  const match = useMatch({ from: "/_layout/uav/$uav" })
  const uavParam = match.params.uav

  return (
    <Container maxW="full">
      <Heading size="lg" textAlign={{ base: "center", md: "left" }} py={12}>
        UAV Status {uavParam && `- ${uavParam}`}
      </Heading>
      <Divider />
      <Box>hello</Box>
    </Container>
  )
}
