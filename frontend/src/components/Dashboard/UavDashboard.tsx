import { Map as GoogleMap, useMap } from "@vis.gl/react-google-maps"
import { useEffect, useState } from "react"

import { FlightDataChart } from "@/components/Dashboard/FlightDataChart"
import { UavMiniCard } from "@/components/Dashboard/UavMiniCard"
import { WeatherCard } from "@/components/Dashboard/WeatherCard"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ConnectionsType } from "@/enum"
import { CustomAdvancedMarker } from "../GoogleMap/CustomAdvancedMarker"
import { UavCard } from "./UavCard"

const DEFAULT_MAP_OPTIONS = {
  zoom: 11,
  center: { lat: 36.7881, lng: 126.4664 },
  gestureHandling: "greedy",
  disableDefaultUI: true,
}

const uavs = [
  {
    id: "drone-001",
    name: "드론 1호",
    status: ConnectionsType.Connected,
    battery: 87,
    altitude: 120,
    speed: 15.2,
    location: { lat: 37.5665, lng: 126.978 },
    flightData: [
      { time: "09:00", altitude: 50, speed: 10, battery: 100 },
      { time: "09:15", altitude: 120, speed: 15, battery: 95 },
      { time: "09:30", altitude: 150, speed: 18, battery: 90 },
      { time: "09:45", altitude: 130, speed: 16, battery: 85 },
      { time: "10:00", altitude: 100, speed: 12, battery: 80 },
    ],
    lastUpdate: "2분 전",
  },
  {
    id: "drone-002",
    name: "드론 2호",
    status: ConnectionsType.Connecting,
    battery: 92,
    altitude: 0,
    speed: 0,
    location: { lat: 37.5635, lng: 126.98 },
    flightData: [
      { time: "09:00", altitude: 60, speed: 8, battery: 45 },
      { time: "09:15", altitude: 75, speed: 10, battery: 40 },
      { time: "09:30", altitude: 90, speed: 14, battery: 35 },
      { time: "09:45", altitude: 85, speed: 13, battery: 30 },
      { time: "10:00", altitude: 85, speed: 12.8, battery: 23 },
    ],

    lastUpdate: "5분 전",
  },
  {
    id: "drone-003",
    name: "드론 3호",
    status: ConnectionsType.Disconnected,
    battery: 23,
    altitude: 85,
    speed: 12.8,
    location: { lat: 37.5695, lng: 126.975 },
    flightData: [
      { time: "09:00", altitude: 45, speed: 12, battery: 25 },
      { time: "09:15", altitude: 30, speed: 8, battery: 20 },
      { time: "09:30", altitude: 15, speed: 5, battery: 15 },
      { time: "09:45", altitude: 5, speed: 2, battery: 10 },
      { time: "10:00", altitude: 0, speed: 0, battery: 5 },
    ],

    lastUpdate: "1분 전",
  },
  {
    id: "drone-004",
    name: "드론 4호",
    status: ConnectionsType.Disconnected,
    battery: 5,
    altitude: 0,
    speed: 0,
    location: { lat: 37.5615, lng: 126.982 },
    flightData: [
      { time: "09:00", altitude: 0, speed: 0, battery: 100 },
      { time: "09:15", altitude: 0, speed: 0, battery: 98 },
      { time: "09:30", altitude: 0, speed: 0, battery: 96 },
      { time: "09:45", altitude: 0, speed: 0, battery: 94 },
      { time: "10:00", altitude: 0, speed: 0, battery: 92 },
    ],
    lastUpdate: "15분 전",
  },
]

const weatherData = {
  temperature: 22,
  windSpeed: 3.5,
  windDirection: "북동",
  condition: "맑음",
  humidity: 45,
}

export function UavDashboard() {
  const [selectedUav, setSelectedUav] = useState(uavs[0])

  const map = useMap("main-drone-map")

  useEffect(() => {
    if (!map) return

    map.setOptions(DEFAULT_MAP_OPTIONS)
    // do something with the map instance
  }, [map])

  return (
    <div className="grid gap-4 p-4 md:gap-6 md:p-6">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {uavs.map((uav) => (
          <UavMiniCard
            key={uav.id}
            uav={uav}
            isSelected={selectedUav.id === uav.id}
            onClick={() => setSelectedUav(uav)}
          />
        ))}
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <Card className="gap-0 pb-0 lg:col-span-2">
          <CardHeader>
            <CardTitle>드론 위치</CardTitle>
            <CardDescription>실시간 드론 위치 및 비행 경로</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <div className="aspect-video overflow-hidden rounded-b-lg">
              <GoogleMap
                id={"one-of-my-maps"}
                mapId={"e781c578f46f824c"}
                defaultZoom={DEFAULT_MAP_OPTIONS.zoom}
                defaultCenter={DEFAULT_MAP_OPTIONS.center}
                gestureHandling={DEFAULT_MAP_OPTIONS.gestureHandling}
                disableDefaultUI={DEFAULT_MAP_OPTIONS.disableDefaultUI}
              >
                <CustomAdvancedMarker
                  position={{ lat: 36.7881, lng: 126.4664 }}
                />
              </GoogleMap>
              {/* <DroneMap drones={drones} selectedDroneId={selectedDrone.id} /> */}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle>비행 기록</CardTitle>
            <CardDescription>
              {selectedUav.name} - {new Date().toLocaleDateString("ko-KR")}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="altitude">
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="altitude">고도</TabsTrigger>
                <TabsTrigger value="speed">속도</TabsTrigger>
                <TabsTrigger value="battery">배터리</TabsTrigger>
              </TabsList>
              <TabsContent value="altitude">
                <FlightDataChart
                  data={selectedUav.flightData}
                  dataKey="altitude"
                  label="고도 (m)"
                  color="hsl(var(--chart-1))"
                />
              </TabsContent>
              <TabsContent value="speed">
                <FlightDataChart
                  data={selectedUav.flightData}
                  dataKey="speed"
                  label="속도 (m/s)"
                  color="hsl(var(--chart-2))"
                />
              </TabsContent>
              <TabsContent value="battery">
                <FlightDataChart
                  data={selectedUav.flightData}
                  dataKey="battery"
                  label="배터리 (%)"
                  color="hsl(var(--chart-3))"
                />
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <WeatherCard weather={weatherData} />

        <UavCard uav={selectedUav} />
      </div>
    </div>
  )
}
