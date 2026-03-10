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
    ? "border-emerald-200/80 bg-emerald-50 text-emerald-700 dark:border-emerald-900/50 dark:bg-emerald-900/20 dark:text-emerald-200"
    : uiConnecting
      ? "border-amber-200/80 bg-amber-50 text-amber-700 dark:border-amber-900/50 dark:bg-amber-900/20 dark:text-amber-200"
      : "border-slate-200/70 bg-slate-50 text-slate-500 dark:border-slate-800/70 dark:bg-slate-900/60 dark:text-slate-400"

  const badgeLabel = connected
    ? "연결됨"
    : uiConnecting
      ? "연결 시도 중"
      : "대기 중"

  return (
    <Card className="mx-auto w-full max-w-none rounded-3xl border border-slate-200/70 bg-white/80 shadow-[0_18px_44px_-34px_rgba(15,23,42,0.4)] backdrop-blur-xl ring-1 ring-white/70 transition-all duration-300 dark:border-slate-800/60 dark:bg-slate-900/70 dark:ring-slate-800/70">
      <CardHeader className="flex flex-row items-center justify-between border-b border-slate-200/60 dark:border-slate-800/60">
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
              className="rounded-full border border-slate-200/70 px-4 py-1 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 dark:border-slate-700/70 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              연결
            </button>
          ) : (
            <button
              onClick={() => {
                setUiConnecting(false)
                onDisconnect?.()
              }}
              className="rounded-full border border-slate-900 bg-slate-900 px-4 py-1 text-xs font-semibold text-white transition hover:bg-slate-800 dark:border-slate-100 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white"
            >
              해제
            </button>
          )}
        </div>
      </CardHeader>

      <CardContent className="grid gap-3 pt-5 text-sm sm:grid-cols-2">
        <Row label="고도" value={v(data.altitude, " m")} />
        <Row label="속도" value={v(data.speed, " m/s")} />

        <div className="flex justify-between rounded-xl border border-slate-200/60 bg-slate-50/80 px-3 py-2 dark:border-slate-700/60 dark:bg-slate-800/60">
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
          className="sm:col-span-2"
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

        <div className="text-muted-foreground pt-1 text-xs sm:col-span-2">
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
  className,
}: {
  label: React.ReactNode
  value: React.ReactNode
  className?: string
}) {
  return (
    <div
      className={`flex justify-between rounded-xl border border-slate-200/60 bg-slate-50/80 px-3 py-2 dark:border-slate-700/60 dark:bg-slate-800/60 ${className ?? ""}`}
    >
      <span>{label}</span>
      <span>{value}</span>
    </div>
  )
}
