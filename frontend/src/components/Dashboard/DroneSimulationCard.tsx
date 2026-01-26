import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Wifi, Gauge, Battery, MapPin } from "lucide-react"
import React, { useEffect, useState, memo, useRef } from "react"
import type { DroneData } from "./DroneSimulation"

/* =========================
 * Utils (컴포넌트 밖)
 * ========================= */

const v = (n?: number, unit = "") =>
  typeof n === "number" ? `${n.toFixed(2)}${unit}` : "N/A"

const vInt = (n?: number, unit = "") =>
  typeof n === "number" ? `${Math.round(n)}${unit}` : "N/A"

interface Props {
  data: DroneData
  connected: boolean
  onConnect?: () => void
  onDisconnect?: () => void
}

export const DroneSimulationCard = memo(function DroneSimulationCard({
  data,
  connected,
  onConnect,
  onDisconnect,
}: Props) {
  const [uiConnecting, setUiConnecting] = useState(false)

  /* =========================
   * Map sync (throttled)
   * ========================= */
  const lastMapEmitRef = useRef(0)

  useEffect(() => {
    const now = performance.now()
    if (now - lastMapEmitRef.current < 200) return // 🔥 5Hz 제한
    lastMapEmitRef.current = now

    if (
      typeof data.latitude === "number" &&
      typeof data.longitude === "number"
    ) {
      window.dispatchEvent(
        new CustomEvent("dronePositionUpdate", {
          detail: {
            lat: data.latitude,
            lng: data.longitude,
            yaw: data.yawInt ?? 0, // 🔥 정수 yaw
          },
        }),
      )
    }
  }, [data.latitude, data.longitude, data.yawInt])

  useEffect(() => {
    if (!connected) setUiConnecting(false)
  }, [connected])

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
              className="rounded-md border px-2 py-1 text-xs"
            >
              연결
            </button>
          ) : (
            <button
              onClick={() => {
                setUiConnecting(false)
                onDisconnect?.()
              }}
              className="rounded-md border px-2 py-1 text-xs"
            >
              해제
            </button>
          )}
        </div>
      </CardHeader>

      <CardContent className="space-y-3 text-sm">
        <Row label="고도" value={v(data.altitude, " m")} />
        <Row label="속도" value={v(data.speed, " km/h")} />

        <div className="flex justify-between">
          <span>배터리</span>
          <span className="flex items-center gap-1">
            <Battery className="h-4 w-4" />
            {typeof data.battery === "number"
              ? `${data.battery.toFixed(0)} %`
              : "N/A"}
          </span>
        </div>

        <Row
          label="자세 (R / P / Y)"
          value={`${vInt(data.rollInt, "°")} / ${vInt(
            data.pitchInt,
            "°",
          )} / ${vInt(data.yawInt, "°")}`}
        />

        <Row
          label={
            <span className="flex items-center gap-1">
              <MapPin className="h-4 w-4 text-red-500" />
              위치
            </span>
          }
          value={
            typeof data.latitude === "number" &&
            typeof data.longitude === "number"
              ? `${data.latitude.toFixed(5)}, ${data.longitude.toFixed(5)}`
              : "GPS 없음"
          }
        />

        <div className="pt-2 text-xs text-muted-foreground">
          마지막 업데이트:{" "}
          {data.timestamp
            ? new Date(data.timestamp).toLocaleTimeString("ko-KR")
            : "N/A"}
        </div>
      </CardContent>
    </Card>
  )
})

function Row({
  label,
  value,
}: {
  label: React.ReactNode
  value: React.ReactNode
}) {
  return (
    <div className="flex justify-between">
      <span>{label}</span>
      <span>{value}</span>
    </div>
  )
}