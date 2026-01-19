import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Wifi,
  Gauge,
  Battery,
  MapPin,
  Activity,
  Zap,
} from "lucide-react"
import React, { useEffect, MutableRefObject } from "react"
import type { DroneData } from "./DroneSimulation"

interface Props {
  data: DroneData
  connected: boolean
  onToggleConnect: () => void
  // 🔴 중요: 부모에서 내려주는 wsRef 타입 선언 (사용하지 않아도 됨)
  wsRef?: MutableRefObject<WebSocket | null>
}

export const DroneSimulationCard: React.FC<Props> = ({
  data,
  connected,
  onToggleConnect,
  wsRef, // ← 현재는 사용 안 하지만 Props 일치를 위해 반드시 필요
}) => {
  /* -----------------------------------------
   * GPS → 지도 이벤트 (GPS 있을 때만)
   * ----------------------------------------- */
  useEffect(() => {
    if (
      typeof data.latitude === "number" &&
      typeof data.longitude === "number"
    ) {
      window.dispatchEvent(
        new CustomEvent("dronePositionUpdate", {
          detail: {
            lat: data.latitude,
            lng: data.longitude,
            yaw: data.yaw ?? 0,
          },
        }),
      )
    }
  }, [data.latitude, data.longitude, data.yaw])

  return (
    <Card className="mx-auto w-full max-w-2xl rounded-2xl border bg-gradient-to-br from-white to-gray-50 shadow-md dark:from-gray-900 dark:to-gray-800">
      {/* ================= Header ================= */}
      <CardHeader className="flex flex-row items-center justify-between border-b pb-3">
        <CardTitle className="flex items-center gap-2 text-lg font-semibold">
          <Gauge className="h-5 w-5 text-blue-500" />
          드론 상태
        </CardTitle>

        <Badge
          className={`flex items-center gap-1 ${
            connected
              ? "bg-green-500/10 text-green-600"
              : "bg-gray-500/10 text-gray-600"
          }`}
        >
          <Wifi className="h-3 w-3" />
          {connected ? "연결됨" : "연결 안 됨"}
        </Badge>
      </CardHeader>

      {/* ================= Content ================= */}
      <CardContent className="space-y-4 p-5 text-sm">
        <div className="grid grid-cols-2 gap-x-6 gap-y-3">
          {/* 고도 */}
          <div className="flex justify-between">
            <span className="text-muted-foreground">고도</span>
            <span className="font-medium">
              {data.altitude.toFixed(2)} m
            </span>
          </div>

          {/* 속도 */}
          <div className="flex justify-between">
            <span className="text-muted-foreground">속도</span>
            <span className="font-medium">
              {data.speed.toFixed(2)} km/h
            </span>
          </div>

          {/* 배터리 */}
          <div className="flex justify-between">
            <span className="text-muted-foreground">배터리</span>
            <span className="flex items-center gap-1 font-medium">
              <Battery
                className={`h-4 w-4 ${
                  data.battery > 20
                    ? "text-green-500"
                    : data.battery > 10
                    ? "text-yellow-500"
                    : "text-red-500"
                }`}
              />
              {data.battery.toFixed(0)} %
            </span>
          </div>

          {/* 스로틀 */}
          <div className="flex justify-between">
            <span className="text-muted-foreground">스로틀</span>
            <span className="flex items-center gap-1 font-medium">
              <Zap className="h-4 w-4 text-yellow-500" />
              N/A
            </span>
          </div>

          {/* 자세 */}
          <div className="col-span-2 flex justify-between">
            <span className="flex items-center gap-1 text-muted-foreground">
              <Activity className="h-4 w-4 text-blue-500" />
              자세 (R / P / Y)
            </span>
            <span className="font-medium">
              {`${(data.roll ?? 0).toFixed(2)}° / ${(data.pitch ?? 0).toFixed(
                2,
              )}° / ${(data.yaw ?? 0).toFixed(2)}°`}
            </span>
          </div>

          {/* 위치 */}
          <div className="col-span-2 flex justify-between">
            <span className="flex items-center gap-1 text-muted-foreground">
              <MapPin className="h-4 w-4 text-red-500" />
              위치
            </span>
            <span className="font-medium">
              {typeof data.latitude === "number" &&
              typeof data.longitude === "number"
                ? `${data.latitude.toFixed(5)}, ${data.longitude.toFixed(5)}`
                : "GPS 없음"}
            </span>
          </div>
        </div>

        {/* ================= Actions ================= */}
        <div className="flex justify-end pt-4">
          <Button
            onClick={onToggleConnect}
            variant={connected ? "outline" : "default"}
            size="sm"
          >
            {connected ? "연결 해제" : "연결"}
          </Button>
        </div>

        {/* ================= Footer ================= */}
        <div className="mt-3 border-t pt-2 text-xs text-muted-foreground">
          마지막 업데이트:{" "}
          {new Date(data.timestamp).toLocaleTimeString("ko-KR")}
        </div>
      </CardContent>
    </Card>
  )
}
