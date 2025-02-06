import {
  Box,
  Container,
  Flex,
  Stack,
  Divider,
  Text,
  Icon,
} from "@chakra-ui/react"
import { createFileRoute } from "@tanstack/react-router"

import { Map, useMap } from "@vis.gl/react-google-maps"

import { ConnectionStatusBadge } from "../components/ui/ConnectionStatusBadge"
import { ConnectionStatus } from "../enum"
import { PageTitle } from "../components/layout/PageTitle"

// import useAuth from "../hooks/useAuth"
import { useEffect } from "react"
import { UAVCard } from "../components/Dashboard/UAVCard"
import HalfCircularProgress from "../components/Common/HalfCircularProgress"
import { UtilsService } from "../client"
import { useQuery } from "@tanstack/react-query"
import { FaRegQuestionCircle } from "react-icons/fa"
import { FiClock } from "react-icons/fi"

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

  const {
    data: kindex,
    isPending,
    isPlaceholderData,
  } = useQuery({
    ...getGeomagneticKindex(),
  })

  const {
    currentK = 0,
    currentP = 0,
    time: measuredTime = new Date(),
  } = kindex ?? {}

  console.log(
    "zzkindex, isPending, isPlaceholderData",
    kindex,
    isPending,
    isPlaceholderData,
  )

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
          <Text ml={2}>지구자기장 지수 UI (실제 API 연동 완료)</Text>
          <Box
            p={4}
            pb={2}
            m={2}
            w={"fit-content"}
            border="1px"
            borderColor="gray.200"
            borderRadius={8}
            shadow="md"
          >
            <Flex justify="space-between" gap={4}>
              <Box>
                <Flex align="center" gap={1}>
                  <Text as="h3" textStyle="h3">
                    Kp 지수
                  </Text>
                  <Icon as={FaRegQuestionCircle} boxSize={3} cursor="pointer" />
                </Flex>
                <Text fontSize="xs" color="gray.500">
                  미국 관측소 데이터
                </Text>
                <HalfCircularProgress value={currentK * 10} label={currentK} />
              </Box>
              <Box>
                <Flex align="center" gap={1}>
                  <Text as="h3" textStyle="h3">
                    Kk 지수
                  </Text>
                  <Icon as={FaRegQuestionCircle} boxSize={3} cursor="pointer" />
                </Flex>
                <Text fontSize="xs" color="gray.500">
                  국내 3개 관측소의 데이터
                </Text>
                <HalfCircularProgress value={currentP * 10} label={currentP} />
              </Box>
            </Flex>
            <Flex mt={4} justify={"end"} align={"center"} gap={1}>
              <Icon as={FiClock} boxSize={3} />
              <Text fontSize={"x-small"}>{measuredTime.toLocaleString()}</Text>
            </Flex>
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
