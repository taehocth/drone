import React, { useState, useEffect } from "react"
import { Map } from "@vis.gl/react-google-maps"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Square,
  Wifi,
  WifiOff,
  PlaneTakeoff,
  PlaneLanding,
  Circle,
} from "lucide-react"
import { CustomAdvancedMarker } from "../GoogleMap/CustomAdvancedMarker"
import { WeatherCard } from "./WeatherCard"

const DEFAULT_MAP_OPTIONS = {
  zoom: 13,
  center: { lat: 36.9645258, lng: 126.3358099 },
  gestureHandling: "greedy",
  disableDefaultUI: true,
}

interface DroneData {
  altitude: number
  speed: number
  battery: number
  latitude?: number
  longitude?: number
  heading?: number
  timestamp: string
}

interface SimulationProps {
  title: string
  type: "qgc" | "mavlink"
  data: DroneData
  isRunning: boolean
  isConnected: boolean
  onStart: () => void
  onStop: () => void
  onTakeoff: () => void
  onLanding: () => void
  onConnect?: () => void
  onDisconnect?: () => void
}

const SimulationCard: React.FC<SimulationProps> = ({
  title,
  type,
  data,
  isRunning,
  isConnected,
  onStart,
  onStop,
  onTakeoff,
  onLanding,
  onConnect,
  onDisconnect,
}) => {
  const getStatusColor = () => {
    if (type === "qgc") {
      return isRunning ? "bg-green-500" : "bg-red-500"
    } else {
      return isConnected ? "bg-green-500" : "bg-red-500"
    }
  }

  const getStatusText = () => {
    if (type === "qgc") {
      return isRunning ? "실행 중" : "중지됨"
    } else {
      return isConnected ? "연결됨" : "연결 안됨"
    }
  }

  const formatTime = (timestamp: string) => {
    const date = new Date(timestamp)
    return date.toLocaleTimeString("ko-KR", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: true,
    })
  }

  return (
    <Card
      className={`w-full ${type === "qgc" ? "bg-purple-50" : "bg-blue-50"}`}
    >
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Circle className={`h-3 w-3 ${getStatusColor()}`} />
            <CardTitle className="text-lg font-semibold">
              {title}: {getStatusText()}
            </CardTitle>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="mb-6 space-y-4">
          {type === "mavlink" && (
            <>
              {/* 기체 정보 섹션 */}
              <div className="border-b border-gray-100 pb-3">
                <h4 className="mb-2 text-sm font-semibold text-gray-700">
                  기체 정보
                </h4>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-600">기체:</span>
                    <span className="text-sm font-medium text-blue-600">
                      Generic Quadcopter
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-600">모델:</span>
                    <span className="text-sm font-medium text-blue-600">
                      Quadrotor x (4001)
                    </span>
                  </div>
                </div>
              </div>

              {/* 비행 데이터 섹션 */}
              <div className="border-b border-gray-100 pb-3">
                <h4 className="mb-2 text-sm font-semibold text-gray-700">
                  비행 성능
                </h4>
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-lg bg-gray-50 p-2">
                    <div className="text-xs text-gray-500">총 거리</div>
                    <div className="text-lg font-bold text-green-600">
                      8.22km
                    </div>
                  </div>
                  <div className="rounded-lg bg-gray-50 p-2">
                    <div className="text-xs text-gray-500">최대 고도차</div>
                    <div className="text-lg font-bold text-orange-600">52m</div>
                  </div>
                  <div className="rounded-lg bg-gray-50 p-2">
                    <div className="text-xs text-gray-500">평균 속도</div>
                    <div className="text-lg font-bold text-purple-600">
                      27.7km/h
                    </div>
                  </div>
                  <div className="rounded-lg bg-gray-50 p-2">
                    <div className="text-xs text-gray-500">최고 속도</div>
                    <div className="text-lg font-bold text-red-600">
                      37.9km/h
                    </div>
                  </div>
                </div>
              </div>

              {/* 위치 정보 섹션 */}
              <div>
                <h4 className="mb-2 text-sm font-semibold text-gray-700">
                  위치 정보
                </h4>
                <div className="flex items-center justify-between rounded-lg bg-blue-50 p-3">
                  <div className="text-center">
                    <div className="text-xs text-gray-500">위도</div>
                    <div className="text-sm font-bold text-blue-700">
                      126.335°
                    </div>
                  </div>
                  <div className="text-gray-300">|</div>
                  <div className="text-center">
                    <div className="text-xs text-gray-500">경도</div>
                    <div className="text-sm font-bold text-blue-700">
                      36.964°
                    </div>
                  </div>
                </div>
              </div>
            </>
          )}

          {type === "qgc" && (
            <div className="space-y-2">
              <div className="flex justify-between">
                <span className="text-sm text-gray-600">배터리:</span>
                <span className="font-medium">{data.battery.toFixed(1)}%</span>
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between">
          <span className="text-xs text-gray-500">
            업데이트 시간: {formatTime(data.timestamp)}
          </span>

          <div className="flex gap-2">
            {type === "qgc" ? (
              <>
                {isRunning ? (
                  <Button size="sm" variant="outline" onClick={onStop}>
                    <Square className="mr-1 h-4 w-4" />
                    중지
                  </Button>
                ) : (
                  <Button size="sm" variant="outline" onClick={onStart}>
                    <Wifi className="mr-1 h-4 w-4" />
                    시작
                  </Button>
                )}
              </>
            ) : (
              <>
                {isConnected ? (
                  <Button size="sm" variant="outline" onClick={onDisconnect}>
                    <WifiOff className="mr-1 h-4 w-4" />
                    연결 해제
                  </Button>
                ) : (
                  <Button size="sm" variant="outline" onClick={onConnect}>
                    <Wifi className="mr-1 h-4 w-4" />
                    연결
                  </Button>
                )}
              </>
            )}

            <Button size="sm" variant="outline" onClick={onTakeoff}>
              <PlaneTakeoff className="mr-1 h-4 w-4" />
              이륙
            </Button>

            <Button size="sm" variant="outline" onClick={onLanding}>
              <PlaneLanding className="mr-1 h-4 w-4" />
              착륙
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

const DroneSimulation: React.FC = () => {
  const [mavlinkData, setMavlinkData] = useState<DroneData>({
    altitude: 100.0,
    speed: 11.2,
    battery: 85.0,
    latitude: 36.9645258,
    longitude: 126.3358099,
    heading: 180,
    timestamp: new Date().toISOString(),
  })

  const [mavlinkConnected, setMavlinkConnected] = useState(false)

  // 시뮬레이션 데이터 업데이트
  useEffect(() => {
    const interval = setInterval(() => {
      const now = new Date().toISOString()

      if (mavlinkConnected) {
        setMavlinkData((prev) => ({
          ...prev,
          altitude: prev.altitude + (Math.random() - 0.5) * 1,
          speed: prev.speed + (Math.random() - 0.5) * 0.5,
          latitude: prev.latitude! + (Math.random() - 0.5) * 0.0001,
          longitude: prev.longitude! + (Math.random() - 0.5) * 0.0001,
          heading: (prev.heading! + Math.random() * 2) % 360,
          timestamp: now,
        }))
      }
    }, 1000)

    return () => clearInterval(interval)
  }, [mavlinkConnected])

  const handleMavlinkConnect = () => {
    setMavlinkConnected(true)
  }

  const handleMavlinkDisconnect = () => {
    setMavlinkConnected(false)
  }

  const handleTakeoff = () => {
    if (mavlinkConnected) {
      setMavlinkData((prev) => ({ ...prev, altitude: prev.altitude + 50 }))
    }
  }

  const handleLanding = () => {
    if (mavlinkConnected) {
      setMavlinkData((prev) => ({
        ...prev,
        altitude: Math.max(0, prev.altitude - 50),
      }))
    }
  }

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">드론 시뮬레이션 대시보드</h2>
        <Badge variant="outline" className="text-sm">
          실시간 모니터링
        </Badge>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* 왼쪽 열: 드론 시뮬레이션과 지도 */}
        <div className="space-y-6">
          <SimulationCard
            title="MAVLink 드론 시뮬레이션"
            type="mavlink"
            data={mavlinkData}
            isRunning={false}
            isConnected={mavlinkConnected}
            onStart={() => {}}
            onStop={() => {}}
            onTakeoff={handleTakeoff}
            onLanding={handleLanding}
            onConnect={handleMavlinkConnect}
            onDisconnect={handleMavlinkDisconnect}
          />

          <Card className="gap-0 pb-0">
            <CardHeader>
              <CardTitle>드론 위치</CardTitle>
              <p className="text-sm text-gray-600">
                실시간 드론 위치 및 비행 경로
              </p>
            </CardHeader>
            <CardContent className="p-0">
              <div className="aspect-video overflow-hidden rounded-b-lg">
                <Map
                  id="drone-simulation-map"
                  mapId="e781c578f46f824c"
                  defaultZoom={DEFAULT_MAP_OPTIONS.zoom}
                  defaultCenter={DEFAULT_MAP_OPTIONS.center}
                  gestureHandling={DEFAULT_MAP_OPTIONS.gestureHandling}
                  disableDefaultUI={DEFAULT_MAP_OPTIONS.disableDefaultUI}
                >
                  {/* 새로운 위치 시작점 마커 */}
                  <CustomAdvancedMarker
                    position={{ lat: 36.9645258, lng: 126.3358099 }}
                  />

                  {/* 실시간 드론 위치 마커 */}
                  {mavlinkConnected &&
                    mavlinkData.latitude &&
                    mavlinkData.longitude && (
                      <CustomAdvancedMarker
                        position={{
                          lat: mavlinkData.latitude,
                          lng: mavlinkData.longitude,
                        }}
                      />
                    )}
                </Map>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* 오른쪽 열: 기상 정보 */}
        <div className="space-y-6">
          <WeatherCard
            weather={{
              temperature: 25,
              windSpeed: 3.2,
              windDirection: "NE",
              condition: "맑음",
              humidity: 65,
            }}
          />
        </div>
      </div>
    </div>
  )
}

export default DroneSimulation
