import { useEffect } from "react"
import { useQuery } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import { Map, useMap } from "@vis.gl/react-google-maps"

import { UtilsService } from "../client"

// import useAuth from "../hooks/useAuth"

import {
  Box,
  Container,
  Flex,
  Stack,
  Divider,
  Text,
  Spinner,
} from "@chakra-ui/react"
import { ConnectionStatus } from "../enum"
import { ConnectionStatusBadge } from "../components/ui/ConnectionStatusBadge"
import { PageTitle } from "../components/layout/PageTitle"
import { UAVCard } from "../components/Dashboard/UAVCard"
import { GeomagneticCard } from "../components/Dashboard/GeomagneticCard"
import { CustomAdvancedMarker } from "../components/GoogleMap/CustomAdvancedMarker"

export const Route = createFileRoute("/_layout/")({
  component: Dashboard,
})

const DEFAULT_MAP_OPTIONS = {
  zoom: 11,
  center: { lat: 36.7881, lng: 126.4664 },
  gestureHandling: "greedy",
  disableDefaultUI: true,
}

function getGeomagneticKindex() {
  return {
    queryFn: () =>
      UtilsService.geomagneticKindex().then((response) => response.kindex),
    queryKey: ["geomagnetic-kindex"],
  }
}

function Dashboard() {
  // const { user: currentUser } = useAuth()
  const map = useMap("main-drone-map")

  const { data: kindex, isPending } = useQuery({
    ...getGeomagneticKindex(),
  })

  const {
    currentK = 0,
    currentP = 0,
    time: measuredTime = new Date(),
  } = kindex ?? {}

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
              mapId={"e781c578f46f824c"}
              defaultZoom={DEFAULT_MAP_OPTIONS.zoom}
              defaultCenter={DEFAULT_MAP_OPTIONS.center}
              gestureHandling={DEFAULT_MAP_OPTIONS.gestureHandling}
              disableDefaultUI={DEFAULT_MAP_OPTIONS.disableDefaultUI}
            >
              <CustomAdvancedMarker
                uuid="82e41887-0605-48b2-bb54-458eda8b7726"
                position={{ lat: 36.7881, lng: 126.4664 }}
              />
            </Map>
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
          <Text ml={2}>지구자기장 지수 UI</Text>
          <Box display="flex" justifyContent={"center"} alignItems={"center"}>
            {isPending ? (
              <Spinner
                thickness="4px"
                speed="0.65s"
                emptyColor="gray.200"
                color="blue.500"
                size="xl"
              />
            ) : (
              <GeomagneticCard
                currentK={currentK}
                currentP={currentP}
                measuredTime={measuredTime}
              />
            )}
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
