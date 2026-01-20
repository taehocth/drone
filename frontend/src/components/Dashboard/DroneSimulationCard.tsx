import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Wifi, Gauge, Battery, MapPin } from "lucide-react"
import React, { useEffect, useState } from "react"
import type { DroneData } from "./DroneSimulation"

interface Props {
  data: DroneData
  connected: boolean // 실제 backend 연결 상태
  onConnect?: () => void
  onDisconnect?: () => void
}

export const DroneSimulationCard: React.FC<Props> = ({
  data,
  connected,
  onConnect,
  onDisconnect,
}) => {
  /**
   * uiConnecting
   * - 사용자가 "연결" 버튼을 눌렀는지 여부
   * - backend가 waiting이든 말든 UI는 즉시 반응해야 함
   */
  const [uiConnecting, setUiConnecting] = useState(false)

  /* =========================
   * Map position sync
   * ========================= */
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

  /**
   * 실제 연결이 끊기면 UI 연결 상태도 같이 초기화
   */
  useEffect(() => {
    if (!connected) {
      setUiConnecting(false)
    }
  }, [connected])

  const v = (n?: number, unit = "") =>
    typeof n === "number" ? `${n.toFixed(2)}${unit}` : "N/A"

  /* =========================
   * UI State derived values
   * ========================= */
  const isActive = connected || uiConnecting

  const badgeClass = connected
    ? "border-green-200 bg-green-50 text-green-700"
    : uiConnecting
      ? "border-yellow-200 bg-yellow-50 text-yellow-700"
      : "border-gray-200 bg-gray-50 text-gray-500"

  const badgeLabel = connected
    ? "연결됨"
    : uiConnecting
      ? "연결 시도 중"
      : "대기 중"

  return (
    <Card className="mx-auto w-full max-w-2xl rounded-2xl">
      {/* =========================
       * Header
       * ========================= */}
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2">
          <Gauge className="h-5 w-5 text-blue-500" />
          드론 상태
        </CardTitle>

        <div className="flex items-center gap-2">
          <Badge className={badgeClass}>
            <Wifi className="mr-1 h-3 w-3" />
            {badgeLabel}
          </Badge>

          {!isActive ? (
            <button
              onClick={() => {
                setUiConnecting(true)
                onConnect?.()
              }}
              className="hover:bg-muted rounded-md border px-2 py-1 text-xs font-medium"
            >
              연결
            </button>
          ) : (
            <button
              onClick={() => {
                setUiConnecting(false)
                onDisconnect?.()
              }}
              className="hover:bg-muted rounded-md border px-2 py-1 text-xs font-medium"
            >
              해제
            </button>
          )}
        </div>
      </CardHeader>

      {/* =========================
       * Content
       * ========================= */}
      <CardContent className="space-y-3 text-sm">
        <div className="flex justify-between">
          <span>고도</span>
          <span>{v(data.altitude, " m")}</span>
        </div>

        <div className="flex justify-between">
          <span>속도</span>
          <span>{v(data.speed, " km/h")}</span>
        </div>

        <div className="flex justify-between">
          <span>배터리</span>
          <span className="flex items-center gap-1">
            <Battery className="h-4 w-4" />
            {typeof data.battery === "number"
              ? `${data.battery.toFixed(0)} %`
              : "N/A"}
          </span>
        </div>

        <div className="flex justify-between">
          <span>자세 (R / P / Y)</span>
          <span>
            {v(data.roll, "°")} / {v(data.pitch, "°")} / {v(data.yaw, "°")}
          </span>
        </div>

        <div className="flex justify-between">
          <span className="flex items-center gap-1">
            <MapPin className="h-4 w-4 text-red-500" />
            위치
          </span>
          <span>
            {typeof data.latitude === "number" &&
            typeof data.longitude === "number"
              ? `${data.latitude.toFixed(5)}, ${data.longitude.toFixed(5)}`
              : "GPS 없음"}
          </span>
        </div>

        <div className="text-muted-foreground pt-2 text-xs">
          마지막 업데이트:{" "}
          {data.timestamp
            ? new Date(data.timestamp).toLocaleTimeString("ko-KR")
            : "N/A"}
        </div>
      </CardContent>
    </Card>
  )
}
