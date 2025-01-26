import { Box, Container, Flex, Stack, Text } from "@chakra-ui/react"
import { createFileRoute } from "@tanstack/react-router"
import { Map } from "@vis.gl/react-google-maps"

import { ConnectionStatusBadge } from "../../components/ui/ConnectionStatusBadge"
import { ConnectionStatus } from "../../enum"
import { PageTitle } from "../../components/layout/PageTitle"
// import { Map, useMap } from "@vis.gl/react-google-maps"

// import useAuth from "../../hooks/useAuth"
// import { useEffect } from "react"

export const Route = createFileRoute("/_layout/")({
  component: Dashboard,
})

function Dashboard() {
  // const { user: currentUser } = useAuth()
  // const map = useMap("one-of-my-maps")

  // useEffect(() => {
  //   if (!map) return;

  //   // do something with the map instance
  // }, [map]);

  return (
    <>
      <Container maxW="full">
        <Box pt={12} m={4}>
          {/* <Map id={'one-of-my-maps'} /> */}

          <PageTitle>대시보드</PageTitle>
          <Text as="h2" textStyle="h2">
            실시간 비행 상태 표시
          </Text>
          {/* <Text>
            Hi, {currentUser?.full_name || currentUser?.email} 👋🏼
            실시간 비행 상태 표시
          </Text> */}
          <Stack direction="row" spacing={4}>
            {Object.values(ConnectionStatus).map((status) => {
              return <ConnectionStatusBadge key={status} status={status} />
            })}
          </Stack>
          <Text>
            드론 위치(GPS 좌표). 고도, 속도, 배터리 잔량(볼트), 통신 상태.
          </Text>
          <Flex justify="center" align="center" height="40vh" width="full">
            <Map
              defaultZoom={3}
              defaultCenter={{ lat: 22.54992, lng: 0 }}
              gestureHandling={"greedy"}
              disableDefaultUI={true}
            />
          </Flex>
        </Box>
      </Container>
    </>
  )
}
