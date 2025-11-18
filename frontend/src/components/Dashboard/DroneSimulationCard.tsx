import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Wifi, WifiOff, PlaneTakeoff, PlaneLanding } from "lucide-react"

interface DroneData {
  connected: boolean
  aircraft: string
  model: string
  totalDistance: string
  maxAltitudeDiff: string
  averageSpeed: string
  maxSpeed: string
  latitude: string
  longitude: string
  lastUpdate: string
}

export function DroneSimulationCard() {
  const [droneData, setDroneData] = useState<DroneData>({
    connected: false,
    aircraft: "Generic Quadcopter",
    model: "Quadrotor x (4001)",
    totalDistance: "8.22km",
    maxAltitudeDiff: "52m",
    averageSpeed: "27.7km/h",
    maxSpeed: "37.9km/h",
    latitude: "126.335°",
    longitude: "36.964°",
    lastUpdate: new Date().toLocaleTimeString("ko-KR", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: true,
    }),
  })

  useEffect(() => {
    const interval = setInterval(() => {
      setDroneData((prev) => ({
        ...prev,
        lastUpdate: new Date().toLocaleTimeString("ko-KR", {
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
          hour12: true,
        }),
      }))
    }, 1000)

    return () => clearInterval(interval)
  }, [])

  const handleConnect = () => {
    setDroneData((prev) => ({ ...prev, connected: !prev.connected }))
  }

  const handleTakeoff = () => {
    if (droneData.connected) {
      console.log("이륙 명령 전송")
    }
  }

  const handleLanding = () => {
    if (droneData.connected) {
      console.log("착륙 명령 전송")
    }
  }

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Wifi className="h-5 w-5" />
          MAVLink 드론 시뮬레이션:
          <Badge
            variant={droneData.connected ? "default" : "destructive"}
            className="flex items-center gap-1"
          >
            {droneData.connected ? (
              <>
                <Wifi className="h-3 w-3" />
                연결됨
              </>
            ) : (
              <>
                <WifiOff className="h-3 w-3" />
                연결 안됨
              </>
            )}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* 기체 정보 */}
        <div className="space-y-2">
          <h4 className="text-sm font-semibold">기체 정보</h4>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">기체:</span>
              <span>{droneData.aircraft}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">모델:</span>
              <span>{droneData.model}</span>
            </div>
          </div>
        </div>

        {/* 비행 성능 */}
        <div className="space-y-2">
          <h4 className="text-sm font-semibold">비행 성능</h4>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">총 거리:</span>
              <span className="font-medium text-green-600">
                {droneData.totalDistance}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">최대 고도차:</span>
              <span className="font-medium text-orange-600">
                {droneData.maxAltitudeDiff}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">평균 속도:</span>
              <span className="font-medium text-purple-600">
                {droneData.averageSpeed}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">최고 속도:</span>
              <span className="font-medium text-red-600">
                {droneData.maxSpeed}
              </span>
            </div>
          </div>
        </div>

        {/* 위치 정보 */}
        <div className="space-y-2">
          <h4 className="text-sm font-semibold">위치 정보</h4>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">위도:</span>
              <span className="font-medium text-blue-600">
                {droneData.latitude}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">경도:</span>
              <span className="font-medium text-blue-600">
                {droneData.longitude}
              </span>
            </div>
          </div>
        </div>

        {/* 업데이트 시간 */}
        <div className="text-muted-foreground text-xs">
          업데이트 시간: {droneData.lastUpdate}
        </div>

        {/* 액션 버튼들 */}
        <div className="flex gap-2 pt-2">
          <Button
            onClick={handleConnect}
            variant={droneData.connected ? "outline" : "default"}
            size="sm"
            className="flex-1"
          >
            {droneData.connected ? "연결 해제" : "연결"}
          </Button>
          <Button
            onClick={handleTakeoff}
            disabled={!droneData.connected}
            size="sm"
            className="flex-1"
          >
            <PlaneTakeoff className="mr-1 h-4 w-4" />
            이륙
          </Button>
          <Button
            onClick={handleLanding}
            disabled={!droneData.connected}
            size="sm"
            className="flex-1"
          >
            <PlaneLanding className="mr-1 h-4 w-4" />
            착륙
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
