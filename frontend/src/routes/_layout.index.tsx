import { Box, Container, Flex, Stack, Divider, Text } from "@chakra-ui/react"
import { createFileRoute } from "@tanstack/react-router"

import { Map, useMap } from "@vis.gl/react-google-maps"

import { ConnectionStatusBadge } from "../components/ui/ConnectionStatusBadge"
import { ConnectionStatus } from "../enum"
import { PageTitle } from "../components/layout/PageTitle"

// import useAuth from "../hooks/useAuth"
import { useEffect } from "react"
import { UAVCard } from "../components/Dashboard/UAVCard"

export const Route = createFileRoute("/_layout/")({
  component: Dashboard,
})

const DEFAULT_MAP_OPTIONS = {
  zoom: 11,
  center: { lat: 36.7881, lng: 126.4664 },
  gestureHandling: "greedy",
  disableDefaultUI: true,
}

function Dashboard() {
  // const { user: currentUser } = useAuth()
  const map = useMap("main-drone-map")

  useEffect(() => {
    if (!map) return

    map.setOptions(DEFAULT_MAP_OPTIONS)
    // do something with the map instance
  }, [map])

  return (
    <>
      <Container maxW="full">
        <Box pt={12} m={4}>
          <PageTitle>대시보드</PageTitle>
          <Text as="h2" textStyle="h2">
            실시간 비행 상태 표시
          </Text>
          <Flex justify="center" align="center" height="40vh" width="full">
            <Map
              id={"one-of-my-maps"}
              defaultZoom={DEFAULT_MAP_OPTIONS.zoom}
              defaultCenter={DEFAULT_MAP_OPTIONS.center}
              gestureHandling={DEFAULT_MAP_OPTIONS.gestureHandling}
              disableDefaultUI={DEFAULT_MAP_OPTIONS.disableDefaultUI}
            />
          </Flex>

          {/* <Text>
            Hi, {currentUser?.full_name || currentUser?.email} 👋🏼
            실시간 비행 상태 표시
          </Text> */}
          <Box
            p={2}
            my={4}
            border="1px"
            borderColor="gray.200"
            borderRadius={8}
          >
            <Text>통신 상태 표시 UI 3 종류</Text>
            <Stack direction="row" spacing={4}>
              {Object.values(ConnectionStatus).map((status) => {
                return <ConnectionStatusBadge key={status} status={status} />
              })}
            </Stack>
          </Box>
        </Box>
        <Divider />
        <Flex>
          <UAVCard id={123} />
          <UAVCard id={456} />
          <UAVCard id={789} />
        </Flex>
      </Container>
    </>
  )
}
