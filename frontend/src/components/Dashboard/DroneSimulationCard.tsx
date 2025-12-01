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
  Ruler,
} from "lucide-react"
import React from "react"
import type { DroneData } from "./DroneSimulation"

interface Props {
  data: DroneData
  connected: boolean
  onToggleConnect: () => void
  wsRef?: React.MutableRefObject<WebSocket | null>
}

export const DroneSimulationCard: React.FC<Props> = ({
  data,
  connected,
  onToggleConnect,
  wsRef,
}) => {
  return (
    <Card className="mx-auto w-full max-w-2xl rounded-2xl border border-gray-200 bg-gradient-to-br from-white to-gray-50 shadow-md transition-all hover:shadow-lg dark:border-gray-800 dark:from-gray-900 dark:to-gray-800">
      <CardHeader className="flex flex-row items-center justify-between border-b border-gray-100 pb-3 dark:border-gray-700">
        <CardTitle className="flex items-center gap-2 text-lg font-semibold text-gray-800 sm:text-xl dark:text-gray-100">
          <Gauge className="h-5 w-5 text-blue-500" />
          드론 상태
        </CardTitle>
        <Badge
          variant="default"
          className={`flex items-center gap-1 px-3 py-1 text-sm ${
            connected
              ? "bg-green-500/10 text-green-600"
              : "bg-gray-500/10 text-gray-600"
          }`}
        >
          <Wifi className="h-3 w-3" /> {connected ? "연결됨" : "연결 안 됨"}
        </Badge>
      </CardHeader>

      <CardContent className="space-y-4 p-5 text-sm text-gray-800 sm:p-6 sm:text-base dark:text-gray-200">
        {/* 메인 데이터 그리드 */}
        <div className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-2">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">고도:</span>
            <span className="font-medium">
              {connected && data?.altitude !== undefined
                ? `${data.altitude.toFixed(1)} m`
                : "0.0 m"}
            </span>
          </div>

          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">속도:</span>
            <span className="font-medium">
              {connected && data?.speed !== undefined
                ? `${data.speed.toFixed(1)} m/s`
                : "0.0 m/s"}
            </span>
          </div>

          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">배터리:</span>
            <span className="flex items-center gap-1 font-medium">
              <Battery
                className={`h-4 w-4 ${
                  connected && data?.battery !== undefined
                    ? data.battery > 20
                      ? "text-green-500"
                      : data.battery > 10
                        ? "text-yellow-500"
                        : "text-red-500"
                    : "text-gray-400"
                }`}
              />
              {connected && data?.battery !== undefined
                ? `${data.battery.toFixed(1)}%`
                : "0%"}
            </span>
          </div>

          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">스로틀:</span>
            <span className="flex items-center gap-1 font-medium">
              <Zap className="h-4 w-4 text-yellow-500" />
              {connected && data?.throttle !== undefined
                ? `${data.throttle.toFixed(0)}%`
                : "0%"}
            </span>
          </div>

          <div className="col-span-2 flex items-center justify-between">
            <span className="text-muted-foreground flex items-center gap-1">
              <Activity className="h-4 w-4 text-blue-500" /> 자세 (R/P/Y):
            </span>
            <span className="font-medium">
              {connected &&
              data?.roll !== undefined &&
              data?.pitch !== undefined &&
              data?.yaw !== undefined
                ? `${data.roll.toFixed(2)}° / ${data.pitch.toFixed(2)}° / ${data.yaw.toFixed(2)}°`
                : "0.00° / 0.00° / 0.00°"}
            </span>
          </div>

          <div className="col-span-2 flex flex-wrap items-center justify-between text-sm sm:text-base">
            <span className="text-muted-foreground flex items-center gap-1">
              <MapPin className="h-4 w-4 text-red-500" /> 위치:
            </span>
            <span className="break-all font-medium">
              {connected &&
              data?.latitude !== undefined &&
              data?.longitude !== undefined
                ? `${data.latitude.toFixed(5)}, ${data.longitude.toFixed(5)}`
                : "0.00000, 0.00000"}
            </span>
          </div>
        </div>

        {/* 버튼 그룹 */}
        <div className="flex justify-end gap-2 pt-4">
          <Button
            onClick={() => {
              if (connected && wsRef?.current?.readyState === WebSocket.OPEN) {
                wsRef.current.send(
                  JSON.stringify({ action: "reset_altitude_zero" }),
                )
                console.log("📏 고도 기준 리셋 명령 전송됨")
              } else {
                console.warn("⚠️ 드론이 연결되지 않음")
              }
            }}
            variant="secondary"
            size="sm"
            className="flex items-center gap-1 rounded-lg px-3 py-1 text-xs sm:text-sm"
          >
            <Ruler className="h-4 w-4 text-blue-500" /> 고도 기준 리셋
          </Button>

          <Button
            onClick={onToggleConnect}
            variant={connected ? "outline" : "default"}
            size="sm"
            className="rounded-lg px-4 py-2 text-sm font-medium sm:text-base"
          >
            {connected ? "연결 해제" : "연결"}
          </Button>
        </div>

        <div className="text-muted-foreground mt-3 border-t border-gray-100 pt-2 text-xs sm:text-sm dark:border-gray-700">
          마지막 업데이트:{" "}
          {data?.timestamp
            ? new Date(data.timestamp).toLocaleTimeString("ko-KR")
            : "N/A"}
        </div>
      </CardContent>
    </Card>
  )
}
