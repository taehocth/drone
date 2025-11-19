import { NaverMap } from "@/components/Map/NaverMap"
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
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { ConnectionsType } from "@/enum"

import { UavCard } from "./UavCard"
import { Play, Pause, RotateCcw } from "lucide-react"

const DEFAULT_MAP_OPTIONS = {
  zoom: 11,
  center: { lat: 36.7881, lng: 126.4664 },
  gestureHandling: "greedy",
  disableDefaultUI: true,
}

const simulationUavs = [
  {
    id: "sim-drone-001",
    name: "시뮬 드론 1호",
    status: ConnectionsType.Connected,
    battery: 87,
    altitude: 120,
    speed: 15.2,
    location: { lat: 37.5665, lng: 126.978 },
    flightData: [
      { time: "00:00", altitude: 0, speed: 0, battery: 100 },
      { time: "00:15", altitude: 50, speed: 10, battery: 95 },
      { time: "00:30", altitude: 120, speed: 15, battery: 90 },
      { time: "00:45", altitude: 150, speed: 18, battery: 85 },
      { time: "01:00", altitude: 130, speed: 16, battery: 80 },
    ],
    lastUpdate: "실시간",
  },
  {
    id: "sim-drone-002",
    name: "시뮬 드론 2호",
    status: ConnectionsType.Connecting,
    battery: 92,
    altitude: 0,
    speed: 0,
    location: { lat: 37.5635, lng: 126.98 },
    flightData: [
      { time: "00:00", altitude: 0, speed: 0, battery: 100 },
      { time: "00:15", altitude: 30, speed: 8, battery: 95 },
      { time: "00:30", altitude: 75, speed: 10, battery: 90 },
      { time: "00:45", altitude: 90, speed: 14, battery: 85 },
      { time: "01:00", altitude: 85, speed: 13, battery: 80 },
    ],
    lastUpdate: "실시간",
  },
]

const weatherData = {
  temperature: 22,
  windSpeed: 3.5,
  windDirection: "북동",
  condition: "맑음",
  humidity: 45,
}

export function SimulationDashboard() {
  const [selectedUav, setSelectedUav] = useState(simulationUavs[0])
  const [isSimulationRunning, setIsSimulationRunning] = useState(false)
  const [simulationTime, setSimulationTime] = useState(0)

  // GoogleMap 제거: NaverMap은 자체 렌더링으로 대체

  useEffect(() => {
    let interval: NodeJS.Timeout
    if (isSimulationRunning) {
      interval = setInterval(() => {
        setSimulationTime((prev) => prev + 1)
      }, 1000)
    }
    return () => clearInterval(interval)
  }, [isSimulationRunning])

  const handleStartSimulation = () => {
    setIsSimulationRunning(true)
  }

  const handlePauseSimulation = () => {
    setIsSimulationRunning(false)
  }

  const handleResetSimulation = () => {
    setIsSimulationRunning(false)
    setSimulationTime(0)
  }

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`
  }

  return (
    <div className="grid gap-4 p-4 md:gap-6 md:p-6">
      {/* 시뮬레이션 컨트롤 */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            시뮬레이션 컨트롤
            <Badge variant={isSimulationRunning ? "default" : "secondary"}>
              {isSimulationRunning ? "실행 중" : "정지"}
            </Badge>
          </CardTitle>
          <CardDescription>
            시뮬레이션 시간: {formatTime(simulationTime)}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2">
            <Button
              onClick={handleStartSimulation}
              disabled={isSimulationRunning}
              className="flex items-center gap-2"
            >
              <Play className="h-4 w-4" />
              시작
            </Button>
            <Button
              onClick={handlePauseSimulation}
              disabled={!isSimulationRunning}
              variant="outline"
              className="flex items-center gap-2"
            >
              <Pause className="h-4 w-4" />
              일시정지
            </Button>
            <Button
              onClick={handleResetSimulation}
              variant="outline"
              className="flex items-center gap-2"
            >
              <RotateCcw className="h-4 w-4" />
              리셋
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* 드론 미니 카드 */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {simulationUavs.map((uav) => (
          <UavMiniCard
            key={uav.id}
            uav={uav}
            isSelected={selectedUav.id === uav.id}
            onClick={() => setSelectedUav(uav)}
          />
        ))}
      </div>

      {/* 메인 시뮬레이션 영역 */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <Card className="min-h-[500px] gap-0 pb-0 lg:col-span-2">
          <CardHeader>
            <CardTitle>시뮬레이션 맵</CardTitle>
            <CardDescription>드론 비행 시뮬레이션 맵</CardDescription>
          </CardHeader>
          <CardContent className="flex-1 p-0">
            <div className="h-80 overflow-hidden rounded-b-lg sm:h-96 md:h-[28rem] lg:h-[32rem]">
              <NaverMap
                lat={DEFAULT_MAP_OPTIONS.center.lat}
                lng={DEFAULT_MAP_OPTIONS.center.lng}
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle>시뮬레이션 데이터</CardTitle>
            <CardDescription>
              {selectedUav.name} - 실시간 데이터
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

      {/* 하단 카드들 */}
      <div className="grid gap-4 md:grid-cols-2">
        <WeatherCard weather={weatherData} />
        <UavCard uav={selectedUav} />
      </div>
    </div>
  )
}
