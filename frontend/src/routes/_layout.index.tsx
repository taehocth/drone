import { useEffect } from "react"
import { useQuery } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import { Map, useMap } from "@vis.gl/react-google-maps"

import { UtilsService } from "../client"

import { ConnectionStatus } from "../enum"
import { ConnectionStatusBadge } from "../components/ui/ConnectionStatusBadge"
import { PageTitle } from "../components/layout/PageTitle"
import { UAVCard } from "../components/Dashboard/UAVCard"
// import { CustomAdvancedMarker } from "../components/GoogleMap/CustomAdvancedMarker"
import { Typography } from "../components/Common/Typography"
import { LoadingSpinner } from "@/components/Common/LoadingSpinner"
import { GeomagneticChart } from "@/components/Dashboard/GeomagneticChart"
import { Separator } from "@/components/ui/separator"

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
  const map = useMap("main-drone-map")

  const { data: kindexData, isPending } = useQuery({
    ...getGeomagneticKindex(),
  })

  useEffect(() => {
    if (!map) return

    map.setOptions(DEFAULT_MAP_OPTIONS)
    // do something with the map instance
  }, [map])

  return (
    <div className="container">
      <div className="pt-12 m-4">
        <PageTitle>대시보드</PageTitle>
        <Typography variant="h4">실시간 비행 상태 표시</Typography>
        <div className="flex justify-center items-center h-[40vh] w-full">
          <Map
            id={"one-of-my-maps"}
            mapId={"e781c578f46f824c"}
            defaultZoom={DEFAULT_MAP_OPTIONS.zoom}
            defaultCenter={DEFAULT_MAP_OPTIONS.center}
            gestureHandling={DEFAULT_MAP_OPTIONS.gestureHandling}
            disableDefaultUI={DEFAULT_MAP_OPTIONS.disableDefaultUI}
          >
            {/* <CustomAdvancedMarker
                uuid="82e41887-0605-48b2-bb54-458eda8b7726"
                position={{ lat: 36.7881, lng: 126.4664 }}
              /> */}
          </Map>
        </div>

        <div className="p-2 my-4 border-1 border-gray-200 rounded-lg">
          <Typography>통신 상태 표시 UI 3 종류</Typography>
          <div className="flex gap-4">
            {Object.values(ConnectionStatus).map((status) => {
              return <ConnectionStatusBadge key={status} status={status} />
            })}
          </div>
        </div>
        <Typography className="ml-2">지구자기장 지수 UI</Typography>
        <div className="flex justify-center items-center">
          {isPending ? (
            <LoadingSpinner />
          ) : (
            <div>
              <GeomagneticChart kindexRecent={kindexData?.recent} />
            </div>
          )}
        </div>
      </div>
      <Separator />
      <div>
        <UAVCard id={123} />
        <UAVCard id={456} />
        <UAVCard id={789} />
      </div>
    </div>
  )
}
